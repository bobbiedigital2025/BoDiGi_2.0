'use client';

/**
 * Vercel Deploy panel — Pro/Enterprise perk.
 * Shown on the project preview page. Three states:
 *   1. Not connected → "Connect Vercel" (OAuth, or manual token via Setup)
 *   2. Connected, not deployed → "Deploy my app" button
 *   3. Deployed → live URL + redeploy
 */

import { useEffect, useState } from 'react';

type DeployState =
  | { status: 'idle' }
  | { status: 'deploying' }
  | { status: 'done'; url: string }
  | { status: 'error'; message: string };

export default function VercelDeployPanel({
  projectId,
  tier,
  isAdmin,
  initiallyConnected,
}: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
  initiallyConnected: boolean;
}) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [deploy, setDeploy] = useState<DeployState>({ status: 'idle' });

  // OAuth round-trip returns here with ?vercel=connected
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vercel') === 'connected') {
      setConnected(true);
    }
  }, []);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  async function startDeploy() {
    setDeploy({ status: 'deploying' });
    try {
      const res = await fetch(`/api/generate/${projectId}/vercel-deploy`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeploy({ status: 'done', url: data.url });
      } else if (data.needToken) {
        setConnected(false);
        setDeploy({ status: 'error', message: 'Vercel connection missing — reconnect below.' });
      } else {
        setDeploy({ status: 'error', message: data.error || 'Deploy failed.' });
      }
    } catch {
      setDeploy({ status: 'error', message: 'Network error — try again.' });
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
    textDecoration: 'none',
  };

  if (!eligible) {
    return (
      <div style={box}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🚀 Deploy your app for real</div>
        <div style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
          Pro deploys your app live to <strong style={{ color: '#bbb' }}>your own Vercel account</strong> — one click, real URL, yours forever.
          Attach any domain you own.
        </div>
        <a href="/pricing" style={{ ...btn, background: 'linear-gradient(135deg, #7c3aed, #c026d3)', color: '#fff' }}>
          Upgrade to Deploy
        </a>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem', marginBottom: '0.5rem' }}>🚀 Live deployment</div>

      {deploy.status === 'done' ? (
        <div>
          <div style={{ color: '#4ade80', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Your app is live:</div>
          <a href={deploy.url} target="_blank" rel="noopener noreferrer" style={{ color: '#67e8f9', fontSize: '1rem', fontWeight: 600, wordBreak: 'break-all' }}>
            {deploy.url}
          </a>
          <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.75rem' }}>
            Running on <em>your</em> Vercel account — attach a custom domain in your Vercel dashboard anytime.
            BoDiGi's access can be revoked in Vercel Settings → Apps; your app keeps running either way.
          </div>
          <button onClick={startDeploy} style={{ ...btn, marginTop: '0.75rem', background: '#1a1a1a', color: '#fff', border: '1px solid #333' }}>
            Redeploy latest
          </button>
        </div>
      ) : !connected ? (
        <div>
          <div style={{ color: '#888', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
            Connect your free Vercel account once — then deploy any app with one click. You can revoke access anytime in Vercel Settings.
          </div>
          <a href={`/api/vercel/connect?projectId=${projectId}`} style={btn}>
            Connect Vercel
          </a>
        </div>
      ) : (
        <div>
          <div style={{ color: '#888', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
            Vercel connected. Deploy this app to your account now — takes about a minute.
          </div>
          <button onClick={startDeploy} disabled={deploy.status === 'deploying'} style={btn}>
            {deploy.status === 'deploying' ? 'Deploying… (this takes ~1 min)' : 'Deploy my app'}
          </button>
          {deploy.status === 'error' && (
            <div style={{ color: '#f87171', fontSize: '0.8125rem', marginTop: '0.5rem' }}>{deploy.message}</div>
          )}
          <div style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.75rem' }}>
            Deploys to <em>your</em> Vercel account — you own it, you control it, revoke BoDiGi anytime.
          </div>
        </div>
      )}
    </div>
  );
}
