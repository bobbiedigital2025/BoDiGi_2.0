'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import {
  Sparkles, ChevronDown, ChevronRight, Settings, LogOut, LayoutDashboard,
  ShieldCheck, LifeBuoy, Plus, FolderKanban, BookOpen, KeyRound, Megaphone,
  Inbox,
} from 'lucide-react';

interface NavProject {
  id: string;
  name: string;
  status: string;
}

interface NavTicket {
  id: string;
  subject: string;
  user_email: string | null;
  project_name: string | null;
  status: string;
  created_at: string;
}

/**
 * AppNav — global navigation for all logged-in pages.
 * Brand left, actions right, profile dropdown with tier badge,
 * settings, admin (role-gated), support, sign out.
 */
export function AppNav() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [projects, setProjects] = useState<NavProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [tickets, setTickets] = useState<NavTicket[]>([]);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);
  const inboxRef = useRef<HTMLDivElement>(null);
  const isAdminNow = profile?.role === 'admin';

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
      if (appsRef.current && !appsRef.current.contains(e.target as Node)) setAppsOpen(false);
      if (inboxRef.current && !inboxRef.current.contains(e.target as Node)) setInboxOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Admins: poll the open-ticket count (and full list for the dropdown)
  useEffect(() => {
    if (!isAdminNow || !user) return;
    let cancelled = false;
    const load = () => {
      fetch('/api/admin/support')
        .then((r) => (r.ok ? r.json() : { tickets: [] }))
        .then((data) => {
          if (cancelled) return;
          const list: NavTicket[] = data.tickets || [];
          setTickets(list);
          setOpenTicketCount(list.filter((t) => t.status === 'open').length);
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAdminNow, user]);

  // Load the user's apps when the dropdown first opens
  useEffect(() => {
    if (!appsOpen || projectsLoaded || !user) return;
    fetch('/api/generate')
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((data) => {
        setProjects(data.projects || []);
        setProjectsLoaded(true);
      })
      .catch(() => setProjectsLoaded(true));
  }, [appsOpen, projectsLoaded, user]);

  if (!user) return null;

  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  const hasMarketing = isAdmin || tier === 'pro' || tier === 'enterprise';
  const hasDeploy = isAdmin || tier !== 'free';
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
  const statusDot = (status: string) =>
    status === 'completed' ? 'bg-emerald-400'
    : status === 'expired' ? 'bg-red-400'
    : status === 'failed' ? 'bg-red-400'
    : 'bg-amber-400 animate-pulse';

  return (
    <header className="border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between bg-black/80 backdrop-blur sticky top-0 z-[110]">
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
        {/* My Apps — tier list of the user's built apps, each with docs/deploy/marketing links */}
        <div className="relative" ref={appsRef}>
          <button
            onClick={() => setAppsOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 text-sm text-white/70 hover:text-white transition"
          >
            <FolderKanban className="w-4 h-4" /> My apps
            <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform ${appsOpen ? 'rotate-180' : ''}`} />
          </button>

          {appsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/60 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/10">
                <div className="text-sm font-semibold">Your apps</div>
                <div className="text-[11px] text-white/40 mt-0.5">Everything you've built, in one place</div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {!projectsLoaded ? (
                  <div className="px-4 py-6 text-sm text-white/40 text-center">Loading your apps…</div>
                ) : projects.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-white/50 mb-3">No apps yet.</p>
                    <button
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-medium"
                      onClick={() => { setAppsOpen(false); router.push('/'); }}
                    >
                      Build your first app
                    </button>
                  </div>
                ) : (
                  projects.map((p) => {
                    const expanded = expandedApp === p.id;
                    return (
                      <div key={p.id} className="border-b border-white/5 last:border-b-0">
                        <button
                          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/5 transition text-left"
                          onClick={() => setExpandedApp(expanded ? null : p.id)}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(p.status)}`} />
                            <span className="text-sm text-white/80 truncate">{p.name || 'Untitled app'}</span>
                          </span>
                          <ChevronRight className={`w-3.5 h-3.5 text-white/40 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>

                        {expanded && (
                          <div className="pb-2.5 px-2">
                            <button className={item} onClick={() => { setAppsOpen(false); router.push(`/preview/${p.id}`); }}>
                              <LayoutDashboard className="w-4 h-4" /> Open app
                            </button>
                            <button className={item} onClick={() => { setAppsOpen(false); router.push(`/preview/${p.id}#docs`); }}>
                              <BookOpen className="w-4 h-4" /> Docs
                            </button>
                            {hasDeploy && (
                              <button className={item} onClick={() => { setAppsOpen(false); router.push(`/preview/${p.id}#deploy`); }}>
                                <KeyRound className="w-4 h-4" /> Deploy &amp; API keys
                              </button>
                            )}
                            {hasMarketing && (
                              <button className={item} onClick={() => { setAppsOpen(false); router.push(`/preview/${p.id}#marketing`); }}>
                                <Megaphone className="w-4 h-4" /> Marketing kit
                              </button>
                            )}
                            <button className={item} onClick={() => { setAppsOpen(false); router.push(`/dashboard/${p.id}`); }}>
                              <FolderKanban className="w-4 h-4" /> Build details
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-white/10 py-1">
                <button className={item} onClick={() => { setAppsOpen(false); router.push('/dashboard'); }}>
                  <LayoutDashboard className="w-4 h-4" /> View all on dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => router.push('/')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="w-3.5 h-3.5" /> New app
        </button>

        {/* Support — opens the AI support chat panel (persisted conversation) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bodigi:open-support'))}
          title="Support chat"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 text-sm text-white/70 hover:text-white transition"
        >
          <LifeBuoy className="w-4 h-4" /> <span className="hidden sm:inline">Support</span>
        </button>

        {/* Admin support inbox — bell with open-ticket badge, dropdown of recent tickets */}
        {isAdmin && (
          <div className="relative" ref={inboxRef}>
            <button
              onClick={() => setInboxOpen((o) => !o)}
              title="Support inbox"
              className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 hover:border-white/25 text-white/70 hover:text-white transition"
            >
              <Inbox className="w-4 h-4" />
              {openTicketCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {openTicketCount > 9 ? '9+' : openTicketCount}
                </span>
              )}
            </button>

            {inboxOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/60 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Support inbox</div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {openTicketCount > 0 ? `${openTicketCount} open ticket${openTicketCount !== 1 ? 's' : ''}` : 'All clear'}
                    </div>
                  </div>
                  <button
                    onClick={() => { setInboxOpen(false); router.push('/admin'); }}
                    className="text-[11px] text-fuchsia-400 hover:underline"
                  >
                    Open admin
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {tickets.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-white/40">
                      No tickets — the AI chat is handling everything.
                    </div>
                  ) : (
                    tickets.slice(0, 10).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setInboxOpen(false); router.push('/admin'); }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'open' ? 'bg-red-400' : t.status === 'resolved' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span className="text-sm truncate flex-1">{t.subject}</span>
                        </div>
                        <div className="text-[11px] text-white/40 mt-1 truncate">
                          {t.user_email || 'unknown'}{t.project_name ? ` · ${t.project_name}` : ''} · {new Date(t.created_at).toLocaleDateString()}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/60 overflow-hidden z-50">
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
