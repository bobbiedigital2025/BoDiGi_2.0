'use client';

/**
 * AccountingPanel — admin-only. The money panel: revenue vs AI spend
 * vs margin, cost outliers, and usage runway. Answers one question:
 * is BoDiGi paying for itself?
 */

import { useState } from 'react';

interface Accounting {
  ranAt: string;
  revenue: { mrrCents: number; activePaidCount: number; templateRevCents: number; totalMonthlyRevCents: number; ledger: { gross30dCents: number; aiReserve30dCents: number; netProfit30dCents: number; nextMonthAiBudgetCents: number } };
  spend: { last30dCents: number; dailyBurnCents: number; monthlyBudgetCents: number; runwayDays: number | null; totalCalls30d: number; byKind: { kind: string; calls: number; costCents: number; why: string }[] };
  margin: { monthlyCents: number; healthy: boolean };
  outliers: { userId: string; email: string; tier: string; spendCents: number; paysCents: number; netCents: number }[];
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AccountingPanel() {
  const [data, setData] = useState<Accounting | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accounting');
      const json = await res.json();
      if (res.ok) setData(json);
      else setError(json.error || 'Could not load accounting.');
    } catch {
      setError('Network error — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span>💰</span> Accounting — is it paying for itself?
          </h3>
          <p className="text-sm text-white/50 mt-1">
            Revenue vs AI spend, margin, cost outliers, and usage runway.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-500 text-white text-sm font-semibold disabled:opacity-60"
        >
          {loading ? 'Loading…' : data ? 'Refresh' : 'Load numbers'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {data && (
        <div className="mt-6 space-y-6">
          {/* Top row: the three numbers that matter */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs text-white/40 uppercase tracking-wide">Monthly revenue</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{usd(data.revenue.totalMonthlyRevCents)}</div>
              <div className="text-xs text-white/40 mt-1">
                {usd(data.revenue.mrrCents)} subs ({data.revenue.activePaidCount} active) + {usd(data.revenue.templateRevCents)} marketplace
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs text-white/40 uppercase tracking-wide">AI spend (30d)</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{usd(data.spend.last30dCents)}</div>
              <div className="text-xs text-white/40 mt-1">
                {usd(data.spend.dailyBurnCents)}/day · {data.spend.totalCalls30d} calls
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${data.margin.healthy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <div className="text-xs text-white/40 uppercase tracking-wide">Margin (monthly)</div>
              <div className={`text-2xl font-bold mt-1 ${data.margin.healthy ? 'text-emerald-400' : 'text-red-400'}`}>
                {data.margin.monthlyCents >= 0 ? '+' : ''}{usd(data.margin.monthlyCents)}
              </div>
              <div className="text-xs text-white/40 mt-1">
                {data.margin.healthy ? '✓ Sustainable — revenue covers AI costs' : '⚠ Costs exceed revenue — tighten caps or grow subs'}
              </div>
            </div>
          </div>

          {/* Runway */}
          {/* Reserve automation: carved off every payment before it's profit */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-wide">🤖 Automated AI reserve (last 30 days)</div>
                <div className="text-sm text-white/60 mt-1">
                  Every payment carves {usd(data.revenue.ledger.aiReserve30dCents)} off the top for AI usage — before it counts as profit.
                  You keep <strong className="text-emerald-400">{usd(data.revenue.ledger.netProfit30dCents)}</strong> of {usd(data.revenue.ledger.gross30dCents)} collected.
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/40 uppercase tracking-wide">Next month&apos;s AI budget</div>
                <div className="text-xl font-bold text-emerald-400">{usd(data.revenue.ledger.nextMonthAiBudgetCents)}</div>
              </div>
            </div>
          </div>

          {/* Runway */}
          {data.spend.runwayDays !== null && data.spend.runwayDays >= 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
              <span className="text-white/60">Usage budget runway:</span>{' '}
              <strong className={data.spend.runwayDays < 7 ? 'text-red-400' : 'text-white'}>
                ~{data.spend.runwayDays} days
              </strong>{' '}
              <span className="text-white/40">
                at current burn ({usd(data.spend.dailyBurnCents)}/day against a {usd(data.spend.monthlyBudgetCents)} budget — set AI_MONTHLY_BUDGET_CENTS in Vercel to change)
              </span>
            </div>
          )}

          {/* Spend by agent — what went to which agent and why */}
          {data.spend.byKind.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white/70 mb-2">Where the AI money goes — by agent</h4>
              <div className="space-y-1.5">
                {data.spend.byKind.sort((a, b) => b.costCents - a.costCents).map((k) => (
                  <div key={k.kind} className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/80 font-medium">{k.kind}</span>
                      <span className="text-white/50">{k.calls} calls · {usd(k.costCents)}</span>
                    </div>
                    <div className="text-xs text-white/40 mt-1">{k.why}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outliers */}
          {data.outliers.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white/70 mb-2">⚠ Cost outliers — users spending more AI than they pay</h4>
              <div className="space-y-1.5">
                {data.outliers.map((o) => (
                  <div key={o.userId} className="flex items-center justify-between text-sm rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2">
                    <span className="text-white/70">{o.email} <span className="text-white/30">({o.tier})</span></span>
                    <span className="text-amber-400">
                      pays {usd(o.paysCents)} · costs {usd(o.spendCents)} · net {usd(o.netCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
