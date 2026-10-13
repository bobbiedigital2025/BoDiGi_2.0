/**
 * API Route: POST /api/generate/[projectId]/resume?depth=N
 *
 * The relay handoff. A full build can take 10–25 minutes, but Vercel caps
 * any single function run at maxDuration (300s). So the pipeline chains:
 * when a runner sees it is about to cross its time budget, it saves state
 * and calls this route, which re-enters the pipeline where the last link
 * stopped — completed tasks are skipped, pending ones run.
 *
 * Internal only — secured with CRON_SECRET, exactly like the cron routes.
 *
 * Contract (agreed with the pipeline owner):
 *   - rehydrateProjectForResume() returns null when the project is missing
 *     OR already has a live run in this process (duplicate chain link) —
 *     respond 200 and no-op, never an error.
 *   - Respond 202 IMMEDIATELY after waitUntil(run). The parent lambda awaits
 *     this response before dying; running the pipeline synchronously first
 *     would hold the handoff open for the child's whole lifetime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { rehydrateProjectForResume, launchPipelineRun, getPipelineRun } from '@/lib/agents/pipeline';
import { sweepStaleBuilds } from '@/lib/agents/stale-builds';
import { createAdminClient } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The resume route is the headless heartbeat: chained builds pass through
  // here even when nobody is watching a dashboard (whose GET polls are the
  // other sweep trigger). Sweep so a build that stalls between links still
  // gets marked failed honestly instead of hanging forever.
  waitUntil(sweepStaleBuilds().catch(() => 0));

  const { projectId } = await params;
  const depthParam = new URL(request.url).searchParams.get('depth');
  const depth = depthParam ? Math.max(0, parseInt(depthParam, 10) || 0) : 0;

  // A no-op must name its cause. Record whether THIS process holds a live
  // run stash, then retry rehydrate once after a beat — a stash that is
  // mid-teardown (parent dying on this same instance) clears within ~2s.
  const stashPresent = () => getPipelineRun(projectId) !== null;
  let rehydrated = await rehydrateProjectForResume(projectId);
  if (!rehydrated && stashPresent()) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    rehydrated = await rehydrateProjectForResume(projectId);
  }
  if (!rehydrated) {
    // Not an error: duplicate chain link or project gone — the parent that
    // fired this must not retry alarm. The watchdog owns true stalls.
    const reason = stashPresent() ? 'run-stash-present-in-this-process' : 'no-stash-persisted-state-not-resumable';
    try {
      const supabase = createAdminClient();
      await supabase.from('project_logs').insert({
        project_id: projectId,
        agent: 'devops',
        level: 'error',
        timestamp: Date.now(),
        message: `Resume route no-oped (depth ${depth}): ${reason}`,
      });
    } catch {
      // Diagnostics must never break the handoff contract.
    }
    return NextResponse.json({ ok: true, note: 'not resumable or already running' });
  }

  const run = launchPipelineRun(projectId, rehydrated.idea, rehydrated.userId, depth);
  waitUntil(run);

  return NextResponse.json({ ok: true, projectId, depth }, { status: 202 });
}
