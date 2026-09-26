'use client';

/**
 * ShowcaseToggle — lets the owner publish their app to the public
 * showcase (bodigi2.com/showcase). One click, gets a shareable
 * investor-friendly URL. Unpublish anytime.
 */

import { useState } from 'react';

export default function ShowcaseToggle({ projectId, appName }: {
  projectId: string;
  appName: string;
}) {
  const [published, setPublished] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, isPublic: !published }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPublished(data.isPublic);
        setUrl(data.url);
      } else {
        setError(data.error || 'Could not update — try again.');
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the link itself is still clickable
    }
  }

  const box: React.CSSProperties = {
    border: '1px solid #262626',
    borderRadius: '0.75rem',
    padding: '1rem 1.25rem',
    background: '#0a0a0a',
    marginTop: '1rem',
  };

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>📣 Showcase & investors</div>
      <p style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Publish <strong style={{ color: '#bbb' }}>{appName}</strong> to the public showcase — a clean investor-friendly page with your app's features, audience, and business model. Shareable link, unpublish anytime.
      </p>

      {!published ? (
        <button onClick={toggle} disabled={busy} style={{
          padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
          background: 'linear-gradient(135deg, #7c3aed, #c026d3)', color: '#fff',
          fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Publishing…' : 'Publish to Showcase'}
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#4ade80', fontSize: '0.8125rem', fontWeight: 600 }}>✓ Live</span>
            <a href={url || '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#67e8f9', fontSize: '0.8125rem', textDecoration: 'underline', wordBreak: 'break-all' }}>
              {url}
            </a>
            <button onClick={copy} style={{
              padding: '0.25rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem',
              background: '#1a1a1a', color: '#fff', border: '1px solid #333', cursor: 'pointer',
            }}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button onClick={toggle} disabled={busy} style={{
              padding: '0.25rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem',
              background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer',
            }}>
              Unpublish
            </button>
          </div>
          <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Tip: paste this link in investor emails, your X bio, or your Product Hunt page.
          </p>
        </div>
      )}

      {error && <p style={{ color: '#f87171', fontSize: '0.8125rem', marginTop: '0.75rem' }}>{error}</p>}
    </div>
  );
}
