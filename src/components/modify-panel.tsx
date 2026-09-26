'use client';

/**
 * Modification Pass panel — Pro/Enterprise perk.
 * Chat-to-edit: the user describes a change, the Modification Agent
 * edits the project's files in place, and the preview re-renders.
 *
 * Also surfaces one-click "fix this" prompts derived from the app's
 * own Reality Check weaknesses (the differentiator: the docs tell you
 * what's risky, and the agent can act on it immediately).
 */

import { useState } from 'react';

interface AppliedChange {
  path: string;
  summary: string;
}

export default function ModifyPanel({
  projectId,
  tier,
  isAdmin,
  weaknesses,
}: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
  weaknesses: string[];
}) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [changes, setChanges] = useState<AppliedChange[]>([]);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  async function submit(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setChanges(data.changed || []);
        const trial = typeof data.trialRemaining === 'number'
          ? ` ${data.trialRemaining} free change${data.trialRemaining === 1 ? '' : 's'} left — upgrade to Pro for unlimited.`
          : '';
        setMessage({ kind: 'ok', text: (data.explanation || 'Change applied. Reload the preview to see it.') + trial });
        setInstruction('');
      } else if (data.declined) {
        setMessage({ kind: 'info', text: data.message });
      } else {
        setMessage({ kind: 'err', text: data.error || 'Something went wrong.' });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — try again.' });
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
  const textarea: React.CSSProperties = {
    width: '100%',
    minHeight: '4.5rem',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '0.5rem',
    color: '#e5e5e5',
    padding: '0.75rem',
    fontSize: '0.875rem',
    resize: 'vertical',
    fontFamily: 'inherit',
  };
  const btn: React.CSSProperties = {
    padding: '0.625rem 1.25rem',
    borderRadius: '0.5rem',
    background: 'linear-gradient(135deg, #7c3aed, #c026d3)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.875rem',
    border: 'none',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1,
  };
  const chip: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    marginBottom: '0.375rem',
    borderRadius: '0.5rem',
    background: 'rgba(168,85,247,0.08)',
    border: '1px solid rgba(168,85,247,0.25)',
    color: '#c4b5fd',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  };

  if (!eligible) {
    return (
      <div style={box}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>✏️ Modify your app with AI</div>
        <div style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
          Pro lets you change anything with a sentence — "make the header dark blue", "add a pricing section", "fix the weak onboarding my Reality Check flagged." The agent edits your app and the preview updates.
        </div>
        <a href="/pricing" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>
          Upgrade to Modify
        </a>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem', marginBottom: '0.5rem' }}>✏️ Modify your app</div>

      {weaknesses.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Reality Check flagged these — one click to address:
          </div>
          {weaknesses.slice(0, 3).map((w, i) => (
            <button key={i} style={chip} onClick={() => submit(`My app's Reality Check flagged this weakness: "${w}". Improve the app to address it — make the smallest safe change that moves it in the right direction.`)} disabled={busy}>
              ⚠️ {w.length > 90 ? w.slice(0, 90) + '…' : w} → fix this
            </button>
          ))}
        </div>
      )}

      <textarea
        style={textarea}
        placeholder='Describe a change — "make the header dark blue", "add an FAQ section", "make the copy friendlier for first-time users"'
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        disabled={busy}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button style={btn} onClick={() => submit(instruction)} disabled={busy || instruction.trim().length < 3}>
          {busy ? 'Agent is editing…' : 'Apply change'}
        </button>
        <span style={{ color: '#555', fontSize: '0.75rem' }}>
          Small, safe edits only — auth, payments, and database are locked.
        </span>
      </div>

      {message && (
        <div style={{
          marginTop: '0.75rem',
          fontSize: '0.8125rem',
          color: message.kind === 'ok' ? '#4ade80' : message.kind === 'err' ? '#f87171' : '#fbbf24',
        }}>
          {message.text}
        </div>
      )}

      {changes.length > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
          Changed: {changes.map((c) => c.path).join(', ')} — reload the preview to see it live.
        </div>
      )}
    </div>
  );
}
