'use client';

/**
 * SecurityAuditPanel — admin-only. Runs the live production hardening
 * audit and displays the scored report: auth probes, bundle secret
 * scan, RLS audit, headers, rate limiting, admin protection.
 */

import { useState } from 'react';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

interface AuditReport {
  ranAt: string;
  score: number;
  summary: { passed: number; failed: number; warned: number; total: number };
  checks: Check[];
}

export default function SecurityAuditPanel() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/security-audit');
      const data = await res.json();
      if (res.ok) {
        setReport(data);
      } else {
        setError(data.error || 'Audit failed to run.');
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setRunning(false);
    }
  }

  const statusColor = (s: Check['status']) =>
    s === 'pass' ? '#4ade80' : s === 'fail' ? '#f87171' : '#facc15';
  const statusIcon = (s: Check['status']) =>
    s === 'pass' ? '✓' : s === 'fail' ? '✕' : '⚠';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span>🛡️</span> Production Hardening Audit
          </h3>
          <p className="text-sm text-white/50 mt-1">
            Live security scan: auth bypass probes, secret leaks, RLS, headers, rate limits.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={running}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-semibold disabled:opacity-60"
        >
          {running ? 'Scanning…' : report ? 'Re-run audit' : 'Run audit'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {report && (
        <div className="mt-6">
          {/* Score bar */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="text-3xl font-bold"
              style={{ color: report.score >= 90 ? '#4ade80' : report.score >= 70 ? '#facc15' : '#f87171' }}
            >
              {report.score}%
            </div>
            <div className="text-sm text-white/60">
              {report.summary.passed} passed · {report.summary.failed} failed · {report.summary.warned} warnings
              <div className="text-white/30 text-xs mt-0.5">
                Ran {new Date(report.ranAt).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Checks */}
          <div className="space-y-2">
            {report.checks.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
                style={{ borderColor: c.status === 'fail' ? 'rgba(248,113,113,0.3)' : undefined }}
              >
                <span className="font-bold text-lg leading-none mt-0.5" style={{ color: statusColor(c.status) }}>
                  {statusIcon(c.status)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-white/50 mt-0.5">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
