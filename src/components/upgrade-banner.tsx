'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Rocket, X } from 'lucide-react';

/**
 * Upgrade banner — shown at the top of every dashboard page for free-tier
 * users. Hides for paid tiers, admins, and signed-out visitors.
 */
export function UpgradeBanner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // null = unknown, 'loading' handled by tier===null; fail CLOSED — a failed
  // profile fetch must never downgrade a paying user to "free" and nag them.
  const [tier, setTier] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('tier, role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) return; // fetch failed → stay null → banner stays hidden
        if (data?.role === 'admin') {
          setTier('admin');
        } else {
          setTier(data?.tier || 'free');
        }
      });
  }, [user]);

  if (loading || !user || !tier || tier !== 'free' || dismissed) return null;

  return (
    <div
      role="banner"
      aria-label="Upgrade your BoDiGi 2.0 plan to deploy your app and keep it permanently"
      className="w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 px-4 py-2.5 flex items-center justify-center gap-3 text-sm"
    >
      <Rocket className="w-4 h-4 text-white shrink-0" />
      <p className="text-white font-medium text-center">
        You&apos;re on the Free plan — your app preview expires in 7 days.{' '}
        <span className="hidden sm:inline">Upgrade to deploy it for real, download your code, and keep it forever.</span>
      </p>
      <button
        onClick={() => router.push('/pricing')}
        className="shrink-0 px-4 py-1 rounded-full bg-white text-fuchsia-700 font-semibold text-xs hover:bg-fuchsia-50 transition"
      >
        Upgrade Now
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss upgrade banner"
        className="shrink-0 text-white/60 hover:text-white transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
