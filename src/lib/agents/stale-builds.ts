/**
 * Stale-build watchdog.
 *
 * Builds run inside a serverless function. If that function is interrupted
 * (reap, hard timeout, crash) nothing updates the project row, so builds
 * used to sit in 'building' forever with a spinner that never ends.
 *
 * This module is the guarantee that never happens again: any project in an
 * active status with no save for STALE_MINUTES minutes is marked failed
 * with an explanatory log line, so the dashboard can show the truth and the
 * user can retry instead of waiting forever.
 *
 * Liveness signal: the pipeline saves state after every task (incremental
 * saves bump projects.updated_at), so a stale updated_at means the runner
 * is gone, not just slow.
 */

import { createAdminClient } from '@/lib/supabase/server';

export const STALE_MINUTES = 15;

const ACTIVE_STATUSES = ['planning', 'building', 'testing', 'deploying'] as const;

function hasSupabaseAdmin(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Mark a single project failed and leave an explanatory build-log line.
 * Used by the watchdog AND by the pipeline's crash handler.
 */
export async function markBuildFailed(projectId: string, reason: string): Promise<void> {
  if (!hasSupabaseAdmin()) return;
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await supabase
    .from('projects')
    .update({ status: 'failed', updated_at: now })
    .eq('id', projectId);

  // project_logs.timestamp is a bigint (epoch ms), matching the rows the
  // pipeline writes — NOT a timestamptz.
  await supabase.from('project_logs').insert({
    project_id: projectId,
    timestamp: Date.now(),
    agent: 'devops',
    level: 'error',
    message: reason,
  });
}

/**
 * Flip every project stuck in an active status (no save for STALE_MINUTES)
 * to failed. Returns how many were swept. Safe to call on every dashboard
 * load — it is one cheap indexed select when nothing is stale.
 */
export async function sweepStaleBuilds(): Promise<number> {
  if (!hasSupabaseAdmin()) return 0;
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from('projects')
    .select('id')
    .in('status', [...ACTIVE_STATUSES])
    .lt('updated_at', cutoff);

  if (error || !stale || stale.length === 0) return 0;

  for (const row of stale) {
    await markBuildFailed(
      row.id,
      `Build stalled — no progress was saved for ${STALE_MINUTES} minutes, so the build runner was interrupted. Nothing is lost: start a new build from the dashboard to try again.`
    ).catch(() => undefined);
  }
  return stale.length;
}
