'use client';

/**
 * Day2Panel — the post-launch Maintenance & Evolution Assistant.
 * Report an issue or request a feature: the agent fixes the app in
 * BoDiGi and (if GitHub is connected) opens a Pull Request on the
 * user's repo so their code stays in sync.
 */

import { useState } from 'react';

interface Day2Result {
  explanation: string;
  changed: { path: string; summary?: string }[];
  prUrl?: string | null;
  note?: string;
  trialRemaining?: number | null;
}

export default function Day2Panel({ projectId, tier, isAdmin }: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
}) {
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Day2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState<string | null>(null);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  async function submit() {
    const text = report.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDeclined(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/day2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data);
        setReport('');
      } else if (res.ok && data.declined) {
        setDeclined(data.message);
      } else {
        setError(data.error || 'Something went wrong — try again.');
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = {
    border: '1px solid #262626',
    borderRadius: '0.75rem',
    padding: '1rem 1.25rem',
    background: '#0a0a0a',
    marginTop: '1rem',
  };
  const btn: React.CSSProperties = {
    padding: '0.625rem 1.25rem',
    borderRadius: '0.5rem',
    background: '#fff',
    color: '#000',
    fontWeight: 600,
    fontSize: '0.875rem',
    border: 'none',
    cursor: 'pointer',
  };
  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '5rem',
    padding: '0.75rem 0.875rem',
    borderRadius: '0.5rem',
    border: '1px solid #333',
    background: '#111',
    color: '#fff',
    fontSize: '0.875rem',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  };

  if (!eligible) {
    return (
      <div style={box}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🔧 Day-2 Agent</div>
        <p style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
          Post-launch support: report a bug or request a feature and the agent fixes your app — and opens a Pull Request on your GitHub repo.{' '}
          <a href="/pricing" style={{ color: '#67e8f9', textDecoration: 'underline' }}>Pro feature</a>
        </p>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🔧 Day-2 Agent — keep your app healthy</div>
      <p style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Something broken after launch? Want a small improvement? Describe it — the agent fixes your app here and opens a Pull Request on your GitHub repo (if connected).
      </p>

      <textarea
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="e.g. The pricing page shows $0 for the Pro plan, it should be $19. Or: can the signup button say 'Get started free'?"
        style={textareaStyle}
      />
      <button onClick={submit} disabled={busy || !report.trim()} style={{ ...btn, marginTop: '0.75rem', opacity: busy || !report.trim() ? 0.5 : 1 }}>
        {busy ? 'Fixing…' : 'Fix it'}
      </button>

      {error && <p style={{ color: '#f87171', fontSize: '0.8125rem', marginTop: '0.75rem' }}>{error}</p>}
      {declined && (
        <p style={{ color: '#facc15', fontSize: '0.8125rem', marginTop: '0.75rem' }}>{declined}</p>
      )}

      {result && (
        <div style={{ marginTop: '1rem', border: '1px solid rgba(74,222,128,0.25)', background: 'rgba(74,222,128,0.06)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
          <div style={{ color: '#4ade80', fontSize: '0.875rem', fontWeight: 600 }}>✓ Fixed</div>
          <p style={{ color: '#d4d4d4', fontSize: '0.8125rem', marginTop: '0.375rem' }}>{result.explanation}</p>
          {typeof result.trialRemaining === 'number' && (
            <p style={{ color: '#facc15', fontSize: '0.75rem', marginTop: '0.375rem' }}>
              {result.trialRemaining} free fix{result.trialRemaining === 1 ? '' : 'es'} left — upgrade to Pro for unlimited.
            </p>
          )}
          <ul style={{ margin: '0.5rem 0 0 1.1rem', color: '#a3a3a3', fontSize: '0.75rem', display: 'grid', gap: '0.25rem' }}>
            {result.changed.map((c, i) => (
              <li key={i}><code style={{ color: '#67e8f9' }}>{c.path}</code>{c.summary ? ` — ${c.summary}` : ''}</li>
            ))}
          </ul>
          {result.prUrl && (
            <a href={result.prUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '0.625rem', color: '#67e8f9', fontSize: '0.8125rem', textDecoration: 'underline' }}>
              Review the Pull Request on GitHub →
            </a>
          )}
          {!result.prUrl && result.note && (
            <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>{result.note}</p>
          )}
          <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Refresh the preview to see the change. Rollback anytime in Version history.
          </p>
        </div>
      )}
    </div>
  );
}
