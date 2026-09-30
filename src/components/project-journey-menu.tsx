'use client';

/**
 * ProjectJourneyMenu — the per-project nav dropdown.
 *
 * Bobbie (Sept 29 2026): "we need a customer nav dropdown specific to each
 * project to remind them where they was on that project."
 *
 * Lives in the project header. The button shows the CURRENT step so the
 * header itself is a reminder; the dropdown lists the full journey with
 * done/current markers, click-to-jump, and — if they've been away — a
 * "last visit you were at…" line read from localStorage.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Sparkles, KeyRound, Rocket, ChevronDown, ExternalLink, PartyPopper } from 'lucide-react';
import type { ProjectFlow } from './use-project-flow';

const STEPS = [
  { n: 1, label: 'Build your app', icon: Sparkles },
  { n: 2, label: 'Add API keys', icon: KeyRound },
  { n: 3, label: 'Deploy it live', icon: Rocket },
  { n: 4, label: 'It’s live!', icon: PartyPopper },
] as const;

const LAST_VISIT_KEY = (id: string) => `bodigi-journey-${id}`;

export default function ProjectJourneyMenu({
  projectId,
  flow,
}: {
  projectId: string;
  flow: ProjectFlow;
}) {
  const [open, setOpen] = useState(false);
  const [lastVisitStep, setLastVisitStep] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Read the stored step from the last visit; write the current one.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_VISIT_KEY(projectId));
      if (raw) setLastVisitStep(parseInt(raw, 10));
      localStorage.setItem(LAST_VISIT_KEY(projectId), String(flow.step));
    } catch { /* private mode etc. */ }
    // Only on mount + when the step actually changes
  }, [projectId, flow.step]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = STEPS[flow.step - 1];
  const CurrentIcon = current.icon;
  const progressed = lastVisitStep !== null && flow.step > lastVisitStep;

  const go = (n: number) => {
    setOpen(false);
    if (n === 1) window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (n === 2) flow.goToKeys();
    else if (n === 3) flow.goToDeploy();
    else if (n === 4 && flow.deploymentUrl) window.open(flow.deploymentUrl, '_blank', 'noopener');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition px-2.5 py-1.5 text-xs text-white/80"
        title="Your journey on this project"
      >
        <CurrentIcon className="w-3.5 h-3.5 text-fuchsia-400" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-white/10 bg-[#0d0d14]/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-2 z-50">
          <div className="px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-white/35">
            Where you are on this project
          </div>

          {progressed && (
            <div className="mx-1.5 mb-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 text-xs text-emerald-300">
              Progress since your last visit — you were at “{STEPS[lastVisitStep - 1].label}”.
            </div>
          )}

          {STEPS.map(({ n, label, icon: Icon }) => {
            const done = flow.step > n;
            const here = flow.step === n;
            return (
              <button
                key={n}
                onClick={() => go(n)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition text-left ${
                  here ? 'bg-white/10 text-white' : done ? 'text-white/60 hover:bg-white/5' : 'text-white/30 hover:bg-white/5'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  done ? 'bg-emerald-500/20 text-emerald-400' : here ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-white/5 text-white/25'
                }`}>
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </span>
                <span className="flex-1">{label}</span>
                {here && <span className="text-[10px] text-fuchsia-300/80 font-medium uppercase tracking-wide">you are here</span>}
                {n === 4 && flow.deploymentUrl && <ExternalLink className="w-3 h-3 text-white/30" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
