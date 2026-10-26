'use client';

/**
 * CONCEPT CARD — the approval moment (Bobbie's funnel catch, Oct 22 lock).
 *
 * Nova presents the concept: name, tagline, pitch, the screens, the
 * must-haves, and the NOT-building list (the trust move). The founder
 * approves in one look, or iterates: keep what they like, change what they
 * name. Nothing builds until they say yes.
 *
 * "If they don't care they'll approve the first offer" — zero friction for
 * low-care founders, three saved rebuilds for picky ones.
 */

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sparkles, CheckCircle2, RefreshCw, XCircle, Loader2, ShieldAlert,
  LayoutGrid, ListChecks, Ban, Palette, ArrowLeft
} from 'lucide-react';
import { AGENT_INTROS } from '@/lib/agents/agent-intros';
import { useAuth } from '@/lib/supabase/auth-context';

interface ConceptCard {
  name: string;
  tagline: string;
  pitch: string;
  screens: string[];
  mustHaves: string[];
  notBuilding: string[];
  look: string;
}

interface ConceptData {
  id: string;
  status: string;
  card: ConceptCard;
  card_version: number;
  classifier: string;
  classifier_reason: string | null;
  project_id: string | null;
}

export default function ConceptCardPage({ params }: { params: Promise<{ conceptId: string }> }) {
  const { conceptId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [concept, setConcept] = useState<ConceptData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<'approve' | 'iterate' | 'cancel' | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?redirect=/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/concept/${conceptId}`)
      .then((res) => {
        if (!res.ok) throw new Error('load failed');
        return res.json();
      })
      .then((data) => {
        setConcept(data.concept);
        setState('ready');
      })
      .catch(() => {
        setState('error');
        setError('Could not load the concept.');
      });
  }, [user, conceptId]);

  // A concept that reached building redirects to its build page
  useEffect(() => {
    if (concept?.status === 'building' && concept.project_id) {
      router.push(`/dashboard/${concept.project_id}`);
    }
  }, [concept, router]);

  const approve = async () => {
    setBusy('approve');
    setError('');
    try {
      const res = await fetch(`/api/concept/${conceptId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.projectId) {
        router.push(`/dashboard/${data.projectId}`);
        return;
      }
      if (data.upgradeUrl) {
        router.push(data.upgradeUrl);
        return;
      }
      setError(data.error || 'Could not start the build — try again.');
    } catch {
      setError('Connection hiccup — hit approve again.');
    } finally {
      setBusy(null);
    }
  };

  const iterate = async () => {
    if (!feedback.trim()) return;
    setBusy('iterate');
    setError('');
    try {
      const res = await fetch(`/api/concept/${conceptId}/iterate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const data = await res.json();
      if (data.card) {
        setConcept((prev) => (prev ? { ...prev, card: data.card, card_version: data.card_version, status: data.status } : prev));
        setFeedback('');
      } else {
        setError(data.error || 'Could not revise — try again.');
      }
    } catch {
      setError('Connection hiccup — send the change again.');
    } finally {
      setBusy(null);
    }
  };

  const cancelConcept = async () => {
    setBusy('cancel');
    try {
      await fetch(`/api/concept/${conceptId}/cancel`, { method: 'POST' });
      router.push('/dashboard');
    } catch {
      setError('Could not cancel — try again.');
      setBusy(null);
    }
  };

  if (authLoading || state === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
      </div>
    );
  }

  if (state === 'error' || !concept) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Card className="border-white/10 max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Concept not found</h2>
            <p className="text-white/50 mb-6">{error}</p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const card = concept.card;
  const nova = AGENT_INTROS.pm;
  const flagged = concept.status === 'flagged';
  const blocked = concept.status === 'blocked';
  const cancellable = ['presented', 'iterating', 'flagged', 'approved'].includes(concept.status);

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Nova presents — the theater IS the feature */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold text-sm">
            N
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              {nova.name} presents your concept
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 font-medium">
                v{concept.card_version}
              </span>
            </div>
            <div className="text-[11px] text-white/40">{nova.whatTheyDo}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-white/50" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
        </Button>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-8">
        {blocked && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-red-300">This concept can&apos;t be built</div>
              <div className="text-sm text-white/60">It doesn&apos;t meet our content rules. Questions? support@bobbie.digital</div>
            </div>
          </div>
        )}

        {flagged && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-amber-300">One detail is under review</div>
              <div className="text-sm text-white/60">
                Our team is taking a quick look before the build unlocks. You can keep refining the card below —
                your changes are saved.
              </div>
            </div>
          </div>
        )}

        {/* THE CARD — one screen, scannable */}
        <Card className="border-white/10 bg-slate-950/80 shadow-2xl shadow-fuchsia-500/5">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold">{card.name}</h1>
              <Sparkles className="w-5 h-5 text-fuchsia-400 shrink-0 mt-1" />
            </div>
            <p className="text-fuchsia-300 font-medium mb-4">{card.tagline}</p>
            <p className="text-white/80 leading-relaxed mb-6">{card.pitch}</p>

            <div className="space-y-5">
              {/* Screens */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
                  <LayoutGrid className="w-3.5 h-3.5" /> What you&apos;ll see
                </div>
                <ul className="space-y-1.5">
                  {card.screens.map((s, i) => (
                    <li key={i} className="text-sm text-white/75 flex gap-2">
                      <span className="text-fuchsia-400/70 font-mono text-xs mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Must-haves */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
                  <ListChecks className="w-3.5 h-3.5" /> Must-haves
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.mustHaves.map((m, i) => (
                    <span key={i} className="text-sm px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-200">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* NOT building — the trust move */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
                  <Ban className="w-3.5 h-3.5" /> Not in this build
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.notBuilding.map((n, i) => (
                    <span key={i} className="text-sm px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50">
                      {n}
                    </span>
                  ))}
                </div>
              </div>

              {/* Look */}
              <div className="flex items-center gap-2 text-sm text-white/60 pt-4 border-t border-white/10">
                <Palette className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-medium text-white/40">The look:</span> {card.look}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DECIDE — approve or iterate */}
        {!blocked && (
          <div className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={approve}
                disabled={busy !== null || flagged}
                className="flex-1 h-12 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 transition font-semibold"
              >
                {busy === 'approve' ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting your build…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> Approve — build it</>
                )}
              </Button>
              {cancellable && (
                <Button
                  variant="outline"
                  onClick={cancelConcept}
                  disabled={busy !== null}
                  className="h-12 border-white/15 text-white/60 hover:text-white"
                >
                  {busy === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel concept'}
                </Button>
              )}
            </div>

            {flagged && (
              <p className="text-xs text-amber-300/80 text-center">
                The build button unlocks as soon as our review clears — usually fast.
              </p>
            )}

            {/* Iterate: keep what you like, change what you name */}
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                Want changes? Keep what you like — name what&apos;s different.
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={'e.g. "call it TaskHive, drop the calendar screen, add dark mode"'}
                className="w-full min-h-[70px] rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-sm placeholder:text-white/25 focus:outline-none focus:border-fuchsia-500/50"
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={iterate}
                  disabled={busy !== null || feedback.trim().length < 3}
                >
                  {busy === 'iterate' ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Revising…</>
                  ) : (
                    <>Revise the card</>
                  )}
                </Button>
              </div>
              {concept.card_version > 1 && (
                <p className="text-[11px] text-white/40 mt-2">
                  Card v{concept.card_version} — everything you didn&apos;t name carried forward unchanged.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
