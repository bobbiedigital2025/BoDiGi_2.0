'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import {
  Sparkles, ChevronDown, Settings, LogOut, LayoutDashboard,
  ShieldCheck, LifeBuoy, Plus,
} from 'lucide-react';

/**
 * AppNav — global navigation for all logged-in pages.
 * Brand left, actions right, profile dropdown with tier badge,
 * settings, admin (role-gated), support, sign out.
 */
export function AppNav() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;

  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  const initial = (user.email || '?')[0].toUpperCase();

  const tierColor =
    tier === 'enterprise' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    : tier === 'pro' ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
    : tier === 'starter' ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    : 'bg-white/10 text-white/50 border-white/10';

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.push('/login');
  };

  const item = 'w-full flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition';

  return (
    <header className="border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between bg-black/80 backdrop-blur sticky top-0 z-40">
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2.5 hover:opacity-80 transition"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <span className="font-semibold text-sm sm:text-base">BoDiGi 2.0</span>
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="w-3.5 h-3.5" /> New app
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-white/10 hover:border-white/25 transition"
          >
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">
              {initial}
            </span>
            <span className={`hidden sm:inline text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${tierColor}`}>
              {isAdmin ? 'admin' : tier}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <div className="text-sm font-medium truncate">{user.email}</div>
                <div className={`inline-block mt-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${tierColor}`}>
                  {isAdmin ? 'Admin · Pro' : `${tier} plan`}
                </div>
              </div>

              <div className="py-1">
                <button className={item} onClick={() => { setOpen(false); router.push('/dashboard'); }}>
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </button>
                <button className={item} onClick={() => { setOpen(false); router.push('/settings'); }}>
                  <Settings className="w-4 h-4" /> Settings
                </button>
                {(tier === 'starter' || tier === 'pro' || tier === 'enterprise' || isAdmin) && (
                  <a className={item} href="mailto:support@bobbie.digital?subject=BoDiGi%202.0%20support">
                    <LifeBuoy className="w-4 h-4" /> Priority support
                  </a>
                )}
                {isAdmin && (
                  <button className={item} onClick={() => { setOpen(false); router.push('/admin'); }}>
                    <ShieldCheck className="w-4 h-4" /> Admin panel
                  </button>
                )}
              </div>

              <div className="border-t border-white/10 py-1">
                <button className={`${item} text-red-400 hover:text-red-300`} onClick={handleSignOut}>
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
