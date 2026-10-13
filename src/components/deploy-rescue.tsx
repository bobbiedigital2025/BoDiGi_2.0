'use client';

import { useState } from 'react';

interface Props {
  projectId: string;
  tier: string;
  isAdmin: boolean;
}

const INSTRUCTION_PREFIX =
  'The Vercel deployment failed for my app. Here is the build log tail from Vercel. ' +
  'Diagnose the failure and fix the code so the build succeeds:\n\n';

export default function DeployRescue({ projectId, tier, isAdmin }: Props) {
  const [errorText, setErrorText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fixedNote, setFixedNote] = useState<string | null>(null);
  const [declinedNote, setDeclinedNote] = useState<string | null>(null);
  const [failNote, setFailNote] = useState<string | null>(null);

  const isPro = isAdmin || tier === 'pro' || tier === 'enterprise';

  async function fixMyApp() {
    setBusy(true);
    setFixedNote(null);
    setDeclinedNote(null);
    setFailNote(null);
    try {
      const instruction = (INSTRUCTION_PREFIX + errorText.trim()).slice(0, 1900);
      const res = await fetch(`/api/generate/${projectId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFailNote(data.error || 'Something went wrong on our side. Try again in a minute.');
      } else if (data.declined) {
        setDeclinedNote(data.message || 'No changes were needed for that error.');
      } else {
        const n = Array.isArray(data.changed) ? data.changed.length : 0;
        setFixedNote(
          (data.explanation ? `${data.explanation} ` : '') +
            `Fixed ${n} file${n === 1 ? '' : 's'}. Now deploy your app again the same way you did before — ` +
            'it should build this time. If a new red error shows up, paste it right back here.'
        );
        setErrorText('');
      }
    } catch {
      setFailNote('Could not reach BoDiGi. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: '1px solid #262626',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginTop: '1rem',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
        Deployment trouble? 🛟
      </h3>
      <p style={{ color: '#a3a3a3', fontSize: '0.875rem', marginTop: '0.5rem' }}>
        If Vercel (or wherever you deployed) shows you a red error, paste it here.
        BoDiGi reads it, fixes your code, and tells you exactly what to do next.
      </p>

      {!isPro ? (
        <p style={{ color: '#a3a3a3', fontSize: '0.875rem', marginTop: '0.75rem' }}>
          The rescue crew is a <a href="/pricing" style={{ color: '#a855f7' }}>Pro</a> power —
          upgrade and it will fix deploy errors for you in one paste.
        </p>
      ) : (
        <>
          <textarea
            value={errorText}
            onChange={(e) => setErrorText(e.target.value)}
            placeholder='Paste the red error text here — the whole thing, messy is fine.'
            rows={5}
            disabled={busy}
            style={{
              width: '100%',
              marginTop: '0.75rem',
              padding: '0.625rem',
              border: '1px solid #2a2a2a',
              borderRadius: '0.5rem',
              background: '#0a0a0a',
              color: '#e5e5e5',
              fontSize: '0.8125rem',
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
          <button
            onClick={fixMyApp}
            disabled={busy || errorText.trim().length < 10}
            style={{
              marginTop: '0.625rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: busy || errorText.trim().length < 10 ? '#3b3b3b' : '#a855f7',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: busy || errorText.trim().length < 10 ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Reading the error and fixing your code…' : 'Fix my app'}
          </button>

          {fixedNote && (
            <p style={{ color: '#4ade80', fontSize: '0.875rem', marginTop: '0.75rem' }}>
              ✅ {fixedNote}
            </p>
          )}
          {declinedNote && (
            <p style={{ color: '#fbbf24', fontSize: '0.875rem', marginTop: '0.75rem' }}>
              {declinedNote}
            </p>
          )}
          {failNote && (
            <p style={{ color: '#f87171', fontSize: '0.875rem', marginTop: '0.75rem' }}>
              {failNote}
            </p>
          )}
        </>
      )}
    </div>
  );
}
