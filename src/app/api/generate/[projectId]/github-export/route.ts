/**
 * API Route: POST /api/generate/[projectId]/github-export
 * Pro/Enterprise perk — pushes all generated project files to a new
 * GitHub repository under the user's own account, using a GitHub token
 * the user stored via /api/setup-agent/keys (provider: 'github').
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { decrypt } from '@/lib/encryption';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Rate limit exports
  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.keyStorage);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  // 1. Tier check — GitHub export is a Pro/Enterprise perk (admin bypasses)
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role')
    .eq('id', user.id)
    .single();

  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && !['pro', 'enterprise'].includes(tier)) {
    return NextResponse.json(
      { error: 'GitHub export is a Pro feature. Upgrade to export your code to GitHub.', upgrade: true },
      { status: 403 }
    );
  }

  // 2. Load the project (must belong to this user)
  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id, name, state')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

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

  // 4. Collect project files
  const body = await request.json().catch(() => ({}));
  const repoName = slugify(body.repoName || project.name || 'bodigi-app');
  const isPrivate = body.private !== false; // default private

  const state = (project.state as { files?: Array<{ path: string; content: string }> }) || {};
  const files = state.files || [];
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files to export yet — wait for the build to finish.' }, { status: 400 });
  }

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
      description: `Built with BoDiGi 2.0 — ${project.name}`,
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

  // 7. Push every file via the contents API (create-or-update)
  let pushed = 0;
  const failures: string[] = [];

  for (const file of files) {
    // Normalize path — strip leading slashes so it's relative
    const path = file.path.replace(/^\/+/, '');
    const content = Buffer.from(file.content, 'utf-8').toString('base64');

    // Check if file exists to get its SHA (needed for updates)
    const checkRes = await gh(`/repos/${fullName}/contents/${encodeURIComponent(path)}`, token);
    let sha: string | undefined;
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }

    const putRes = await gh(`/repos/${fullName}/contents/${encodeURIComponent(path)}`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `BoDiGi 2.0 export: add ${path}`,
        content,
        ...(sha ? { sha } : {}),
      }),
    });

    if (putRes.ok) pushed += 1;
    else failures.push(path);
  }

  return NextResponse.json({
    success: true,
    repo: `https://github.com/${fullName}`,
    repoName: fullName,
    pushed,
    failed: failures.length,
    failures: failures.slice(0, 10),
  });
}
