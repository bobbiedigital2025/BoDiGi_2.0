'use client';

/**
 * BuildFlowBar — the guided conveyor belt after a build.
 *
 * Bobbie (Sept 29 2026): "it needs to be a smooth workflow in the app —
 * it should push the customer to the next task, not just sit on that
 * build page. There should be a next button at the bottom and it takes
 * them to setup, then next to deploy."
 *
 * Three steps, always visible once you land on a project:
 *   1. ✨ Build    — the pipeline (this page)
 *   2. 🔑 Configure — required API keys (same page, scrolls to the panel)
 *   3. 🚀 Deploy   — the preview page's deploy card
 *
 * The bar computes the current step from build status + saved keys and
 * shows one big honest CTA for what to do next.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, KeyRound, Rocket, ArrowRight, Loader2 } from 'lucide-react';

interface RequiredApi {
  provider: string;
  envVars: string[];
  required: boolean;
}

interface SavedKey {
  provider: string;
  key_name: string;
}

export default function BuildFlowBar({
  projectId,
  status,
  requiredApis,
}: {
  projectId: string;
  status: string;
  requiredApis?: RequiredApi[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedKey[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/setup-agent/keys?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSaved(data.keys || []);
      }
    } catch { /* keep last known state */ }
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    refresh();
    // Re-check when a key saves anywhere on the page, and on window focus
    // (users paste keys in the panel above, sometimes in another tab).
    const onSaved = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener('bodigi-keys-saved', onSaved);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('bodigi-keys-saved', onSaved);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const buildDone = status === 'done';
  const required = (requiredApis || []).filter(a => a.required !== false);
  const missing = required.flatMap(a =>
    a.envVars.filter(v => !saved.some(k => k.provider.toLowerCase() === a.provider.toLowerCase() && k.key_name === v))
      .map(v => `${a.provider}:${v}`)
  );
  const keysDone = loaded && missing.length === 0;

  // Step: 1 building, 2 needs keys, 3 ready to deploy
  const step = !buildDone ? 1 : !keysDone ? 2 : 3;

  const goToKeys = () => {
    const el = document.getElementById('api-keys');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-fuchsia-400', 'rounded-xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-fuchsia-400'), 2500);
    }
  };

  const steps = [
    { n: 1, label: 'Build', icon: Sparkles },
    { n: 2, label: 'Configure', icon: KeyRound },
    { n: 3, label: 'Deploy', icon: Rocket },
  ];

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0d0d14]/90 backdrop-blur-xl shadow-2xl shadow-black/50 px-4 py-3 flex items-center gap-4">
          {/* Step indicators */}
          <div className="flex items-center gap-1.5 shrink-0">
            {steps.map(({ n, label, icon: Icon }, i) => (
              <div key={n} className="flex items-center gap-1.5">
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition ${
                    step > n
                      ? 'text-emerald-400'
                      : step === n
                        ? 'text-white bg-white/10'
                        : 'text-white/30'
                  }`}
                  title={label}
                >
                  {step > n ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < steps.length - 1 && <div className="w-3 h-px bg-white/15" />}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex-1 min-w-0">
            {step === 1 && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                <span className="truncate">Building your app — watch the agents work…</span>
              </div>
            )}
            {step === 2 && (
              <button
                onClick={goToKeys}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 transition shadow-lg shadow-fuchsia-600/20"
              >
                Next: add your API keys
                <span className="text-white/60 font-normal">({missing.length} left)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => router.push(`/preview/${projectId}`)}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 transition shadow-lg shadow-fuchsia-600/20"
              >
                Next: deploy your app — it&apos;s ready
                <Rocket className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
