/**
 * Build quota enforcement per tier.
 * Free: 1 build per 30 days (sustainable because apps run on users' own API keys)
 * Starter: 5 builds per 30 days
 * Pro: unlimited (10/day anti-abuse guardrail)
 * Enterprise: unlimited
 * Admin: bypasses everything
 */

import { createClient } from '@supabase/supabase-js';

export interface QuotaResult {
  allowed: boolean;
  tier: string;
  used: number;
  limit: number | null; // null = unlimited
  resetHours: number;
  message?: string;
}

const LIMITS: Record<string, { limit: number | null; windowHours: number; label: string }> = {
  free: { limit: 1, windowHours: 720, label: '1 build per month' },
  starter: { limit: 5, windowHours: 720, label: '5 builds per month' },
  pro: { limit: 10, windowHours: 24, label: 'unlimited (fair use: 10 per day)' },
  enterprise: { limit: null, windowHours: 0, label: 'unlimited' },
};

export async function checkBuildQuota(userId: string): Promise<QuotaResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role')
    .eq('id', userId)
    .single();

  const tier = profile?.tier || 'free';

  // Admin bypass
  if (profile?.role === 'admin') {
    return { allowed: true, tier: 'admin', used: 0, limit: null, resetHours: 0 };
  }

  const config = LIMITS[tier] || LIMITS.free;

  if (config.limit === null) {
    return { allowed: true, tier, used: 0, limit: null, resetHours: 0 };
  }

  const { data: used, error } = await supabase.rpc('count_recent_projects', {
    p_user_id: userId,
    p_hours: config.windowHours,
  });

  if (error) {
    // Fail open on quota-check errors — don't block paying customers over a DB hiccup
    console.error('Quota check failed:', error.message);
    return { allowed: true, tier, used: 0, limit: config.limit, resetHours: config.windowHours };
  }

  const usedCount = typeof used === 'number' ? used : 0;
  const allowed = usedCount < config.limit;

  return {
    allowed,
    tier,
    used: usedCount,
    limit: config.limit,
    resetHours: config.windowHours,
    message: allowed
      ? undefined
      : `Your ${tier === 'free' ? 'Free' : tier.charAt(0).toUpperCase() + tier.slice(1)} plan includes ${config.label}. You've used ${usedCount}/${config.limit}. ${
          tier === 'pro'
            ? 'Try again tomorrow.'
            : 'Upgrade to build more — your apps run on your own API keys, so higher tiers cost us nothing extra to serve you.'
        }`,
  };
}

/**
 * Modification trial quota — free users get 3 AI modifications/fixes
 * (modify + Day-2 combined) to taste the feature, then the Pro gate.
 * Paid tiers and admins are unlimited.
 */
export async function checkModifyQuota(userId: string): Promise<QuotaResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role')
    .eq('id', userId)
    .single();

  const tier = profile?.tier || 'free';

  if (profile?.role === 'admin' || ['pro', 'enterprise', 'starter'].includes(tier)) {
    return { allowed: true, tier, used: 0, limit: null, resetHours: 0 };
  }

  // Count MOD-SNAPSHOT entries across ALL the user's projects (each modify
  // and Day-2 fix writes one before changing files — a reliable ledger)
  const { data: owned } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

  const projectIds = (owned || []).map((p: { id: string }) => p.id);
  if (projectIds.length === 0) {
    return { allowed: true, tier, used: 0, limit: 3, resetHours: 0 };
  }

  const { count, error } = await supabase
    .from('project_logs')
    .select('id', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .like('message', 'MOD-SNAPSHOT%');

  if (error) {
    // Fail open — don't block anyone over a counting hiccup
    console.error('Modify quota check failed:', error.message);
    return { allowed: true, tier, used: 0, limit: 3, resetHours: 0 };
  }

  const used = count || 0;
  const allowed = used < 3;

  return {
    allowed,
    tier,
    used,
    limit: 3,
    resetHours: 0,
    message: allowed
      ? undefined
      : `You've used your 3 free AI modifications. Upgrade to Pro for unlimited changes, rollbacks, GitHub sync, and the Day-2 Agent.`,
  };
}
