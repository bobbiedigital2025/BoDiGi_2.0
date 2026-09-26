'use client';

/**
 * DomainAssistant — the Custom Domain Assistant. Type a domain, see if
 * it's available (RDAP), and get the exact A/CNAME/TXT records to point
 * it at the Vercel deployment, plus numbered registrar steps.
 */

import { useState } from 'react';

interface DomainResult {
  domain: string;
  registered: boolean | null;
  records: { type: string; name: string; value: string; purpose: string }[];
  steps: string[];
}

export default function DomainAssistant() {
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const d = domain.trim();
    if (!d || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/domain-check?domain=${encodeURIComponent(d)}`);
      const data = await res.json();
      if (res.ok) setResult(data);
      else setError(data.error || 'Check failed — try again.');
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
  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '0.625rem 0.875rem',
    borderRadius: '0.5rem',
    border: '1px solid #333',
    background: '#111',
    color: '#fff',
    fontSize: '0.875rem',
    outline: 'none',
  };
  const btn: React.CSSProperties = {
    padding: '0.625rem 1.25rem',
    borderRadius: '0.5rem',
    background: '#fff',
    color: '#000',
    fontWeight: 600,
    fontSize: '0.875rem',
    border: 'none',
    cursor: 'busy' as any,
  };

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🌐 Custom Domain Assistant</div>
      <p style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Check if a domain is available and get the exact DNS records to point it at your deployed app.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
          placeholder="myapp.com"
          style={inputStyle}
        />
        <button onClick={check} disabled={busy || !domain.trim()} style={{ ...btn, opacity: busy || !domain.trim() ? 0.5 : 1 }}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: '0.8125rem', marginTop: '0.75rem' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: result.registered === false ? '#4ade80' : result.registered === true ? '#facc15' : '#a3a3a3',
          }}>
            {result.registered === false
              ? `${result.domain} looks unregistered — you may be able to buy it 🎉`
              : result.registered === true
                ? `${result.domain} is taken — if it's yours, the records below connect it to your app`
                : `${result.domain}: couldn't verify registration (some TLDs don't support lookup) — if it's yours, the records below still apply`}
          </div>

          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: '#bbb', fontWeight: 600 }}>DNS records to add at your registrar</div>
          <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
            {result.records.map((r, i) => (
              <div key={i} style={{ border: '1px solid #262626', borderRadius: '0.5rem', padding: '0.625rem 0.875rem', background: '#111' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: '#67e8f9', fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.type}</span>
                  <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.name}</span>
                  <span style={{ color: '#a3a3a3', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>→ {r.value}</span>
                </div>
                <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem' }}>{r.purpose}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: '#bbb', fontWeight: 600 }}>Step by step</div>
          <ol style={{ margin: '0.5rem 0 0 1.25rem', padding: 0, color: '#a3a3a3', fontSize: '0.8125rem', display: 'grid', gap: '0.375rem' }}>
            {result.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
