'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, Zap, Shield, Code2, Rocket, Brain, CheckCircle2, LogOut, FileText, SearchCheck, MonitorSmartphone, Wallet, Clock, Users, MessageSquareText, Megaphone, Globe } from 'lucide-react';
import { useAuth } from '@/lib/supabase/auth-context';
import StardustBackground from '@/components/stardust';
import { TermsGate } from '@/components/terms-gate';
import { PlanInterview } from '@/components/plan-interview';

const EXAMPLE_IDEAS = [
  'A booking platform for mobile pet groomers with online payments and appointment reminders',
  'A marketplace for local chefs to sell meal prep subscriptions with delivery scheduling',
  'A fitness coaching platform with video workouts, progress tracking, and member payments',
  'A subscription box service for plant lovers with member perks and a referral program',
];

export default function LandingPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const pendingBrief = useRef<string | null>(null);

  // Restore an idea the visitor typed before being sent to log in — a
  // customer should never lose their pitch to a sign-in redirect.
  useEffect(() => {
    // Deferred a tick: restoring sets state, and synchronous setState inside
    // an effect triggers cascading renders (react-hooks error).
    const t = setTimeout(() => {
      const pending = sessionStorage.getItem('bodigi_pending_idea');
      if (pending) {
        setIdea(pending);
        sessionStorage.removeItem('bodigi_pending_idea');
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Check if user has already accepted terms (stored in localStorage for UX).
  // Client-only storage read on user change — idiomatic mount effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (user) {
      const accepted = localStorage.getItem(`terms_accepted_${user.id}`);
      if (accepted) setTermsAccepted(true);
    }
  }, [user]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const doSubmit = async () => {
    const finalIdea = pendingBrief.current ?? idea;
    if (!finalIdea.trim()) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: finalIdea }),
      });
      if (res.status === 401) {
        router.push('/login?redirect=/');
        return;
      }
      const data = await res.json();
      if (data.projectId) {
        router.push(`/dashboard/${data.projectId}`);
      } else {
        setError(data.error || 'The build team could not start right now. Please try again in a moment.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong reaching the build team. Check your connection and try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!idea.trim() && !pendingBrief.current) return;

    // Redirect to login if not authenticated
    if (!user) {
      // Keep the pitch safe through the sign-in detour
      if (idea.trim()) sessionStorage.setItem('bodigi_pending_idea', idea);
      router.push('/login?redirect=/');
      return;
    }

    // Show terms gate on first project creation
    if (!termsAccepted) {
      setShowTerms(true);
      return;
    }

    await doSubmit();
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-black to-black" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-fuchsia-600/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px]" />
      <StardustBackground />

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-sm.png" alt="BoDiGi 2.0" className="w-8 h-8" />
            <span className="font-bold text-lg">BoDiGi 2.0</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/60">
            <a href="#what-you-get" className="hover:text-white transition-colors hidden sm:inline">What you get</a>
            <a href="#how" className="hover:text-white transition-colors hidden sm:inline">How it works</a>
            <Link href="/showcase" className="hover:text-white transition-colors hidden sm:inline">Showcase</Link>
            <a href="/pricing" className="hover:text-white transition-colors hidden sm:inline">Pricing</a>
            {user ? (
              <>
                <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                  Dashboard
                </Button>
                <Button variant="ghost" size="sm" onClick={async () => { await signOut(); router.push('/'); }}>
                  <LogOut className="w-3 h-3" /> Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
                  Sign in
                </Button>
                <Button variant="gradient" size="sm" onClick={() => router.push('/signup')}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </nav>

        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
          <Badge variant="info" className="mb-6">
            <Zap className="w-3 h-3 mr-1" /> Built for founders, not developers
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            You bring the idea.
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              We build the business.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto">
            Describe your idea in one sentence. A team of AI agents builds your working app,
            writes your investor one-pager, and gives you an honest reality check — in minutes,
            not months. Your code, your hosting, your keys:{' '}
            <span className="text-white/90 font-medium">cancel anytime and keep everything.</span>
          </p>

          {/* Idea Input */}
          <Card className="max-w-2xl mx-auto border-white/10">
            <CardContent className="p-6">
              {planMode ? (
                <PlanInterview
                  onClose={() => setPlanMode(false)}
                  onBuild={(brief) => {
                    pendingBrief.current = brief;
                    setIdea(brief);
                    setPlanMode(false);
                    handleSubmit();
                  }}
                />
              ) : (
                <>
              <Textarea
                placeholder="Describe your business idea... Be as detailed or as simple as you like. The AI team handles the rest."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="min-h-[140px] text-base"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-white/40">
                  {idea.length} chars · Press ⌘+Enter to submit
                </span>
                <Button
                  variant="gradient"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!idea.trim() || loading}
                >
                  {loading ? (
                    <>
                      <span className="animate-spin">⚡</span> Building...
                    </>
                  ) : (
                    <>
                      Build My Business <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
              {error && (
                <p className="mt-3 text-sm text-red-400 text-left" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-3 text-center">
                <button
                  onClick={() => setPlanMode(true)}
                  className="text-xs text-fuchsia-400/80 hover:text-fuchsia-300 transition"
                >
                  Not sure how to describe it? <span className="underline">Plan it with an agent first</span> — it interviews you, then builds the right thing
                </button>
              </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Example ideas */}
          <div className="mt-8">
            <p className="text-sm text-white/40 mb-3">Or try one of these:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLE_IDEAS.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setIdea(ex)}
                  className="text-xs text-white/50 px-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 hover:text-white/80 transition-all"
                >
                  {ex.slice(0, 60)}...
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-white/40 mt-8">
            Your first build is free — live 7-day preview, no card required.
          </p>
        </section>

        {/* What you walk away with */}
        <section id="what-you-get" className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-3">Not just an app. A business.</h2>
          <p className="text-center text-white/50 mb-12 max-w-2xl mx-auto">
            Every build comes with the three things an entrepreneur actually needs —
            plus the code when you&apos;re ready to own it.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: MonitorSmartphone,
                title: 'A working app',
                desc: 'A real, running application you can click through in your browser — frontend, backend, database, and payments. Show it to customers the same day.',
              },
              {
                icon: FileText,
                title: 'An investor one-pager',
                desc: 'A polished pitch document with your problem, solution, market, and the ROI math — ready to send to investors, partners, or your first customers.',
              },
              {
                icon: SearchCheck,
                title: 'An honest reality check',
                desc: 'No hype. A straight assessment of your biggest risks, what to validate first, and the difficulty rating — so you build the version that can actually win.',
              },
              {
                icon: Rocket,
                title: 'A step-by-step launch guide',
                desc: 'A plain-English go-live manual written for non-technical founders: which accounts to create, which keys to copy, how to deploy, and how to connect your own domain.',
              },
              {
                icon: Code2,
                title: 'The full source code',
                desc: 'When you upgrade, everything is yours: download the ZIP or push to GitHub. No lock-in, no ransom — it deploys anywhere.',
              },
              {
                icon: MessageSquareText,
                title: 'Change anything by asking',
                desc: 'Modify Pass lets you edit your app in plain English — "make the header dark blue," "add a settings page." Every edit is snapshotted first, and the platform learns from it.',
              },
              {
                icon: Globe,
                title: 'Live on your own hosting',
                desc: 'One click deploys to your own Vercel account — your domain, your control. Revoke access anytime; the app keeps running without us.',
              },
              {
                icon: Megaphone,
                title: 'Marketing kit & AI-made ads',
                desc: 'Pro builds ship with a 30-day marketing plan, launch posts, and email sequences. Ad Studio turns your app into a video ad with an AI presenter — ready for TikTok and Reels.',
              },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-fuchsia-400" />
                  </div>
                  <h3 className="font-semibold mb-2 text-lg">{item.title}</h3>
                  <p className="text-sm text-white/50">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { icon: Brain, title: '1. You describe it', desc: 'One prompt. Plain English. No specs, no wireframes, no technical knowledge needed.' },
              { icon: Users, title: '2. The AI team builds', desc: 'Eleven specialized agents handle product, architecture, code, tests, and compliance — and the platform learns from every build, so each app starts smarter than the last.' },
              { icon: Rocket, title: '3. You preview it live', desc: 'Click through your working app the same day. Read your pitch doc and reality check.' },
              { icon: Wallet, title: '4. You own it', desc: 'Upgrade to download the code, keep your app live, and launch for real. It\'s yours forever.' },
            ].map((step, i) => (
              <Card key={i} className="text-center">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mx-auto mb-4">
                    <step.icon className="w-6 h-6 text-fuchsia-400" />
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-white/50">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* The old way vs the BoDiGi way */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-12">The math every founder should do</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-white/10">
              <CardContent className="p-8">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-white/40" />
                  <h3 className="font-semibold text-white/60">The old way</h3>
                </div>
                <ul className="space-y-3 text-sm text-white/50">
                  <li>$10,000–$25,000 to an agency</li>
                  <li>6–12 weeks of meetings and revisions</li>
                  <li>Pay more for every change</li>
                  <li>Hope the idea works before you can test it</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-fuchsia-500/30 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10" />
              <CardContent className="p-8 relative">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-fuchsia-400" />
                  <h3 className="font-semibold">The BoDiGi way</h3>
                </div>
                <ul className="space-y-3 text-sm text-white/80">
                  <li>Free to start — $19.99/mo when you&apos;re serious</li>
                  <li>Working app the same day</li>
                  <li>Rebuild and iterate whenever you want</li>
                  <li>Test the idea with real users before you spend real money</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Under the hood — credibility strip */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-3">Serious engineering under the hood</h2>
          <p className="text-center text-white/50 mb-12 max-w-2xl mx-auto">
            You never have to think about any of this. But it&apos;s all in there.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              'User accounts and secure login, built in',
              'Database designed for your data model',
              'Stripe payments, wired and tested',
              'Admin dashboard with user management',
              'Responsive design — phone, tablet, desktop',
              'Automated tests on every build',
              'Security and privacy compliance checks',
              'Deploy-ready code — connect your own domain',
              'Self-healing pipeline detects and fixes failures',
              'Complete documentation for future developers',
              'Your app runs on your own API keys — you control costs',
              'No lock-in: your code deploys anywhere',
              'Build Memory — learns from every build and edit, so the next app starts smarter',
              'Modify Pass with snapshot-and-rollback safety on every edit',
              'Ad Studio — AI avatar video ads for your app, rendered in minutes',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </section>

        {/* Straight talk — the honest promise */}
        <section className="max-w-3xl mx-auto px-6 py-16">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-bold mb-3 text-amber-200">One honest promise.</h2>
              <p className="text-white/60 text-sm leading-relaxed max-w-xl mx-auto">
                BoDiGi gives you a head start — not a guaranteed business. We build the app, the documents,
                and the launch tools. The marketing, the customers, and the daily work are yours, and real
                businesses take real effort. Most ideas die because they never get started.
                You get to start today — with everything you need already built.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Final CTA */}
        <section className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your idea deserves a real shot.
          </h2>
          <p className="text-white/50 mb-8">
            The first build is free. The preview lasts 7 days. If it&apos;s the one,
            keep it forever for less than the cost of lunch.
          </p>
          <Button variant="gradient" size="lg" onClick={() => {
            document.querySelector('textarea')?.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}>
            Start Building — It&apos;s Free <ArrowRight className="w-4 h-4" />
          </Button>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-8 text-center text-sm text-white/40">
            {/* Product Hunt launch badge — live upvote count */}
            <div className="flex justify-center mb-6">
              <a
                href="https://www.producthunt.com/products/bodigi-2-0?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-bodigi-2-0"
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="BoDiGi 2.0 - You bring the idea and AI builds a business that you own | Product Hunt"
                  width="250"
                  height="54"
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1268254&theme=dark"
                />
              </a>
            </div>
            <p>BoDiGi 2.0 — made by Bobbie Digital. Built with Letta.</p>
            <p className="mt-2 text-xs text-white/30">BoDiGi 2.0 provides tools and a head start. Using the Service does not guarantee business success or revenue — see our <a href="/terms" className="underline hover:text-white/50">Terms</a>.</p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <a href="/setup" className="hover:text-white/60 transition">Setup Guide</a>
              <Link href="/showcase" className="hover:text-white/60 transition">Showcase</Link>
              <a href="/pricing" className="hover:text-white/60 transition">Pricing</a>
              <a href="/terms" className="hover:text-white/60 transition">Terms of Service</a>
              <a href="/privacy" className="hover:text-white/60 transition">Privacy Policy</a>
            </div>
          </div>
        </footer>
      </div>

      {/* Terms Gate — shows before first project creation */}
      {showTerms && (
        <TermsGate
          onAccept={() => {
            setTermsAccepted(true);
            setShowTerms(false);
            if (user) localStorage.setItem(`terms_accepted_${user.id}`, 'true');
            // Auto-submit after accepting. Must call doSubmit directly:
            // handleSubmit() would re-read the stale termsAccepted=false
            // from this render's closure and reopen the gate, forcing
            // first-time users to click "Let's Build" twice.
            void doSubmit();
          }}
        />
      )}
    </div>
  );
}
