/**
 * API Route: GET /api/admin/accounting
 * Admin-only. The money panel: revenue vs AI spend vs margin.
 *   - MRR: active paid tiers (starter $19, pro $49, enterprise $199)
 *   - AI spend: estimated cost from ai_usage_log (30 days + today)
 *   - Margin: revenue minus AI spend
 *   - Per-user cost outliers: users costing more in AI than they pay
 *   - Usage budget runway: days left at current burn rate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

const TIER_PRICES: Record<string, number> = { starter: 1900, pro: 4900, enterprise: 19900 };

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // ─── Revenue: active paid tiers ───
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, tier, tier_expires_at');
  const now = new Date();
  const activePaid = (profiles || []).filter((p: any) => {
    if (!TIER_PRICES[p.tier]) return false;
    if (!p.tier_expires_at) return true; // no expiry recorded — treat as active
    return new Date(p.tier_expires_at) > now;
  });
  const mrrCents = activePaid.reduce((sum: number, p: any) => sum + (TIER_PRICES[p.tier] || 0), 0);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

  // ─── Revenue ledger: reserve carved off payments ───
  const { data: ledger } = await admin
    .from('revenue_ledger')
    .select('gross_cents, ai_reserve_cents, net_profit_cents, source, created_at')
    .gte('created_at', thirtyDaysAgo);
  const ledgerGross = (ledger || []).reduce((s: number, r: any) => s + (r.gross_cents || 0), 0);
  const ledgerReserve = (ledger || []).reduce((s: number, r: any) => s + (r.ai_reserve_cents || 0), 0);
  const ledgerProfit = (ledger || []).reduce((s: number, r: any) => s + (r.net_profit_cents || 0), 0);

  // ─── Template marketplace revenue (20% cut of paid purchases) ───
  const { data: purchases } = await admin
    .from('template_purchases')
    .select('boogi_cut_cents, seller_earnings_cents, created_at')
    .eq('status', 'paid');
  const templateRevCents = (purchases || []).reduce((s: number, p: any) => s + (p.boogi_cut_cents || 0), 0);

  // ─── AI spend: last 30 days ───
  const { data: usage } = await admin
    .from('ai_usage_log')
    .select('user_id, kind, input_tokens, output_tokens, est_cost_cents, created_at')
    .gte('created_at', thirtyDaysAgo);

  const spend30dCents = (usage || []).reduce((s: number, u: any) => s + Number(u.est_cost_cents || 0), 0);
  const dailyBurnCents = spend30dCents / 30;

  // ─── Per-user cost outliers (AI cost > what they pay) ───
  const userSpend = new Map<string, number>();
  for (const u of usage || []) {
    userSpend.set(u.user_id, (userSpend.get(u.user_id) || 0) + Number(u.est_cost_cents || 0));
  }
  const tierById = new Map((profiles || []).map((p: any) => [p.id, p]));
  const outliers = Array.from(userSpend.entries())
    .map(([uid, spend]) => {
      const p = tierById.get(uid);
      const pays = p ? (TIER_PRICES[p.tier] || 0) : 0;
      return { userId: uid, email: p?.email || 'unknown', tier: p?.tier || 'free', spendCents: Math.round(spend), paysCents: pays, netCents: pays - Math.round(spend) };
    })
    .filter(o => o.netCents < 0)
    .sort((a, b) => a.netCents - b.netCents)
    .slice(0, 10);

  // ─── Runway: days of AI budget left (env-set budget, default $50) ───
  const monthlyBudgetCents = Number(process.env.AI_MONTHLY_BUDGET_CENTS || 5000);
  const runwayDays = dailyBurnCents > 0 ? Math.round((monthlyBudgetCents - spend30dCents) / dailyBurnCents) : null;

  // ─── By kind breakdown ───
  const byKind = new Map<string, { calls: number; costCents: number }>();
  for (const u of usage || []) {
    const k = byKind.get(u.kind) || { calls: 0, costCents: 0 };
    k.calls++;
    k.costCents += Number(u.est_cost_cents || 0);
    byKind.set(u.kind, k);
  }

  // ─── Agent-level attribution: which agent ate what, and why ───
  // Kinds map to the pipeline agents that made the calls. For builds,
  // the pipeline makes ~9 agent calls per app — we attribute per call kind.
  const AGENT_EXPLANATIONS: Record<string, string> = {
    build: 'The build pipeline — Nova (PM), Atlas (architect), Vault (DB), Forge (backend), Prism (frontend), Aegis (compliance), Scout (testing), Scribe (docs) — every app build runs them all',
    modify: 'Forge — surgical AI edits to a built app',
    day2: 'Mend — post-launch issue diagnosis and fixes that open PRs',
    loop_wire: 'Prism — generates engagement loop code into user apps',
    interview: 'Nova — Plan Mode interview, asks questions and synthesizes the build brief',
    setup_agent: 'Pilot — guided API key setup chat',
    support_chat: 'The support chat — customer service conversations',
    other: 'Uncategorized AI calls',
  };
  const agentBreakdown = Array.from(byKind.entries()).map(([kind, v]) => ({
    kind,
    calls: v.calls,
    costCents: Math.round(v.costCents * 100) / 100,
    why: AGENT_EXPLANATIONS[kind] || 'Uncategorized AI call',
  }));

  return NextResponse.json({
    ranAt: now.toISOString(),
    revenue: {
      mrrCents,
      activePaidCount: activePaid.length,
      templateRevCents,
      totalMonthlyRevCents: mrrCents + templateRevCents,
      ledger: {
        gross30dCents: ledgerGross,
        aiReserve30dCents: ledgerReserve,
        netProfit30dCents: ledgerProfit,
        // Next month's AI budget = reserve from the last 30 days of payments
        nextMonthAiBudgetCents: ledgerReserve,
      },
    },
    spend: {
      last30dCents: Math.round(spend30dCents * 100) / 100,
      dailyBurnCents: Math.round(dailyBurnCents * 100) / 100,
      monthlyBudgetCents,
      runwayDays,
      totalCalls30d: (usage || []).length,
      byKind: agentBreakdown,
      agentBreakdown,
    },
    margin: {
      monthlyCents: mrrCents + templateRevCents - Math.round(spend30dCents),
      healthy: mrrCents + templateRevCents > spend30dCents,
    },
    outliers,
  });
}
