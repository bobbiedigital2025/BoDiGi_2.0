'use client';

/**
 * GitHubExportPanel — pushes the project's code to a new repo under the
 * user's own GitHub account. Uses the (previously UI-less) github-export
 * API: repo creation + file push via the contents API, with the user's
 * stored token from Setup.
 */

import { useState } from 'react';

export default function GitHubExportPanel({ projectId, tier, isAdmin }: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string; repo?: string } | null>(null);
  const [isPrivate, setIsPrivate] = useState(true);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  async function exportToGithub() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/github-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ private: isPrivate }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult({
          kind: 'ok',
          text: `Pushed ${data.pushed} files${data.failed ? ` (${data.failed} failed — check the repo for gaps)` : ''}.`,
          repo: data.repo,
        });
      } else if (data.needToken) {
        setResult({ kind: 'err', text: 'No GitHub token yet — add one on the Setup page (GitHub section), then come back.' });
      } else if (data.upgrade) {
        setResult({ kind: 'err', text: data.error });
      } else {
        setResult({ kind: 'err', text: data.error || 'Export failed — try again.' });
      }
    } catch {
      setResult({ kind: 'err', text: 'Network error — try again.' });
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
    display: 'inline-block',
    padding: '0.625rem 1.25rem',
    borderRadius: '0.5rem',
    background: '#fff',
    color: '#000',
    fontWeight: 600,
    fontSize: '0.875rem',
    border: 'none',
    cursor: 'pointer',
  };

  if (!eligible) {
    return (
      <div style={box}>
        <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>📦 Export to GitHub</h3>
        <p style={{ color: '#a3a3a3', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          GitHub export is a Pro feature.{' '}
          <a href="/pricing" style={{ color: '#67e8f9', textDecoration: 'underline' }}>Upgrade</a> to push your code to your own GitHub repo.
        </p>
      </div>
    );
  }

  return (
    <div style={box}>
      <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>📦 Export to GitHub</h3>
      <p style={{ color: '#a3a3a3', fontSize: '0.875rem', marginTop: '0.5rem' }}>
        Creates a repo under your GitHub account and pushes every file — ready for Vercel/Netlify import or a developer to take over.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.875rem', color: '#d4d4d4', cursor: 'pointer' }}>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private repo (recommended)
      </label>

      <button onClick={exportToGithub} disabled={busy} style={{ ...btn, marginTop: '0.75rem', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Pushing…' : 'Push to GitHub'}
      </button>

      {result && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
          <p style={{ color: result.kind === 'ok' ? '#10b981' : '#f87171' }}>{result.text}</p>
          {result.repo && (
            <a href={result.repo} target="_blank" rel="noopener noreferrer" style={{ color: '#67e8f9', textDecoration: 'underline' }}>
              {result.repo}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
