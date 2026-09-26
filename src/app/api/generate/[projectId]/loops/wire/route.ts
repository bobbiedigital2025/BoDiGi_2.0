/**
 * API Route: POST /api/generate/[projectId]/loops/wire
 * The magic step: takes the owner's configured loops and generates the
 * ACTUAL loop code into their app — a rewards page, tracking, and
 * redemption logic where rewards unlock ONLY after the action completes.
 * Uses the same safe surgical-edit pipeline as modify (protected files
 * untouched, snapshot first). Pro/Enterprise perk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { checkAppAiQuota } from '@/lib/quota';
import { callAI, hasAIKey, setUsageContext } from '@/lib/agents/ai-client';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase, saveProject } from '@/lib/supabase/project-store';
import type { GeneratedFile } from '@/lib/agents/types';

const FORBIDDEN_PATH = /(^|\/)(\.env|.*auth.*|.*middleware.*|schema\.sql|seed\.sql)/i;
const MAX_FILE_CHARS = 40_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.githubExport);
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Tier gate — wiring AI code into the app is a Pro perk
  const adminRead = createAdminClient();
  const { data: profile } = await adminRead.from('profiles').select('tier, role').eq('id', user.id).single();
  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && !['pro', 'enterprise'].includes(tier)) {
    return NextResponse.json(
      { error: `Loop wiring is a Pro feature — you're signed in as ${user.email || 'unknown'} (${tier}). Configure loops free, wire them with Pro.`, upgrade: true },
      { status: 403 }
    );
  }

  if (!hasAIKey()) return NextResponse.json({ error: 'AI is not configured on this deployment.' }, { status: 500 });

  // Per-app AI cap — the sustainability guard (applies to every tier)
  const appQuota = await checkAppAiQuota(user.id, projectId);
  if (!appQuota.allowed) {
    return NextResponse.json({ error: appQuota.message, upgrade: true }, { status: 403 });
  }

  // Ownership + load
  const { data: owned } = await supabase.from('projects').select('id, user_id').eq('id', projectId).maybeSingle();
  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: loops } = await adminRead.from('engagement_loops').select('*').eq('project_id', projectId).eq('active', true);
  if (!loops || loops.length === 0) {
    return NextResponse.json({ error: 'No active loops to wire — create one first.' }, { status: 400 });
  }

  const inMemory = getProject(projectId);
  let projectName: string;
  let projectIdea: string;
  let files: GeneratedFile[];
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
    if (!sbProject) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    projectName = sbProject.state.name;
    projectIdea = sbProject.state.idea;
    files = sbProject.files || [];
    fullState = sbProject.state;
    progress = sbProject.progress;
  }

  if (files.length === 0) return NextResponse.json({ error: 'No files yet — wait for the build.' }, { status: 400 });

  // Build the loop spec for the AI
  const loopSpec = loops.map((l: any) => ({
    action: l.action,
    actionLabel: l.action_label,
    reward: l.reward,
    rewardLabel: l.reward_label,
    config: l.reward_config ? JSON.parse(l.reward_config) : null,
  }));

  const editableFiles = files.filter((f) => !FORBIDDEN_PATH.test(f.path));
  const fileContext = editableFiles
    .map((f) => {
      const content = f.content.length > MAX_FILE_CHARS ? f.content.slice(0, MAX_FILE_CHARS) + '\n// ... [truncated]' : f.content;
      return `===== FILE: ${f.path} =====\n${content}`;
    })
    .join('\n\n');

  const systemPrompt = `You are the BoDiGi Engagement Loop Agent. You wire a gamified engagement loop into a Next.js app: a rewards system where users complete actions and unlock rewards ONLY after completing them.

The app gets:
1. A "Rewards" page (src/app/(dashboard)/rewards/page.tsx or matching the app's route structure) showing each loop as a card: the action, the reward, a locked/unlocked state, and a CTA button
2. Action tracking: completing an action (e.g. clicking "Try the app", copying an invite link, sharing to Facebook via a share URL, upgrading) records it — use localStorage keyed per loop (loop_<action>) since this app may not have a rewards table; keep it dependency-free
3. Redemption gating: the reward (discount code, 24h feature unlock) is ONLY revealed/redeemable after the action is marked complete. For time-boxed rewards (free_feature_24h), store the unlock timestamp and check expiry
4. Share actions generate real share URLs (facebook.com/sharer with the app URL, X intent links)
5. Discount rewards show a code the owner sets (or a placeholder code REWARD10 the owner can edit)

ABSOLUTE RULES:
- Match the app's existing design system exactly (colors, components, imports it already uses)
- NEVER modify: auth, middleware, schema, .env, or existing API route handlers. If a nav exists, you MAY add a Rewards link to it — that file is editable
- NEVER add npm dependencies — use what's imported or plain Tailwind
- Output ONLY files that need to change with COMPLETE content

OUTPUT — ONLY valid JSON, no fences:
{"edits":[{"path":"...","content":"...","summary":"..."}],"explanation":"2-3 sentences: what the user's app now does"}`;

  const userPrompt = `APP: ${projectName} (${projectIdea})

ENGAGEMENT LOOPS TO WIRE:
${JSON.stringify(loopSpec, null, 2)}

CURRENT FILES:
${fileContext}

Generate the loop wiring. Return only the JSON.`;

  let result: { edits: Array<{ path: string; content: string; summary: string }>; explanation: string };
  try {
    setUsageContext('loop_wire', user.id, projectId); const raw = await callAI(systemPrompt, userPrompt);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    result = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: 'The AI could not produce safe loop code — try again, or simplify your loops.' }, { status: 422 });
  }

  if (!result.edits || result.edits.length === 0) {
    return NextResponse.json({ error: 'No changes produced — try again.' }, { status: 422 });
  }

  // Validate: existing files or new rewards pages only, nothing protected
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const validEdits = result.edits.filter((e) =>
    !FORBIDDEN_PATH.test(e.path) &&
    typeof e.content === 'string' && e.content.length > 10 &&
    (fileMap.has(e.path) || /rewards/i.test(e.path))
  );

  if (validEdits.length === 0) {
    return NextResponse.json({ error: 'The generated code only touched protected files — refused for safety.' }, { status: 422 });
  }

  // Snapshot before writing
  const snapshot = validEdits.filter((e) => fileMap.has(e.path)).map((e) => ({ path: e.path, content: fileMap.get(e.path)!.content }));
  if (snapshot.length > 0) {
    await adminRead.from('project_logs').insert({
      project_id: projectId,
      timestamp: Date.now(),
      agent: 'backend',
      level: 'info',
      message: `MOD-SNAPSHOT before "LOOP-WIRE ${loops.length} loops": ${JSON.stringify(snapshot).slice(0, 50000)}`,
    });
  }

  // Apply: update existing, add new
  for (const edit of validEdits) {
    const existing = fileMap.get(edit.path);
    if (existing) existing.content = edit.content;
    else fileMap.set(edit.path, { path: edit.path, content: edit.content, agent: 'frontend', status: 'generated' } as GeneratedFile);
  }

  const newFiles = Array.from(fileMap.values());
  if (inMemory) {
    inMemory.files.length = 0;
    inMemory.files.push(...newFiles);
  }
  await saveProject(owned.user_id, projectId, fullState, newFiles, progress);

  // Mark loops wired
  await adminRead.from('engagement_loops').update({ wired_at: Date.now() }).eq('project_id', projectId).eq('active', true);

  return NextResponse.json({
    success: true,
    explanation: result.explanation,
    changed: validEdits.map((e) => ({ path: e.path, summary: e.summary })),
    loopsWired: loops.length,
  });
}
