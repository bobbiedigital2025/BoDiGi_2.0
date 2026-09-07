'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Sparkles, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black" />
      <div className="relative z-10 text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold mb-3">Something went wrong</h1>
        <p className="text-white/50 mb-2">
          An unexpected error occurred. Our team has been notified.
        </p>
        {error.digest && (
          <p className="text-white/30 text-xs mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-8">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 font-medium hover:opacity-90 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/20 font-medium hover:bg-white/5 transition"
          >
            <Home className="w-4 h-4" />
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
