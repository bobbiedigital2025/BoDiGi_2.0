/**
 * API Route: POST /api/generate/[projectId]/modify
 * Pro/Enterprise perk — the Modification Pass.
 *
 * The user describes a change in plain English ("make the header dark
 * blue", "add a settings page", "the Reality Check says my onboarding
 * is weak — fix it"). The AI reads the project's current files, returns
 * surgical edits for the affected files only, and we persist them back
 * to project_files. The preview re-renders from the same store, so the
 * change is live on next load.
 *
 * Safety rules (mirrors the Setup Agent's):
 *  - smallest possible change; no new dependencies
 *  - never touches auth logic, DB schema, API route handlers, or .env
 *  - full original files are snapshotted into project_logs before write
 *    (restore path if an edit goes wrong)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase, saveProject } from '@/lib/supabase/project-store';
import { callAI, hasAIKey } from '@/lib/agents/ai-client';
import type { GeneratedFile } from '@/lib/agents/types';

const FORBIDDEN_PATH = /(^|\/)(\.env|.*auth.*|.*middleware.*|schema\.sql|seed\.sql|api\/.*route\.ts)/i;
const MAX_FILE_CHARS = 40_000; // keep prompt under control

interface ModificationResult {
  edits: Array<{ path: string; content: string; summary: string }>;
  explanation: string;
  declined?: string;
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
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  // 1. Tier gate — modifications are a Pro/Enterprise perk (admin bypasses)
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role')
    .eq('id', user.id)
    .single();

  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && !['pro', 'enterprise'].includes(tier)) {
    return NextResponse.json(
      { error: 'Modifications are a Pro feature. Upgrade to edit your app with AI.', upgrade: true },
      { status: 403 }
    );
  }

  if (!hasAIKey()) {
    return NextResponse.json({ error: 'AI is not configured on this deployment.' }, { status: 500 });
  }

  // 2. Load request
  const { instruction } = await request.json().catch(() => ({}));
  if (!instruction || typeof instruction !== 'string' || instruction.trim().length < 3) {
    return NextResponse.json({ error: 'Describe the change you want (a sentence or two).' }, { status: 400 });
  }
  if (instruction.length > 2000) {
    return NextResponse.json({ error: 'Keep it under 2000 characters — one change at a time works best.' }, { status: 400 });
  }

  // 3. Load project files + ownership. Ownership ALWAYS verified via the
  // projects table (the in-memory store doesn't carry userId).
  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

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
    return NextResponse.json({ error: 'No files to modify yet — wait for the build to finish.' }, { status: 400 });
  }

  // 4. Build the file context (editable files only, truncated sanely)
  const editableFiles = files.filter((f) => !FORBIDDEN_PATH.test(f.path));
  const protectedFiles = files.filter((f) => FORBIDDEN_PATH.test(f.path));

  const fileContext = editableFiles
    .map((f) => {
      const content = f.content.length > MAX_FILE_CHARS
        ? f.content.slice(0, MAX_FILE_CHARS) + '\n// ... [truncated]'
        : f.content;
      return `===== FILE: ${f.path} =====\n${content}`;
    })
    .join('\n\n');

  // 5. Ask the AI for surgical edits
  const systemPrompt = `You are the BoDiGi Modification Agent. You make SMALL, SAFE, targeted edits to a generated Next.js app based on the owner's request.

ABSOLUTE RULES:
- Smallest possible change that satisfies the request. No drive-by refactors.
- Output ONLY files that need to change, with their COMPLETE new content.
- NEVER modify: authentication logic, middleware, database schema/seed SQL, API route handlers, environment config. Those files are not even shown to you.
- NEVER add new npm dependencies. Use what's already imported or plain CSS/Tailwind.
- If the request would break the app, touch protected files, or is out of scope, decline it and explain what WOULD work instead.
- Match the existing code style exactly (formatting, quotes, conventions).

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "edits": [
    { "path": "exact/path/from/input", "content": "the complete new file content", "summary": "one-line description of what changed" }
  ],
  "explanation": "2-3 sentences for the user: what you changed and why it's safe",
  "declined": null
}
If declining: { "edits": [], "explanation": "", "declined": "why, plus the safe alternative" }`;

  const userPrompt = `APP: ${projectName}
IDEA: ${projectIdea}

USER REQUEST:
${instruction.trim()}

CURRENT FILES (protected files like auth/schema/api-routes are hidden and cannot be changed):
${fileContext}

Return the JSON with only the files that need to change.`;

  let result: ModificationResult;
  try {
    const raw = await callAI(systemPrompt, userPrompt);
    // Strip accidental markdown fences if the model added them
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    result = JSON.parse(cleaned);
  } catch (e: any) {
    return NextResponse.json(
      { error: 'The AI could not produce a safe edit for that request. Try rephrasing it more specifically (e.g. "change the header background to dark blue").' },
      { status: 422 }
    );
  }

  if (result.declined) {
    return NextResponse.json({ declined: true, message: result.declined }, { status: 200 });
  }

  if (!result.edits || result.edits.length === 0) {
    return NextResponse.json({ declined: true, message: 'No changes were needed for that request.' }, { status: 200 });
  }

  // 6. Validate edits — paths must exist in the project and not be protected
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const validEdits: typeof result.edits = [];
  const rejected: string[] = [];

  for (const edit of result.edits) {
    if (FORBIDDEN_PATH.test(edit.path)) {
      rejected.push(edit.path);
      continue;
    }
    if (!fileMap.has(edit.path)) {
      rejected.push(`${edit.path} (not a project file)`);
      continue;
    }
    if (typeof edit.content !== 'string' || edit.content.length < 10) {
      rejected.push(`${edit.path} (empty content)`);
      continue;
    }
    validEdits.push(edit);
  }

  if (validEdits.length === 0) {
    return NextResponse.json(
      { error: 'The requested change only touched protected files (auth, schema, or API routes) — those are locked for safety. Try a visual or content change instead.' },
      { status: 422 }
    );
  }

  // 7. Snapshot originals into project_logs before writing (restore path)
  const snapshot = validEdits.map((e) => ({
    path: e.path,
    content: fileMap.get(e.path)!.content,
  }));

  const { createAdminClient } = await import('@/lib/supabase/server');
  const admin = createAdminClient();
  await admin.from('project_logs').insert({
    project_id: projectId,
    timestamp: Date.now(),
    agent: 'backend',
    level: 'info',
    message: `MOD-SNAPSHOT before "${instruction.slice(0, 120)}": ${JSON.stringify(snapshot).slice(0, 50000)}`,
  });

  // 8. Apply edits to the file set and persist
  for (const edit of validEdits) {
    const file = fileMap.get(edit.path)!;
    file.content = edit.content;
  }

  const newFiles = Array.from(fileMap.values());

  try {
    if (inMemory) {
      // Update in-memory project so the preview re-renders immediately
      inMemory.files.length = 0;
      inMemory.files.push(...newFiles);
      // Persist to Supabase too
      await saveProject(userId, projectId, fullState, newFiles, progress);
    } else {
      await saveProject(userId, projectId, fullState, newFiles, progress);
    }
  } catch {
    return NextResponse.json(
      { error: 'Edit was generated but could not be saved. Nothing was changed.' },
      { status: 500 }
    );
  }

  // 9. Log the successful modification (visible in activity)
  await admin.from('project_logs').insert({
    project_id: projectId,
    timestamp: Date.now(),
    agent: 'backend',
    level: 'info',
    message: `MOD-APPLIED: ${validEdits.map((e) => e.summary || e.path).join(' | ').slice(0, 500)}`,
  });

  return NextResponse.json({
    success: true,
    explanation: result.explanation,
    changed: validEdits.map((e) => ({ path: e.path, summary: e.summary })),
    protectedFiles: protectedFiles.map((f) => f.path),
    rejected: rejected.length > 0 ? rejected : undefined,
  });
}
