/**
 * API Route: POST /api/generate/[projectId]/day2
 * The Day-2 Agent — post-launch maintenance and evolution.
 *
 * The user reports an issue or requests a feature. The agent:
 *   1. Makes the fix in BoDiGi (same safe surgical-edit flow as modify:
 *      protected files untouched, snapshot before writing)
 *   2. If the project was exported to GitHub (user's stored token),
 *      pushes the changed files to a fix branch and opens a Pull Request
 *      so the user's repo and their BoDiGi app stay in sync.
 *
 * Pro/Enterprise perk (admin bypasses), same gate as modify.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { checkModifyQuota } from '@/lib/quota';
import { callAI, hasAIKey } from '@/lib/agents/ai-client';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase, saveProject } from '@/lib/supabase/project-store';
import type { GeneratedFile } from '@/lib/agents/types';

const FORBIDDEN_PATH = /(^|\/)(\.env|.*auth.*|.*middleware.*|schema\.sql|seed\.sql|api\/.*route\.ts)/i;
const MAX_FILE_CHARS = 40_000;
const GH_API = 'https://api.github.com';

interface ModificationResult {
  edits: Array<{ path: string; content: string; summary: string }>;
  explanation: string;
  declined?: string;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52) || 'bodigi-app';
}

function encodeGitPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function gh(path: string, token: string, init?: RequestInit) {
  return fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.githubExport);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests — try again in a moment.' }, { status: 429 });
  }

  // Tier gate (same as modify)
  const adminRead = createAdminClient();
  const { data: profile } = await adminRead.from('profiles').select('tier, role').eq('id', user.id).single();
  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  let trialRemaining: number | null = null;
  if (!isAdmin && !['pro', 'enterprise'].includes(tier)) {
    if (tier === 'free') {
      const trial = await checkModifyQuota(user.id);
      if (trial.allowed) {
        trialRemaining = 3 - (trial.used + 1);
      } else {
        return NextResponse.json({ error: trial.message, upgrade: true }, { status: 403 });
      }
    } else {
    return NextResponse.json(
      { error: `The Day-2 Agent is a Pro feature — you're signed in as ${user.email || 'unknown'} (${tier}).`, upgrade: true },
      { status: 403 }
    );
    }
  }

  if (!hasAIKey()) {
    return NextResponse.json({ error: 'AI is not configured on this deployment.' }, { status: 500 });
  }

  const { instruction } = await request.json().catch(() => ({}));
  if (!instruction || typeof instruction !== 'string' || instruction.trim().length < 3) {
    return NextResponse.json({ error: 'Describe the issue or the feature you want.' }, { status: 400 });
  }
  if (instruction.length > 2000) {
    return NextResponse.json({ error: 'Keep it under 2000 characters — one change at a time works best.' }, { status: 400 });
  }

  // Load project + ownership
  const { data: owned } = await supabase.from('projects').select('id, user_id').eq('id', projectId).maybeSingle();
  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const inMemory = getProject(projectId);
  let projectName: string;
  let projectIdea: string;
  let files: GeneratedFile[];
  const userId: string = owned.user_id;
  let fullState: any = null;
  let progress = 100;

  if (inMemory) {
    projectName = inMemory.state.name;
    projectIdea = inMemory.state.idea;
    files = inMemory.files;
    fullState = inMemory.state;
    progress = inMemory.progress;
  } else {
    const sbProject = await loadProjectFromSupabase(projectId);
    if (!sbProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    projectName = sbProject.state.name;
    projectIdea = sbProject.state.idea;
    files = sbProject.files || [];
    fullState = sbProject.state;
    progress = sbProject.progress;
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files to maintain yet — wait for the build to finish.' }, { status: 400 });
  }

  // Build editable file context (protected files hidden)
  const editableFiles = files.filter((f) => !FORBIDDEN_PATH.test(f.path));
  const fileContext = editableFiles
    .map((f) => {
      const content = f.content.length > MAX_FILE_CHARS ? f.content.slice(0, MAX_FILE_CHARS) + '\n// ... [truncated]' : f.content;
      return `===== FILE: ${f.path} =====\n${content}`;
    })
    .join('\n\n');

  // Ask the AI for surgical edits — Day-2 framing (issue reports welcome)
  const systemPrompt = `You are the BoDiGi Day-2 Agent — a senior maintenance engineer for a launched app. The owner reports issues or requests small features; you fix them safely.

ABSOLUTE RULES:
- Smallest possible change that resolves the issue. No drive-by refactors.
- Output ONLY files that need to change, with their COMPLETE new content.
- NEVER modify: authentication logic, middleware, database schema/seed SQL, API route handlers, environment config. Those files are not shown to you.
- NEVER add new npm dependencies. Use what's already imported or plain CSS/Tailwind.
- If the report is vague, make the most likely safe fix and note your assumption in the explanation — do not ask questions back.
- If the fix would break the app or touch protected files, decline and explain what WOULD work.
- Match the existing code style exactly.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "edits": [
    { "path": "exact/path/from/input", "content": "the complete new file content", "summary": "one-line description of what changed" }
  ],
  "explanation": "2-3 sentences for the user: what was wrong, what you changed, why it's safe",
  "declined": null
}
If declining: { "edits": [], "explanation": "", "declined": "why, plus the safe alternative" }`;

  const userPrompt = `APP: ${projectName}
IDEA: ${projectIdea}

OWNER REPORT (issue or feature request):
${instruction.trim()}

CURRENT FILES (protected files like auth/schema/api-routes are hidden and cannot be changed):
${fileContext}

Return the JSON with only the files that need to change.`;

  let result: ModificationResult;
  try {
    const raw = await callAI(systemPrompt, userPrompt);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    result = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: 'The AI could not produce a safe fix for that report. Try rephrasing it — include what you expected vs what happened.' },
      { status: 422 }
    );
  }

  if (result.declined) {
    return NextResponse.json({ declined: true, message: result.declined }, { status: 200 });
  }

  if (!result.edits || result.edits.length === 0) {
    return NextResponse.json({ declined: true, message: 'No changes were needed for that report.' }, { status: 200 });
  }

  // Validate edits
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const validEdits: typeof result.edits = [];
  for (const edit of result.edits) {
    if (FORBIDDEN_PATH.test(edit.path)) continue;
    if (!fileMap.has(edit.path)) continue;
    if (typeof edit.content !== 'string' || edit.content.length < 10) continue;
    validEdits.push(edit);
  }

  if (validEdits.length === 0) {
    return NextResponse.json({ error: 'The fix only touched protected files (auth, schema, or API routes) — those are locked for safety.' }, { status: 422 });
  }

  // Snapshot before writing (rollback path — same as modify)
  const snapshot = validEdits.map((e) => ({ path: e.path, content: fileMap.get(e.path)!.content }));
  await adminRead.from('project_logs').insert({
    project_id: projectId,
    timestamp: Date.now(),
    agent: 'backend',
    level: 'info',
    message: `MOD-SNAPSHOT before "DAY-2: ${instruction.slice(0, 120)}": ${JSON.stringify(snapshot).slice(0, 50000)}`,
  });

  // Apply + persist in BoDiGi
  for (const edit of validEdits) {
    fileMap.get(edit.path)!.content = edit.content;
  }
  const newFiles = Array.from(fileMap.values());
  if (inMemory) {
    inMemory.files.length = 0;
    inMemory.files.push(...newFiles);
  }
  await saveProject(userId, projectId, fullState, newFiles, progress);

  // GitHub sync: push changed files to a fix branch + open a PR (best-effort)
  let prUrl: string | null = null;
  let prNote: string | null = null;
  try {
    const { data: keyRow } = await supabase
      .from('user_api_keys')
      .select('key_value_encrypted')
      .eq('user_id', userId)
      .eq('provider', 'github')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (keyRow?.key_value_encrypted) {
      const token = decrypt(keyRow.key_value_encrypted);
      const userRes = await gh('/user', token);
      if (userRes.ok) {
        const ghUser = await userRes.json();
        const repoName = slugify(projectName);

        // Branch off the default branch
        const repoRes = await gh(`/repos/${ghUser.login}/${repoName}`, token);
        if (repoRes.ok) {
          const repo = await repoRes.json();
          const refRes = await gh(`/repos/${ghUser.login}/${repoName}/git/ref/heads/${repo.default_branch}`, token);
          if (refRes.ok) {
            const ref = await refRes.json();
            const branch = `bodigi/day2-${Date.now().toString(36)}`;
            const createBranch = await gh(`/repos/${ghUser.login}/${repoName}/git/refs`, token, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
            });

            if (createBranch.ok) {
              // Push each changed file to the branch
              let pushed = 0;
              for (const edit of validEdits) {
                const path = edit.path.replace(/^\/+/, '');
                const checkRes = await gh(`/repos/${ghUser.login}/${repoName}/contents/${encodeGitPath(path)}?ref=${branch}`, token);
                let sha: string | undefined;
                if (checkRes.ok) sha = (await checkRes.json()).sha;
                const putRes = await gh(`/repos/${ghUser.login}/${repoName}/contents/${encodeGitPath(path)}`, token, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: `BoDiGi Day-2 fix: ${edit.summary || path}`,
                    content: Buffer.from(edit.content, 'utf-8').toString('base64'),
                    branch,
                    ...(sha ? { sha } : {}),
                  }),
                });
                if (putRes.ok) pushed += 1;
              }

              if (pushed > 0) {
                const prRes = await gh(`/repos/${ghUser.login}/${repoName}/pulls`, token, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: `BoDiGi Day-2: ${instruction.slice(0, 60)}`,
                    head: branch,
                    base: repo.default_branch,
                    body: `**Owner report:** ${instruction}\n\n**What changed:**\n${validEdits.map((e) => `- \`${e.path}\` — ${e.summary || 'updated'}`).join('\n')}\n\n${result.explanation}\n\n_Generated by the BoDiGi 2.0 Day-2 Agent. Merge to sync your repo with your live app._`,
                  }),
                });
                if (prRes.ok) {
                  prUrl = (await prRes.json()).html_url;
                } else if (prRes.status === 422) {
                  prNote = 'Branch pushed, but a PR already exists for it — check your repo.';
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // GitHub sync is best-effort — the BoDiGi fix already landed
  }

  return NextResponse.json({
    success: true,
    explanation: result.explanation,
    changed: validEdits.map((e) => ({ path: e.path, summary: e.summary })),
    prUrl,
    prNote,
    trialRemaining,
    note: prUrl
      ? 'Fixed in your app and a Pull Request is open on your GitHub repo — merge it to keep your code in sync.'
      : 'Fixed in your app. (No GitHub sync — connect a GitHub token in Setup to also get Pull Requests.)',
  });
}
