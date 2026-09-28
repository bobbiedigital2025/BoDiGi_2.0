'use client';

/**
 * ApiKeysSection — "API Keys & Connections" for the Settings page.
 * One place to see every stored key across all projects: provider,
 * name, validity, last checked — with add/remove inline.
 * Backed by /api/setup-agent/keys (encrypted at rest, never displayed).
 */

import { useEffect, useState, useCallback } from 'react';

interface ApiKey {
  id: string;
  provider: string;
  keyName: string;
  isValid: boolean;
  lastChecked: string | null;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
}

const PROVIDER_ICON: Record<string, string> = {
  telnyx: '⚡',
  supabase: '🗄️',
  vercel: '▲',
  openai: '🤖',
  anthropic: '🧠',
  github: '🐙',
  custom: '🔑',
};

export function ApiKeysSection({ projects }: { projects: Project[] }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newProject, setNewProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/setup-agent/keys');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load keys');
      setKeys(data.keys || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addKey = async () => {
    if (!newName || !newValue) return;
    setBusy(true);
    setFeedback('');
    try {
      const res = await fetch('/api/setup-agent/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: newName, keyValue: newValue, projectId: newProject || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save key');
      setNewName(''); setNewValue(''); setNewProject('');
      setShowAdd(false);
      setFeedback('Key saved — encrypted and stored.');
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async (id: string) => {
    setBusy(true);
    setFeedback('');
    try {
      const res = await fetch(`/api/setup-agent/keys?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete key');
      setFeedback('Key removed.');
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to delete key');
    } finally {
      setBusy(false);
    }
  };

  const input = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    borderRadius: '0.5rem',
    background: '#111',
    border: '1px solid #2a2a2a',
    color: '#fff',
    fontSize: '0.875rem',
    marginBottom: '0.75rem',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ margin: 0, color: '#888', fontSize: '0.8125rem' }}>
          Keys for your apps and connections — encrypted at rest, never displayed in full.
        </p>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg,#7c3aed,#c026d3)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Add key
        </button>
      </div>

      {feedback && <div style={{ color: '#a78bfa', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{feedback}</div>}

      {showAdd && (
        <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
          <input style={input} placeholder="Key name (e.g. TELNYX_API_KEY)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input style={input} type="password" placeholder="Paste the key value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <select style={input} value={newProject} onChange={(e) => setNewProject(e.target.value)}>
            <option value="">Account-wide (all apps)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={addKey} disabled={busy || !newName || !newValue} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg,#7c3aed,#c026d3)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy || !newName || !newValue ? 0.5 : 1 }}>
              {busy ? 'Saving…' : 'Save key'}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: '#161616', color: '#999', border: '1px solid #2a2a2a', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#666', fontSize: '0.875rem' }}>Loading your keys…</div>
      ) : error ? (
        <div style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</div>
      ) : keys.length === 0 ? (
        <div style={{ color: '#666', fontSize: '0.875rem' }}>
          No keys stored yet. Add your first key above — Telnyx (AI), Supabase (database), Vercel (hosting), GitHub (export).
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#0d0d0d', border: '1px solid #222', borderRadius: '0.625rem' }}>
              <span style={{ fontSize: '1.1rem' }}>{PROVIDER_ICON[k.provider] || '🔑'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 600 }}>{k.keyName}</div>
                <div style={{ color: '#777', fontSize: '0.75rem' }}>
                  {k.provider}
                  {k.lastChecked ? ` · checked ${new Date(k.lastChecked).toLocaleDateString()}` : ''}
                </div>
              </div>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: k.isValid ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)', color: k.isValid ? '#4ade80' : '#f87171', border: `1px solid ${k.isValid ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                {k.isValid ? 'Valid' : 'Invalid'}
              </span>
              <button onClick={() => removeKey(k.id)} disabled={busy} style={{ background: 'none', border: 'none', color: '#a33', fontSize: '0.75rem', cursor: 'pointer', padding: '0.25rem 0.5rem' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
