/**
 * Cancel Switch — paired hardening welded into the Concept Gate changeset
 * (Oct 22 lock). The Oct 22 incident: a cancelled build's relay completed
 * underneath and overwrote the kill — the cancel never bit.
 *
 * Three layers, so a cancel always lands:
 *   1. LOCAL SET   — same-process runs abort at their next persistence
 *                    boundary (immediate for the process that took the hit).
 *   2. DB STATUS    — projects.status flips to 'cancelled'; every persistence
 *                    boundary re-checks before saving, so an in-flight leg
 *                    from ANOTHER process halts too instead of overwriting
 *                    the kill with fresh 'building' state.
 *   3. RESUME GATE  — the relay refuses to relaunch cancelled builds, so the
 *                    chain dies at its next handoff even if a leg never
 *                    noticed.
 *
 * Cancellation is checked at rehydration/persistence boundaries ONLY —
 * never mid-agent-call — so a cancel waits for the current agent step to
 * settle (worst case: one agent call) before the build goes dark.
 */

import { createAdminClient } from '@/lib/supabase/server';

const cancelledLocally = new Set<string>();

/** Cancel a build: local flag + DB status flip. Idempotent. */
export async function cancelBuild(projectId: string): Promise<void> {
  cancelledLocally.add(projectId);
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('projects')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', projectId);
    if (error) console.error(`[cancel-switch] DB flip failed for ${projectId}:`, error.message);
  } catch (err) {
    // DB unreachable: the local flag still stops same-process runs, and the
    // resume gate will catch it on the next relay leg.
    console.error(`[cancel-switch] DB flip threw for ${projectId}:`, err);
  }
}

/** Fast local check (no DB round-trip) — checked at every boundary. */
export function isCancelledLocally(projectId: string): boolean {
  return cancelledLocally.has(projectId);
}

/**
 * Authoritative check: local flag OR DB status. Called at persistence
 * boundaries — one cheap indexed read (partial index on status='cancelled')
 * per boundary is the price of a cancel that always bites.
 */
export async function isProjectCancelled(projectId: string): Promise<boolean> {
  if (cancelledLocally.has(projectId)) return true;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .maybeSingle();
    if (data?.status === 'cancelled') {
      cancelledLocally.add(projectId); // cache it — the answer won't change
      return true;
    }
    return false;
  } catch {
    // DB unreachable mid-build: don't kill a healthy build on a probe flake.
    // The local flag and resume gate still cover the real cancel paths.
    return false;
  }
}

/** Clear the local flag (admin restore path, if ever needed). */
export function clearLocalCancel(projectId: string): void {
  cancelledLocally.delete(projectId);
}
