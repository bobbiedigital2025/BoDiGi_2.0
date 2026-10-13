/**
 * API Route: POST /api/generate/[projectId]/github-export
 * Pro/Enterprise perk — pushes all generated project files to a new
 * GitHub repository under the user's own account, using a GitHub token
 * the user stored via /api/setup-agent/keys (provider: 'github').
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveTier } from '@/lib/trial';
import { createServerClient } from '@/lib/supabase/server-client';
import { decrypt } from '@/lib/encryption';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase } from '@/lib/supabase/project-store';
import type { GeneratedFile } from '@/lib/agents/types';
import { ensureExportScaffold } from '@/lib/agents/export-scaffold';

const GH_API = 'https://api.github.com';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bodigi-app';
}

async function gh(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers || {}),
    },
  });
  return res;
}

/**
 * Retry wrapper for GitHub calls that can hit secondary rate limits (429)
 * or transient 5xx. Small linear backoff — these almost always clear in
 * a second or two, and the alternative is a lost export.
 */
async function ghRetry(path: string, token: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await gh(path, token, init);
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return last!;
}

function ghJson(init: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(init),
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }


  // 1. Tier check — GitHub export is a PAID Pro/Enterprise perk (admin bypasses).
  // Trial users are on borrowed Pro: resolveTier honors the clock, and
  // is_trial blocks code ownership until a real payment lands.
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role, is_trial, tier_expires_at')
    .eq('id', user.id)
    .single();

  const tier = resolveTier(profile);
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && (!['pro', 'enterprise'].includes(tier) || profile?.is_trial)) {
    return NextResponse.json(
      { error: 'GitHub export unlocks with a paid plan — your trial includes everything except code ownership. Upgrade to make the code yours.', upgrade: true },
      { status: 403 }
    );
  }

  // 2. Load the project (must belong to this user) — same load path as the
  // ZIP download: in-memory first, then Supabase (files live in project_files)
  const inMemory = getProject(projectId);
  let projectName: string;
  let specSummary = '';
  let files: GeneratedFile[];

  if (inMemory) {
    projectName = inMemory.state.name;
    files = inMemory.files;
  } else {
    const sbProject = await loadProjectFromSupabase(projectId);
    if (!sbProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    // Ownership check — loadProjectFromSupabase uses the service client (no RLS)
    const { data: owned } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    projectName = sbProject.state.name;
    specSummary = (sbProject.state.specs as { summary?: string } | null)?.summary || '';
    files = sbProject.files || [];
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files to export yet — wait for the build to finish.' }, { status: 400 });
  }

  // Export is the last line of defense for pre-scaffold-guarantee builds:
  // no project leaves BoDiGi without package.json/tsconfig/.gitignore.
  files = ensureExportScaffold(projectName, files, `${projectName}|${specSummary}`);

  // 3. Get the user's stored GitHub token
  const { data: keyRow } = await supabase
    .from('user_api_keys')
    .select('key_value_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'github')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let token: string | null = null;
  if (keyRow?.key_value_encrypted) {
    try {
      token = decrypt(keyRow.key_value_encrypted);
    } catch {
      token = null;
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: 'No GitHub token found. Connect your GitHub account first (Add a GitHub token in Setup).', needToken: true },
      { status: 400 }
    );
  }

  // Rate limit only once a real export is possible — failed eligibility and
  // missing-token responses must not burn the user's export budget.
  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.githubExport);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many exports in the last hour — give it a little while and try again.' }, { status: 429 });
  }

  // 4. Repo options
  const body = await request.json().catch(() => ({}));
  const repoName = slugify(body.repoName || projectName || 'bodigi-app');
  const isPrivate = body.private !== false; // default private

  // 5. Verify token works
  const userRes = await gh('/user', token);
  if (!userRes.ok) {
    return NextResponse.json(
      { error: 'Your GitHub token was rejected. Re-add it in Setup (it may have expired or been revoked).' },
      { status: 400 }
    );
  }
  const ghUser = await userRes.json();

  // 6. Create the repo (409 = already exists → use it)
  const createRes = await gh('/user/repos', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repoName,
      description: `Built with BoDiGi 2.0 — ${projectName}`,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!createRes.ok && createRes.status !== 422 && createRes.status !== 409) {
    const errText = await createRes.text();
    return NextResponse.json(
      { error: `GitHub refused to create the repo: ${createRes.status}. Your token may lack repo-creation permissions.` },
      { status: 400 }
    );
  }

  const fullName = `${ghUser.login}/${repoName}`;

  // 7. Push all files as ONE atomic commit via the Git Trees API.
  //
  // The old implementation looped the Contents API per file — 2 API calls
  // per file (GET sha + PUT), one commit per file. On bigger apps that hit
  // GitHub's secondary rate limits mid-loop and dropped files: the classic
  // "some pages failed to push" bug. Tree + commit + ref update is ~4 calls
  // total, all-or-nothing: partial exports are now impossible.

  // Learn the default branch (main for auto_init repos; a pre-existing repo
  // could use anything).
  const repoInfo = await ghRetry(`/repos/${fullName}`, token);
  const repoJson = repoInfo.ok ? ((await repoInfo.json()) as { default_branch?: string }) : {};
  const branch = repoJson.default_branch || 'main';

  // Base commit + tree, if the repo already has history (auto_init gives it
  // one; a manually-created empty repo has none — handled below).
  let baseSha: string | null = null;
  let baseTree: string | undefined;
  const refRes = await ghRetry(`/repos/${fullName}/git/ref/heads/${branch}`, token);
  if (refRes.ok) {
    const refJson = (await refRes.json()) as { object?: { sha?: string } };
    baseSha = refJson.object?.sha ?? null;
  }
  if (baseSha) {
    const baseCommitRes = await ghRetry(`/repos/${fullName}/git/commits/${baseSha}`, token);
    if (baseCommitRes.ok) {
      baseTree = ((await baseCommitRes.json()) as { tree?: { sha?: string } }).tree?.sha;
    }
  }

  // One tree containing every file (utf-8 content inline — no per-file
  // blobs, no base64, no URL-encoding edge cases).
  const treeRes = await ghRetry(`/repos/${fullName}/git/trees`, token, ghJson({
    ...(baseTree ? { base_tree: baseTree } : {}),
    tree: files.map((file) => ({
      path: file.path.replace(/^\/+/, ''),
      mode: '100644',
      type: 'blob',
      content: file.content,
    })),
  }));
  if (!treeRes.ok) {
    const detail = (await treeRes.text()).slice(0, 200);
    return NextResponse.json(
      { error: `GitHub rejected the file tree (${treeRes.status}). ${detail}` },
      { status: 502 }
    );
  }
  const treeSha = ((await treeRes.json()) as { sha: string }).sha;

  // One commit pointing at that tree.
  const commitRes = await ghRetry(`/repos/${fullName}/git/commits`, token, ghJson({
    message: `BoDiGi 2.0 export: ${projectName}`,
    tree: treeSha,
    ...(baseSha ? { parents: [baseSha] } : {}),
  }));
  if (!commitRes.ok) {
    const detail = (await commitRes.text()).slice(0, 200);
    return NextResponse.json(
      { error: `GitHub rejected the export commit (${commitRes.status}). ${detail}` },
      { status: 502 }
    );
  }
  const commitSha = ((await commitRes.json()) as { sha: string }).sha;

  // Move the branch pointer (or create it for a previously-empty repo).
  const updateRefRes = baseSha
    ? await ghRetry(`/repos/${fullName}/git/refs/heads/${branch}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: commitSha }),
      })
    : await ghRetry(`/repos/${fullName}/git/refs`, token, ghJson({
        ref: `refs/heads/${branch}`,
        sha: commitSha,
      }));
  if (!updateRefRes.ok) {
    const detail = (await updateRefRes.text()).slice(0, 200);
    return NextResponse.json(
      { error: `GitHub couldn't update the ${branch} branch (${updateRefRes.status}). ${detail}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    repo: `https://github.com/${fullName}`,
    repoName: fullName,
    pushed: files.length,
    failed: 0,
    failures: [],
  });
}
