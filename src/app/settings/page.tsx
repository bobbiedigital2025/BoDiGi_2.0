'use client';

/**
 * /settings — the product's home base.
 * Plan card (tier + upgrade/manage), your documents, feature toggles
 * gated by tier (working for yours, crowned + locked above it),
 * and a REAL accessibility section that applies site-wide.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';

interface Project {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

type Prefs = {
  fontSize: 'normal' | 'large' | 'xlarge';
  contrast: 'normal' | 'high';
  reduceMotion: boolean;
};

const DEFAULT_PREFS: Prefs = { fontSize: 'normal', contrast: 'normal', reduceMotion: false };
const PREFS_KEY = 'bodigi_a11y';

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyPrefs(p: Prefs) {
  const root = document.documentElement;
  root.style.fontSize = p.fontSize === 'normal' ? '16px' : p.fontSize === 'large' ? '18px' : '20px';
  root.style.filter = p.contrast === 'high' ? 'contrast(1.25)' : '';
  root.classList.toggle('reduce-motion', p.reduceMotion);
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tier, setTier] = useState('free');
  const [role, setRole] = useState('user');
  const [projects, setProjects] = useState<Project[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    applyPrefs(p);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier, role')
        .eq('id', user.id)
        .single();
      if (profile?.tier) setTier(profile.tier);
      if (profile?.role) setRole(profile.role);

      const { data: projs } = await supabase
        .from('projects')
        .select('id, name, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setProjects(projs || []);
    })();
  }, [user]);

  if (loading || !user) {
    return <div style={{ minHeight: '100vh', background: '#050505', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>;
  }

  const isAdmin = role === 'admin';
  const tierRank: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
  const rank = isAdmin ? 3 : (tierRank[tier] ?? 0);
  const has = (need: string) => rank >= (tierRank[need] ?? 99);

  function updatePrefs(next: Partial<Prefs>) {
    const p = { ...prefs, ...next };
    setPrefs(p);
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    applyPrefs(p);
  }

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalBusy(false);
    }
  }

  const tierLabel: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
  const tierColor: Record<string, string> = { free: '#666', starter: '#38bdf8', pro: '#c084fc', enterprise: '#fbbf24' };

  // ---- feature toggle definitions: [name, description, requiredTier, implemented] ----
  const features: Array<{ name: string; desc: string; need: string; live: boolean }> = [
    { name: 'Live preview', desc: 'See your app running inside BoDiGi while it builds', need: 'free', live: true },
    { name: 'Investor docs', desc: 'README, Investor One-Pager, and honest Reality Check with every build', need: 'free', live: true },
    { name: 'ZIP export', desc: 'Download your full source code anytime', need: 'starter', live: true },
    { name: '30-day preview', desc: 'Your preview stays live for 30 days instead of 7', need: 'starter', live: true },
    { name: 'Marketing Kit', desc: 'Launch posts, email sequences, press kit, 30-day plan — written for your app', need: 'pro', live: true },
    { name: 'Vercel deployment', desc: 'One-click deploy to your own Vercel account — real URL, your infra', need: 'pro', live: true },
    { name: 'Modification Pass', desc: 'Change your app with a sentence — AI edits it in place', need: 'pro', live: true },
    { name: 'GitHub export', desc: 'Push your code straight to a repo you own', need: 'pro', live: true },
    { name: 'Custom domain', desc: 'Attach any domain you own to your deployed app', need: 'pro', live: true },
    { name: 'Priority build queue', desc: 'Your builds jump the line', need: 'enterprise', live: false },
    { name: 'Phone support + SLA', desc: 'A human, on a call, when you need one', need: 'enterprise', live: false },
  ];

  const card: React.CSSProperties = { border: '1px solid #222', borderRadius: '0.75rem', padding: '1.25rem 1.5rem', background: '#0a0a0a', marginBottom: '1.25rem' };
  const h2: React.CSSProperties = { color: '#fff', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' };
  const muted: React.CSSProperties = { color: '#777', fontSize: '0.8125rem' };

  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800 }}>Settings</h1>
          <a href="/dashboard" style={{ color: '#888', fontSize: '0.875rem', textDecoration: 'none' }}>← Dashboard</a>
        </div>

        {/* ============ PLAN ============ */}
        <div style={card}>
          <h2 style={h2}>Your plan</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8125rem', fontWeight: 700, background: `${tierColor[tier]}22`, color: tierColor[tier], border: `1px solid ${tierColor[tier]}55` }}>
              {isAdmin ? 'Admin' : tierLabel[tier]}
            </span>
            {tier === 'free' && !isAdmin && (
              <span style={muted}>Preview expires in 7 days — upgrade to keep your app forever.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {!isAdmin && tier !== 'enterprise' && (
              <a href="/pricing" style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg,#7c3aed,#c026d3)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}>
                {tier === 'free' ? 'Upgrade' : 'Change plan'}
              </a>
            )}
            {(tier !== 'free' || isAdmin) && (
              <button onClick={openPortal} disabled={portalBusy} style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: '#161616', color: '#ddd', border: '1px solid #2a2a2a', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                {portalBusy ? 'Opening…' : 'Manage billing'}
              </button>
            )}
          </div>
        </div>

        {/* ============ DOCUMENTS ============ */}
        <div style={card}>
          <h2 style={h2}>Your documents</h2>
          {projects.length === 0 ? (
            <div style={muted}>No builds yet — your README, Investor One-Pager, Reality Check, and Marketing Kit will appear here after your first build.</div>
          ) : (
            projects.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #161616' }}>
                <div>
                  <div style={{ color: '#e5e5e5', fontSize: '0.875rem', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ ...muted, fontSize: '0.75rem' }}>{new Date(p.created_at).toLocaleDateString()} · {p.status}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a href={`/preview/${p.id}`} style={{ ...muted, color: '#a78bfa', textDecoration: 'none' }}>Preview & docs</a>
                  {(has('starter')) && (
                    <a href={`/api/generate/${p.id}/download`} style={{ ...muted, color: '#67e8f9', textDecoration: 'none' }}>ZIP</a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ============ FEATURES ============ */}
        <div style={card}>
          <h2 style={h2}>Features</h2>
          <div style={{ ...muted, marginBottom: '0.75rem' }}>What's on for your plan — and what unlocks above it.</div>
          {features.map((f) => {
            const unlocked = has(f.need);
            return (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.625rem 0', borderBottom: '1px solid #161616', opacity: unlocked ? 1 : 0.55 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: unlocked ? '#e5e5e5' : '#999', fontSize: '0.875rem', fontWeight: 600 }}>
                    {f.name} {!unlocked && '👑'} {!f.live && unlocked && <span style={{ ...muted, fontSize: '0.75rem' }}>(coming soon)</span>}
                  </div>
                  <div style={{ ...muted, fontSize: '0.75rem' }}>{f.desc}</div>
                </div>
                {unlocked ? (
                  <span style={{ width: '2.5rem', height: '1.375rem', borderRadius: '999px', background: f.live ? '#7c3aed' : '#333', position: 'relative', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: '0.1875rem', left: f.live ? '1.25rem' : '0.25rem', width: '1rem', height: '1rem', borderRadius: '50%', background: '#fff' }} />
                  </span>
                ) : (
                  <a href="/pricing" style={{ padding: '0.375rem 0.75rem', borderRadius: '0.5rem', background: '#161616', border: '1px solid #333', color: '#c084fc', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                    {tierLabel[f.need]} 👑
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* ============ ACCESSIBILITY ============ */}
        <div style={card}>
          <h2 style={h2}>Accessibility</h2>
          <div style={{ ...muted, marginBottom: '0.75rem' }}>Applies across BoDiGi immediately, saved on this device.</div>

          <div style={{ padding: '0.625rem 0', borderBottom: '1px solid #161616' }}>
            <div style={{ color: '#e5e5e5', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem' }}>Text size</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['normal', 'large', 'xlarge'] as const).map((s) => (
                <button key={s} onClick={() => updatePrefs({ fontSize: s })} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${prefs.fontSize === s ? '#7c3aed' : '#2a2a2a'}`, background: prefs.fontSize === s ? '#7c3aed22' : '#111', color: prefs.fontSize === s ? '#c4b5fd' : '#999', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  {s === 'normal' ? 'A' : s === 'large' ? 'A+' : 'A++'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid #161616' }}>
            <div>
              <div style={{ color: '#e5e5e5', fontSize: '0.875rem', fontWeight: 600 }}>High contrast</div>
              <div style={{ ...muted, fontSize: '0.75rem' }}>Boosts contrast across the app</div>
            </div>
            <button onClick={() => updatePrefs({ contrast: prefs.contrast === 'high' ? 'normal' : 'high' })} style={{ width: '2.5rem', height: '1.375rem', borderRadius: '999px', background: prefs.contrast === 'high' ? '#7c3aed' : '#333', position: 'relative', border: 'none', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', top: '0.1875rem', left: prefs.contrast === 'high' ? '1.25rem' : '0.25rem', width: '1rem', height: '1rem', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0' }}>
            <div>
              <div style={{ color: '#e5e5e5', fontSize: '0.875rem', fontWeight: 600 }}>Reduce motion</div>
              <div style={{ ...muted, fontSize: '0.75rem' }}>Turns off animations and transitions</div>
            </div>
            <button onClick={() => updatePrefs({ reduceMotion: !prefs.reduceMotion })} style={{ width: '2.5rem', height: '1.375rem', borderRadius: '999px', background: prefs.reduceMotion ? '#7c3aed' : '#333', position: 'relative', border: 'none', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', top: '0.1875rem', left: prefs.reduceMotion ? '1.25rem' : '0.25rem', width: '1rem', height: '1rem', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
            </button>
          </div>
        </div>

        {/* ============ ACCOUNT ============ */}
        <div style={card}>
          <h2 style={h2}>Account</h2>
          <div style={{ ...muted, marginBottom: '0.5rem' }}>{user.email}</div>
          <div style={{ display: 'flex', gap: '0.875rem' }}>
            <a href="/forgot-password" style={{ ...muted, color: '#a78bfa', textDecoration: 'none' }}>Reset password</a>
            <a href="/setup" style={{ ...muted, color: '#a78bfa', textDecoration: 'none' }}>API keys & connections</a>
          </div>
        </div>
      </div>
    </div>
  );
}
