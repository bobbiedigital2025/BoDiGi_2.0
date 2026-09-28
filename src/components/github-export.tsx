'use client';

/**
 * GitHubExportPanel — pushes the project's code to a new repo under the
 * user's own GitHub account. Uses the (previously UI-less) github-export
 * API: repo creation + file push via the contents API, with the user's
 * stored token from Setup.
 */

import { useEffect, useState } from 'react';

export default function GitHubExportPanel({ projectId, tier, isAdmin }: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string; repo?: string } | null>(null);
  const [isPrivate, setIsPrivate] = useState(true);
  // GitHub connection — inline token management so nobody goes hunting
  // through Setup when the export asks for a token.
  const [ghConnected, setGhConnected] = useState<boolean | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  useEffect(() => {
    if (!eligible) return;
    fetch('/api/setup-agent/keys')
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((d) => {
        const keys = d.keys || d || [];
        setGhConnected(keys.some((k: { provider?: string }) => k.provider === 'github'));
      })
      .catch(() => setGhConnected(false));
  }, [eligible]);

  async function saveToken() {
    if (tokenBusy) return;
    setTokenBusy(true);
    setTokenMsg(null);
    try {
      const res = await fetch('/api/setup-agent/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: 'github_token', keyValue: tokenDraft.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setGhConnected(true);
        setShowTokenInput(false);
        setTokenDraft('');
        setTokenMsg({ kind: 'ok', text: 'GitHub connected — token saved encrypted. Push away.' });
      } else {
        setTokenMsg({ kind: 'err', text: data.error || data.message || 'Could not save the token.' });
      }
    } catch {
      setTokenMsg({ kind: 'err', text: 'Network error — try again.' });
    } finally {
      setTokenBusy(false);
    }
  }

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
        setGhConnected(false);
        setShowTokenInput(true);
        setResult({ kind: 'err', text: 'No GitHub token yet — paste one below and you are connected.' });
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

      {/* Connection status + inline token */}
      <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
        {ghConnected === null ? (
          <p style={{ color: '#737373' }}>Checking GitHub connection…</p>
        ) : ghConnected && !showTokenInput ? (
          <p style={{ color: '#10b981' }}>
            ✓ GitHub connected{' '}
            <button
              onClick={() => setShowTokenInput(true)}
              style={{ color: '#737373', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              replace token
            </button>
          </p>
        ) : (
          <div style={{ border: '1px dashed #404040', borderRadius: '0.5rem', padding: '0.75rem', background: '#111' }}>
            <p style={{ color: '#d4d4d4', marginBottom: '0.5rem' }}>
              Paste a GitHub token — it saves encrypted and you never have to think about it again.{' '}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=BoDiGi%202.0%20export"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#67e8f9', textDecoration: 'underline' }}
              >
                Make one here (repo scope pre-selected) →
              </a>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="password"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="ghp_… or github_pat_…"
                style={{ flex: 1, background: '#000', border: '1px solid #404040', borderRadius: '0.375rem', padding: '0.5rem 0.625rem', color: '#fff', fontSize: '0.8rem', fontFamily: 'monospace' }}
              />
              <button
                onClick={saveToken}
                disabled={tokenBusy || tokenDraft.trim().length < 10}
                style={{ ...btn, padding: '0.5rem 0.875rem', fontSize: '0.8rem', opacity: tokenBusy ? 0.6 : 1 }}
              >
                {tokenBusy ? 'Saving…' : 'Save & connect'}
              </button>
            </div>
            {ghConnected && (
              <button
                onClick={() => setShowTokenInput(false)}
                style={{ color: '#737373', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', marginTop: '0.5rem', textDecoration: 'underline' }}
              >
                cancel — keep current token
              </button>
            )}
          </div>
        )}
        {tokenMsg && (
          <p style={{ color: tokenMsg.kind === 'ok' ? '#10b981' : '#f87171', marginTop: '0.5rem' }}>{tokenMsg.text}</p>
        )}
      </div>

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
