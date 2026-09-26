'use client';

/**
 * TemplateToggle — lets the owner flag their finished app as a public
 * template anyone can fork. Unflag anytime.
 */

import { useState } from 'react';

export default function TemplateToggle({ projectId, appName }: {
  projectId: string;
  appName: string;
}) {
  const [isTemplate, setIsTemplate] = useState(false);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          isTemplate: !isTemplate,
          ...(price.trim() ? { priceCents: Math.round(parseFloat(price) * 100) } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsTemplate(data.isTemplate);
      } else {
        setError(data.error || 'Could not update — try again.');
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

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🧩 Make it a template</div>
      <p style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Let anyone fork <strong style={{ color: '#bbb' }}>{appName}</strong> from the public Templates gallery — they get a full editable copy in their account. Great for lead-gen: every fork is a signup.
      </p>
      {!isTemplate && (
        <div style={{ marginBottom: '0.75rem' }}>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="Price in USD — leave empty to share it free"
            inputMode="decimal"
            style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '0.8125rem', outline: 'none' }}
          />
          <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.375rem' }}>
            Paid templates: buyers pay through BoDiGi, you keep 80% of every sale. Earnings tracked in your dashboard.
          </p>
        </div>
      )}
      <button onClick={toggle} disabled={busy} style={{
        padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
        background: isTemplate ? 'transparent' : 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
        color: isTemplate ? '#f87171' : '#fff',
        border: isTemplate ? '1px solid rgba(248,113,113,0.3)' : 'none',
        fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
        opacity: busy ? 0.6 : 1,
      }}>
        {busy ? 'Saving…' : isTemplate ? '✓ Listed as template — click to remove' : 'Make a template'}
      </button>
      {error && <p style={{ color: '#f87171', fontSize: '0.8125rem', marginTop: '0.75rem' }}>{error}</p>}
    </div>
  );
}
