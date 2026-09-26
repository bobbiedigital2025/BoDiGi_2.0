'use client';

/**
 * VersionHistory — lists every modification snapshot (restore point) for a
 * project and lets the user roll back to any of them. Snapshots are written
 * by the modify route before every change, and a rollback itself creates a
 * new snapshot — so undo is always reversible.
 */

import { useState, useEffect } from 'react';

interface SnapshotEntry {
  id: number;
  timestamp: number;
  instruction: string;
  files: string[];
}

export default function VersionHistory({ projectId, tier, isAdmin }: {
  projectId: string;
  tier: string;
  isAdmin: boolean;
}) {
  const [history, setHistory] = useState<SnapshotEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const eligible = isAdmin || tier === 'pro' || tier === 'enterprise';

  const load = async () => {
    try {
      const res = await fetch(`/api/generate/${projectId}/history`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    if (open && history === null) load();
  }, [open, history]);

  const restore = async (logId: number) => {
    setBusyId(logId);
    setConfirmId(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      if (res.ok && data.restored) {
        setMessage({ kind: 'ok', text: `Rolled back ${data.filesRestored} file${data.filesRestored === 1 ? '' : 's'} — refresh the preview to see it. This rollback is itself undoable.` });
        load(); // refresh list — the rollback added a new snapshot
      } else {
        setMessage({ kind: 'err', text: data.error || 'Rollback failed — try again.' });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Connection hiccup — try again.' });
    } finally {
      setBusyId(null);
    }
  };

  const timeAgo = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            🕘 Version history
            {history && history.length > 0 && (
              <span className="text-xs font-normal text-white/40">{history.length} restore point{history.length === 1 ? '' : 's'}</span>
            )}
          </h3>
          <p className="text-xs text-white/40 mt-0.5">Every change is snapshotted. Roll back to any point — undoable.</p>
        </div>
        <span className="text-white/40 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && !eligible && (
        <div className="mt-4 text-sm text-white/60">
          Version history is a Pro feature.{' '}
          <a href="/pricing" className="text-fuchsia-400 underline">Upgrade</a> to unlock rollbacks.
        </div>
      )}

      {open && eligible && (
        <div className="mt-4 space-y-2">
          {history === null && <p className="text-sm text-white/40">Loading…</p>}
          {history !== null && history.length === 0 && (
            <p className="text-sm text-white/40">No modifications yet — snapshots appear here after your first change.</p>
          )}
          {message && (
            <div className={`text-sm rounded-lg px-3 py-2 ${message.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
              {message.text}
            </div>
          )}
          {history?.map((snap) => (
            <div key={snap.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-white/85 truncate">“{snap.instruction}”</div>
                <div className="text-[11px] text-white/35 mt-0.5">
                  {timeAgo(snap.timestamp)} · {snap.files.length} file{snap.files.length === 1 ? '' : 's'}: {snap.files.slice(0, 3).join(', ')}{snap.files.length > 3 ? ` +${snap.files.length - 3} more` : ''}
                </div>
              </div>
              {confirmId === snap.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => restore(snap.id)}
                    disabled={busyId === snap.id}
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-medium hover:bg-red-500/30 transition disabled:opacity-50"
                  >
                    {busyId === snap.id ? 'Restoring…' : 'Confirm rollback'}
                  </button>
                  <button onClick={() => setConfirmId(null)} className="text-xs text-white/40 hover:text-white/70">cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(snap.id)}
                  disabled={busyId !== null}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-white/5 border border-white/15 text-white/70 text-xs hover:bg-white/10 transition disabled:opacity-50"
                >
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
