'use client';

/**
 * ForkButton — one click copies a template app into the user's account.
 * Handles auth (redirect to login), quota (upgrade prompt), and
 * redirects to their new project on success.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForkButton({ projectId, size = 'normal' }: {
  projectId: string;
  size?: 'normal' | 'small';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function fork() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/templates/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/dashboard/${data.projectId}`);
      } else if (res.status === 401) {
        router.push('/login?next=/templates');
      } else if (res.status === 402 && data.requiresPurchase) {
        // Paid template — start checkout
        const buyRes = await fetch('/api/templates/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        const buyData = await buyRes.json();
        if (buyRes.ok && buyData.checkoutUrl) {
          window.location.href = buyData.checkoutUrl;
        } else {
          setError(buyData.error || 'Could not start checkout.');
          setBusy(false);
        }
      } else {
        setError(data.error || 'Could not fork — try again.');
        setBusy(false);
      }
    } catch {
      setError('Network error — try again.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={fork}
        disabled={busy}
        className={
          size === 'small'
            ? 'px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-xs font-semibold disabled:opacity-60'
            : 'w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold disabled:opacity-60'
        }
      >
        {busy ? 'Forking…' : '🍴 Fork this app'}
      </button>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
