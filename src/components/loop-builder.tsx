'use client';

/**
 * LoopBuilder — the Engagement Loop Builder. The app owner configures
 * action→reward loops for THEIR app (10% off, free feature for 24h,
 * unlock premium — redeemable only after the action), then wires the
 * loop code into their app with one click. "Say goodbye to customer
 * fall-off funnels — welcome to the loops."
 */

import { useState, useEffect } from 'react';

interface Loop {
  id: number;
  action: string;
  action_label: string;
  reward: string;
  reward_label: string;
  active: boolean;
  wired_at: number | null;
}

const ACTION_OPTIONS = [
  { value: 'try_app', label: 'Try the app (download / first use)' },
  { value: 'complete_onboarding', label: 'Finish onboarding' },
  { value: 'invite_friend', label: 'Invite a friend' },
  { value: 'share_facebook', label: 'Share to Facebook' },
  { value: 'share_x', label: 'Post on X' },
  { value: 'post_accomplishment', label: 'Post an accomplishment' },
  { value: 'upgrade', label: 'Upgrade to paid' },
  { value: 'refer_customer', label: 'Refer a paying customer' },
];

const REWARD_OPTIONS = [
  { value: 'discount_10', label: '10% off' },
  { value: 'discount_25', label: '25% off' },
  { value: 'free_feature_24h', label: 'Free premium feature for 24 hours' },
  { value: 'free_feature_72h', label: 'Free premium feature for 3 days' },
  { value: 'unlock_premium_feature', label: 'Unlock a premium feature' },
  { value: 'badge', label: 'Achievement badge' },
  { value: 'early_access', label: 'Early access to a new feature' },
];

export default function LoopBuilder({ projectId, tier, isAdmin }: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
}) {
  const [loops, setLoops] = useState<Loop[] | null>(null);
  const [action, setAction] = useState('try_app');
  const [actionLabel, setActionLabel] = useState('');
  const [reward, setReward] = useState('discount_10');
  const [rewardLabel, setRewardLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [wiring, setWiring] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  const load = async () => {
    try {
      const res = await fetch(`/api/generate/${projectId}/loops`);
      const data = await res.json();
      setLoops(data.loops || []);
    } catch {
      setLoops([]);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const addLoop = async () => {
    if (busy || !actionLabel.trim() || !rewardLabel.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/loops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actionLabel: actionLabel.trim(), reward, rewardLabel: rewardLabel.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.loop) {
        setLoops((prev) => [...(prev || []), data.loop]);
        setActionLabel('');
        setRewardLabel('');
        setMessage({ kind: 'ok', text: 'Loop added. Add more, or wire them into your app below.' });
      } else {
        setMessage({ kind: 'err', text: data.error || 'Could not add loop.' });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — try again.' });
    } finally {
      setBusy(false);
    }
  };

  const toggleLoop = async (loop: Loop) => {
    await fetch(`/api/generate/${projectId}/loops`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loopId: loop.id, active: !loop.active }),
    });
    load();
  };

  const removeLoop = async (loop: Loop) => {
    await fetch(`/api/generate/${projectId}/loops?loopId=${loop.id}`, { method: 'DELETE' });
    load();
  };

  const wireLoops = async () => {
    if (wiring) return;
    setWiring(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/loops/wire`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ kind: 'ok', text: `${data.loopsWired} loop${data.loopsWired === 1 ? '' : 's'} wired into your app. ${data.explanation} Refresh the preview — your Rewards page is live.` });
        load();
      } else {
        setMessage({ kind: 'err', text: data.error || 'Wiring failed — try again.' });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — try again.' });
    } finally {
      setWiring(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '0.625rem 0.875rem', borderRadius: '0.5rem',
    border: '1px solid #333', background: '#111', color: '#fff',
    fontSize: '0.8125rem', outline: 'none', minWidth: 0,
  };

  return (
    <div style={{ border: '1px solid #262626', borderRadius: '0.75rem', padding: '1rem 1.25rem', background: '#0a0a0a', marginTop: '1rem' }}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🔁 Engagement Loop Builder</div>
      <p style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Gamify YOUR app: users complete an action → unlock a reward. Rewards only redeem after the action — no more fall-off funnels.
      </p>

      {/* Existing loops */}
      {loops === null ? (
        <p style={{ color: '#666', fontSize: '0.8125rem' }}>Loading…</p>
      ) : loops.length === 0 ? (
        <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>No loops yet — build your first below.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {loops.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', border: '1px solid #262626', borderRadius: '0.5rem', padding: '0.625rem 0.875rem', background: '#111' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#e5e5e5', fontSize: '0.8125rem' }}>
                  <span style={{ color: '#67e8f9' }}>{ACTION_OPTIONS.find((a) => a.value === l.action)?.label || l.action}</span>
                  {' → '}
                  <span style={{ color: '#4ade80' }}>{REWARD_OPTIONS.find((r) => r.value === l.reward)?.label || l.reward}</span>
                </div>
                <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {l.action_label} · Reward: {l.reward_label}
                  {l.wired_at ? ' · ✓ wired into app' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                <button onClick={() => toggleLoop(l)} style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.6875rem', background: '#1a1a1a', color: l.active ? '#4ade80' : '#666', border: '1px solid #333', cursor: 'pointer' }}>
                  {l.active ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => removeLoop(l)} style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.6875rem', background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New loop form */}
      <div style={{ border: '1px dashed #333', borderRadius: '0.5rem', padding: '0.75rem', background: '#0d0d0d' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle}>
            {ACTION_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select value={reward} onChange={(e) => setReward(e.target.value)} style={inputStyle}>
            {REWARD_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="How it reads to YOUR users, e.g. 'Download the app and create your first project'" style={{ ...inputStyle, marginTop: '0.5rem', width: '100%' }} />
        <input value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)} placeholder="The reward they unlock, e.g. 'Pro analytics free for 24 hours'" style={{ ...inputStyle, marginTop: '0.5rem', width: '100%' }} />
        <button onClick={addLoop} disabled={busy || !actionLabel.trim() || !rewardLabel.trim()} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#fff', color: '#000', fontWeight: 600, fontSize: '0.75rem', border: 'none', cursor: 'pointer', opacity: busy || !actionLabel.trim() || !rewardLabel.trim() ? 0.5 : 1 }}>
          + Add loop
        </button>
      </div>

      {/* Wire button */}
      <div style={{ marginTop: '0.75rem' }}>
        {!eligible ? (
          <p style={{ color: '#888', fontSize: '0.8125rem' }}>
            Loops configured free — <a href="/pricing" style={{ color: '#67e8f9', textDecoration: 'underline' }}>upgrade to Pro</a> to wire them into your app's code.
          </p>
        ) : (
          <button onClick={wireLoops} disabled={wiring || !loops || loops.length === 0} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', color: '#fff', fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer', opacity: wiring || !loops || loops.length === 0 ? 0.6 : 1 }}>
            {wiring ? 'Wiring into your app…' : '⚡ Wire loops into my app'}
          </button>
        )}
      </div>

      {message && (
        <p style={{ color: message.kind === 'ok' ? '#4ade80' : '#f87171', fontSize: '0.8125rem', marginTop: '0.75rem' }}>{message.text}</p>
      )}
    </div>
  );
}
