'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Flash sale banner — a REAL limited-time deal with an actual end time.
 * No fake countdowns: when NEXT_PUBLIC_FLASH_SALE_ENDS passes, the banner
 * disappears. To run a deal, set these env vars in Vercel and redeploy:
 *   NEXT_PUBLIC_FLASH_SALE_ENDS   — ISO date, e.g. 2026-09-17T04:00:00Z
 *   NEXT_PUBLIC_FLASH_SALE_TEXT   — e.g. "Flash deal: $10 off any plan"
 *   NEXT_PUBLIC_FLASH_SALE_CODE   — e.g. FLASH10
 * When NEXT_PUBLIC_FLASH_SALE_ENDS is unset or past, this renders nothing.
 */
export function FlashSale() {
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState('');

  const ends = process.env.NEXT_PUBLIC_FLASH_SALE_ENDS;
  const text = process.env.NEXT_PUBLIC_FLASH_SALE_TEXT || 'Flash deal: $10 off any plan';
  const code = process.env.NEXT_PUBLIC_FLASH_SALE_CODE || '';

  useEffect(() => {
    if (!ends) return;
    const endTime = new Date(ends).getTime();
    if (isNaN(endTime)) return;

    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setVisible(false);
        return;
      }
      setVisible(true);
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(
        hours > 0
          ? `${hours}h ${mins}m ${secs}s`
          : `${mins}m ${secs}s`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [ends]);

  if (!visible) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium">
        <span>⚡ {text}</span>
        <span className="font-mono font-bold tabular-nums">{countdown}</span>
        {code && (
          <span className="bg-white/20 rounded px-2 py-0.5 font-mono text-xs uppercase tracking-wide">
            Code: {code}
          </span>
        )}
        <Link href="/pricing" className="underline underline-offset-2 hover:no-underline">
          Grab it now →
        </Link>
      </div>
    </div>
  );
}
