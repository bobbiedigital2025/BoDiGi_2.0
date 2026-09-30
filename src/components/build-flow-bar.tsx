'use client';

/**
 * BuildFlowBar — the guided conveyor belt at the bottom of the project page.
 * Journey state comes from useProjectFlow (shared with the header menu).
 */

import { Check, Sparkles, KeyRound, Rocket, ArrowRight, Loader2, PartyPopper, TriangleAlert } from 'lucide-react';
import type { ProjectFlow } from './use-project-flow';

const steps = [
  { n: 1, label: 'Build', icon: Sparkles },
  { n: 2, label: 'Configure', icon: KeyRound },
  { n: 3, label: 'Deploy', icon: Rocket },
];

export default function BuildFlowBar({ flow }: { flow: ProjectFlow }) {
  const { step, missingCount, deploymentUrl, goToKeys, goToDeploy, buildFailed } = flow;

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
            {buildFailed && (
              <div className="flex items-center gap-2 text-sm text-red-300">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                <span className="truncate">Build hit an error — check the pipeline log above.</span>
              </div>
            )}
            {!buildFailed && step === 1 && (
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
                <span className="text-white/60 font-normal">({missingCount} left)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={goToDeploy}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 transition shadow-lg shadow-fuchsia-600/20"
              >
                Next: deploy your app — it&apos;s ready
                <Rocket className="w-4 h-4" />
              </button>
            )}
            {step === 4 && (
              <div className="flex items-center gap-3">
                <a
                  href={deploymentUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition shadow-lg shadow-emerald-600/20"
                >
                  <PartyPopper className="w-4 h-4" />
                  View your working application
                </a>
                <button
                  onClick={goToDeploy}
                  className="text-xs text-white/40 hover:text-white/70 transition shrink-0"
                  title="Redeploy or manage"
                >
                  manage
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
