'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Users, FolderKanban, Activity, Shield, ArrowRight, LogOut, LifeBuoy, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/supabase/auth-context';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

interface AdminProject {
  id: string;
  name: string;
  idea: string;
  status: string;
  progress: number;
  created_at: string;
  user_email: string | null;
}

interface SupportTicket {
  id: string;
  user_email: string | null;
  project_name: string | null;
  subject: string;
  body: string;
  ai_summary: string | null;
  status: string;
  priority: string;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [replyStatus, setReplyStatus] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [userMenu, setUserMenu] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, completedProjects: 0, activeProjects: 0 });

  // Check if user is admin
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      checkAdmin();
    }
  }, [user, loading, router]);

  const checkAdmin = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user?.id)
      .single();

    if (data?.role === 'admin') {
      setIsAdmin(true);
      loadAdminData();
    }
    setCheckingAdmin(false);
  };

  const loadAdminData = async () => {
    const supabase = createClient();

    // Load all profiles (admin policy allows this)
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    setProfiles(profilesData || []);

    // Load all projects using the admin client via API
    const res = await fetch('/api/admin/projects');
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
      setStats({
        totalUsers: profilesData?.length || 0,
        totalProjects: data.projects?.length || 0,
        completedProjects: data.projects?.filter((p: AdminProject) => p.status === 'completed').length || 0,
        activeProjects: data.projects?.filter((p: AdminProject) => p.status !== 'completed').length || 0,
      });
    }

    // Load support tickets
    const tRes = await fetch('/api/admin/support');
    if (tRes.ok) {
      const tData = await tRes.json();
      setTickets(tData.tickets || []);
    }
  };

  const updateTicket = async (id: string, patch: Record<string, string>) => {
    const res = await fetch('/api/admin/support', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } as SupportTicket : t)));
    }
  };

  const sendReply = async (id: string, ticket: SupportTicket) => {
    const reply = (replyDrafts[id] || '').trim();
    if (!reply) return;
    setSendingReply(id);
    setReplyStatus((prev) => ({ ...prev, [id]: undefined as never }));
    try {
      const res = await fetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
      setReplyStatus((prev) => ({
        ...prev,
        [id]: { ok: true, msg: data.emailSent ? `Emailed to ${ticket.user_email}` : 'Saved (email not configured)' },
      }));
      setTickets((prev) =>
        prev.map((t) => (t.id === id && t.status === 'open' ? { ...t, status: 'in_progress' } : t))
      );
    } catch (err) {
      setReplyStatus((prev) => ({
        ...prev,
        [id]: { ok: false, msg: err instanceof Error ? err.message : 'Send failed' },
      }));
    } finally {
      setSendingReply(null);
    }
  };

  const updateUser = async (userId: string, patch: Record<string, string>) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...patch }),
    });
    if (res.ok) {
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, ...patch } as Profile : p)));
      setUserMenu(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading || checkingAdmin) {
    return <div className="min-h-screen bg-black" />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-white/40 mb-6">You need admin access to view this page.</p>
          <Button variant="gradient" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <Shield className="w-4 h-4" />
          </div>
          <h1 className="font-semibold">BoDiGi 2.0 Admin</h1>
          <Badge variant="info" className="ml-2">Admin Panel</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
            Dashboard <ArrowRight className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-3 h-3" /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                  <p className="text-xs text-white/40">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalProjects}</p>
                  <p className="text-xs text-white/40">Total Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completedProjects}</p>
                  <p className="text-xs text-white/40">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activeProjects}</p>
                  <p className="text-xs text-white/40">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Support Inbox — tickets the AI chat escalated to humans */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="w-4 h-4" /> Support Inbox
              {tickets.filter((t) => t.status === 'open').length > 0 && (
                <Badge variant="error">{tickets.filter((t) => t.status === 'open').length} open</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-white/40 text-sm">No support tickets. The AI chat is handling everything — nice.</p>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-lg border border-white/5">
                    <button
                      className="w-full flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-white/5 transition text-left"
                      onClick={() => setOpenTicket(openTicket === t.id ? null : t.id)}
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium block truncate">{t.subject}</span>
                        <span className="text-xs text-white/40">
                          {t.user_email || 'unknown user'}
                          {t.project_name ? ` · ${t.project_name}` : ''}
                          {' · ' + new Date(t.created_at).toLocaleDateString()}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <Badge variant={t.status === "open" ? "error" : t.status === "resolved" ? "success" : "info"}>{t.status}</Badge>
                        <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${openTicket === t.id ? 'rotate-180' : ''}`} />
                      </span>
                    </button>

                    {openTicket === t.id && (
                      <div className="px-3 pb-3 space-y-3">
                        <div className="rounded-lg bg-black/40 border border-white/10 p-3 text-sm text-white/70 whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {t.body}
                        </div>
                        {t.ai_summary && (
                          <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3 text-xs text-white/60">
                            <span className="font-semibold text-violet-300">AI summary:</span> {t.ai_summary}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {t.status === 'open' && (
                            <Button size="sm" variant="outline" onClick={() => updateTicket(t.id, { status: 'in_progress' })}>
                              Start working
                            </Button>
                          )}
                          {t.status !== 'resolved' && (
                            <Button size="sm" variant="gradient" onClick={() => updateTicket(t.id, { status: 'resolved', resolutionNote: 'Resolved by admin.' })}>
                              Mark resolved
                            </Button>
                          )}
                          {t.status !== 'closed' && (
                            <Button size="sm" variant="ghost" onClick={() => updateTicket(t.id, { status: 'closed' })}>
                              Close
                            </Button>
                          )}
                        </div>
                        {/* Reply by email */}
                        {t.user_email && t.status !== 'closed' && (
                          <div className="space-y-2">
                            <textarea
                              value={replyDrafts[t.id] || ''}
                              onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder={`Reply to ${t.user_email} by email...`}
                              rows={3}
                              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 resize-y"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="gradient"
                                disabled={!replyDrafts[t.id]?.trim() || sendingReply === t.id}
                                onClick={() => sendReply(t.id, t)}
                              >
                                {sendingReply === t.id ? 'Sending...' : 'Send reply'}
                              </Button>
                              {replyStatus[t.id] && (
                                <span className={`text-xs ${replyStatus[t.id].ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {replyStatus[t.id].msg}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <p className="text-white/40 text-sm">No users yet.</p>
            ) : (
              <div className="space-y-2">
                {profiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">
                        {(p.name || p.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.name || p.email}</p>
                        <p className="text-xs text-white/40">{p.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <button
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/10 hover:border-white/25 transition text-xs"
                          onClick={() => setUserMenu(userMenu === p.id ? null : p.id)}
                        >
                          <Badge variant={p.role === 'admin' ? 'success' : 'info'}>{p.role}</Badge>
                          {(p as Profile & { tier?: string }).tier && (
                            <Badge variant="info">{(p as Profile & { tier?: string }).tier}</Badge>
                          )}
                          <ChevronDown className="w-3 h-3 text-white/40" />
                        </button>
                        {userMenu === p.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-white/10 bg-slate-950 shadow-2xl z-10 py-1">
                            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-white/30">Set tier</div>
                            {['free', 'starter', 'pro', 'enterprise'].map((tier) => (
                              <button
                                key={tier}
                                className="w-full text-left px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5"
                                onClick={() => updateUser(p.id, { tier })}
                              >
                                {tier}
                              </button>
                            ))}
                            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-white/30 border-t border-white/10 mt-1">Set role</div>
                            <button
                              className="w-full text-left px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5"
                              onClick={() => updateUser(p.id, { role: 'admin' })}
                            >
                              Make admin
                            </button>
                            <button
                              className="w-full text-left px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5"
                              onClick={() => updateUser(p.id, { role: 'user' })}
                            >
                              Revoke admin
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-white/30">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4" /> All Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-white/40 text-sm">No projects yet.</p>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition cursor-pointer"
                    onClick={() => router.push(`/dashboard/${p.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-white/40 line-clamp-1">{p.idea}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.user_email && (
                        <span className="text-xs text-white/30">{p.user_email}</span>
                      )}
                      <Badge variant={p.status === 'completed' ? 'success' : 'info'}>
                        {p.status}
                      </Badge>
                      <span className="text-xs text-white/30">{p.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
