'use client';

/**
 * Reverse-trial UI:
 *  - Active trial  → gold countdown banner ("X days of Pro left")
 *  - Expired trial → "what you lost" panel (loss aversion converts
 *    better than aspiration — show the wound, then the bandage)
 *  - Everyone else → nothing
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth-context';
import { createClient } from '@/lib/supabase/client';
import { isTrialActive, isTrialExpired, trialDaysLeft } from '@/lib/trial';

interface TrialProfile {
  tier: string;
  is_trial: boolean;
  tier_expires_at: string | null;
}

const LOST = [
  'Unlimited builds (back to 1 per month)',
  'AI modifications by Mend',
  'Version history & rollback',
  'Engagement loop wiring',
  'The Day-2 Agent',
  'Clean, watermark-free docs',
];

export default function TrialBanner() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TrialProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('tier, is_trial, tier_expires_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data as TrialProfile | null));
  }, [user]);

  if (!profile?.is_trial) return null;

  if (isTrialActive(profile)) {
    const days = trialDaysLeft(profile);
    return (
      <div className="mb-6 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-amber-300 font-semibold">
          Pro trial — {days} {days === 1 ? 'day' : 'days'} left
        </span>
        <span className="text-neutral-300">
          Everything is unlocked except code export.
        </span>
        <Link href="/pricing" className="ml-auto text-amber-300 underline underline-offset-2 hover:text-amber-200">
          Keep Pro →
        </Link>
      </div>
    );
  }

  if (isTrialExpired(profile)) {
    return (
      <div className="mb-6 rounded-lg border border-red-400/40 bg-red-950/40 px-5 py-4">
        <p className="text-red-300 font-semibold mb-1">Your Pro trial has ended</p>
        <p className="text-neutral-400 text-sm mb-3">You&apos;re on the Free plan now. Here&apos;s what went away:</p>
        <ul className="text-sm text-neutral-300 space-y-1 mb-4">
          {LOST.map((item) => (
            <li key={item} className="flex gap-2"><span className="text-red-400">✕</span>{item}</li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="inline-block rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Get Pro back — $49/mo
        </Link>
      </div>
    );
  }

  return null;
}
