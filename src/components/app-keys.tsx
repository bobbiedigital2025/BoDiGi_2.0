'use client';

/**
 * AppKeysPanel — one place to feed an app every key it needs.
 *
 * The PM Agent declares requiredApis (provider, env vars, signup link, cost).
 * This panel renders each service with inline token inputs that save
 * per-project through /api/setup-agent/keys — no hunting through a separate
 * Setup page at the moment of intent. Saved keys show a check; re-entering
 * a key replaces it.
 */

import { useEffect, useState } from 'react';

interface RequiredApi {
  provider: string;
  reason: string;
  envVars: string[];
  signupUrl?: string;
  costNote?: string;
  required?: boolean;
}

export default function AppKeysPanel({ projectId, requiredApis }: {
  projectId: string;
  requiredApis: RequiredApi[];
}) {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { kind: 'ok' | 'err'; text: string }>>({});

  const refresh = () => {
    fetch(`/api/setup-agent/keys?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((d) => {
        const map: Record<string, boolean> = {};
        for (const k of d.keys || d || []) {
          if (k.key_name) map[k.key_name] = true;
        }
        setSaved(map);
      })
      .catch(() => {});
  };

  useEffect(refresh, [projectId]);

  async function saveKey(envVar: string) {
    const value = (drafts[envVar] || '').trim();
    if (!value || busyKey) return;
    setBusyKey(envVar);
    try {
      const res = await fetch('/api/setup-agent/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyName: envVar, keyValue: value, projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved((s) => ({ ...s, [envVar]: true }));
        setDrafts((d) => ({ ...d, [envVar]: '' }));
        setEditing((e) => ({ ...e, [envVar]: false }));
        setMsgs((m) => ({ ...m, [envVar]: { kind: 'ok', text: 'Saved ✓' } }));
      } else {
        setMsgs((m) => ({ ...m, [envVar]: { kind: 'err', text: data.error || 'Save failed' } }));
      }
    } catch {
      setMsgs((m) => ({ ...m, [envVar]: { kind: 'err', text: 'Network error' } }));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-3">
      {requiredApis.map((api, i) => (
        <div key={i} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white/90 flex items-center gap-2">
                {api.provider}
                {api.required
                  ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25">required</span>
                  : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10">optional</span>}
                {api.envVars.every((v) => saved[v]) && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">connected</span>
                )}
              </div>
              <div className="text-xs text-white/50 mt-0.5">{api.reason}</div>
              {api.costNote && <div className="text-[11px] text-emerald-400/70 mt-0.5">{api.costNote}</div>}
            </div>
            {api.signupUrl && (
              <a href={api.signupUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-fuchsia-400 hover:underline mt-0.5">
                Get keys →
              </a>
            )}
          </div>

          <div className="mt-2.5 space-y-2">
            {api.envVars.map((envVar) => (
              <div key={envVar}>
                <div className="flex items-center gap-2">
                  <code className="text-[11px] text-white/45 font-mono w-52 truncate shrink-0" title={envVar}>{envVar}</code>
                  {saved[envVar] && !editing[envVar] ? (
                    <>
                      <span className="text-xs text-emerald-400 flex-1">✓ saved — encrypted</span>
                      <button
                        onClick={() => setEditing((e) => ({ ...e, [envVar]: true }))}
                        className="text-[11px] text-white/35 hover:text-white/70 underline"
                      >
                        replace
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="password"
                        value={drafts[envVar] || ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [envVar]: e.target.value }))}
                        placeholder="paste key…"
                        className="flex-1 bg-black border border-white/15 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-fuchsia-500/50"
                      />
                      <button
                        onClick={() => saveKey(envVar)}
                        disabled={busyKey === envVar || (drafts[envVar] || '').trim().length < 8}
                        className="text-xs px-2.5 py-1 rounded bg-white text-black font-medium disabled:opacity-40"
                      >
                        {busyKey === envVar ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
                {msgs[envVar] && (
                  <p className={`text-[11px] mt-1 ${msgs[envVar].kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {msgs[envVar].text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-white/35">
        Keys save to this app only, encrypted. BoDiGi uses them when previewing, deploying, and exporting {`—`} you never have to paste them twice.
      </p>
    </div>
  );
}
