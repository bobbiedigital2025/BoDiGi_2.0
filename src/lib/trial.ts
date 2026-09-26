/**
 * Reverse Trial — every new signup gets 3 days of Pro, automatically.
 * They feel the full product; when it ends they land on Free and the
 * downgrade screen shows exactly what they lost. Loss aversion converts
 * better than aspiration.
 *
 * The one thing trial does NOT include: code export (ZIP + GitHub).
 * Export transfers permanent value — giving it away in the trial would
 * let users take the asset and never pay. Export unlocks with any paid plan.
 *
 * Mechanics: a trial is just tier='pro' + tier_expires_at=+3d + is_trial=true.
 * resolveTier() computes the EFFECTIVE tier at read time — no cron needed.
 * The Stripe webhook clears is_trial when a real payment lands.
 */

export const TRIAL_DAYS = 3;
export const TRIAL_TIER = 'pro';

export interface TierProfile {
  tier?: string | null;
  role?: string | null;
  is_trial?: boolean | null;
  tier_expires_at?: string | null;
}

/** The tier the user effectively has RIGHT NOW. */
export function resolveTier(profile: TierProfile | null | undefined): string {
  if (!profile) return 'free';
  if (profile.role === 'admin') return 'admin';
  const tier = profile.tier || 'free';
  if (tier === 'free') return 'free';
  // Paid/trial tiers expire — check the clock
  if (profile.tier_expires_at) {
    const expires = new Date(profile.tier_expires_at).getTime();
    if (Number.isFinite(expires) && expires < Date.now()) return 'free';
  }
  return tier;
}

/** True while the 3-day Pro trial is running. */
export function isTrialActive(profile: TierProfile | null | undefined): boolean {
  if (!profile?.is_trial) return false;
  if (!profile.tier_expires_at) return false;
  return new Date(profile.tier_expires_at).getTime() > Date.now();
}

/** True after the trial has lapsed (used for the "what you lost" screen). */
export function isTrialExpired(profile: TierProfile | null | undefined): boolean {
  if (!profile?.is_trial) return false;
  return !isTrialActive(profile);
}

/** Whole-days remaining in the trial (0 when expired). */
export function trialDaysLeft(profile: TierProfile | null | undefined): number {
  if (!isTrialActive(profile)) return 0;
  const ms = new Date(profile!.tier_expires_at!).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / (24 * 3600 * 1000)));
}

/** Export (ZIP/GitHub) is the one thing the trial never includes. */
export function canExport(profile: TierProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.is_trial) return false; // trial ≠ paid, even while active
  return ['starter', 'pro', 'enterprise'].includes(resolveTier(profile));
}
