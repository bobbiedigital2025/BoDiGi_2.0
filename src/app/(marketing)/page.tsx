'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, Zap, Shield, Code2, Rocket, Brain, CheckCircle2, LogOut, FileText, SearchCheck, MonitorSmartphone, Wallet, Clock, Users } from 'lucide-react';
import { useAuth } from '@/lib/supabase/auth-context';
import { TermsGate } from '@/components/terms-gate';

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
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Check if user has already accepted terms (stored in localStorage for UX)
  useEffect(() => {
    if (user) {
      const accepted = localStorage.getItem(`terms_accepted_${user.id}`);
      if (accepted) setTermsAccepted(true);
    }
  }, [user]);

  const doSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      if (res.status === 401) {
        router.push('/login?redirect=/');
        return;
      }
      const data = await res.json();
      if (data.projectId) {
        router.push(`/dashboard/${data.projectId}`);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!idea.trim()) return;

    // Redirect to login if not authenticated
    if (!user) {
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

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg">BoDiGi 2.0</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/60">
            <a href="#what-you-get" className="hover:text-white transition-colors hidden sm:inline">What you get</a>
            <a href="#how" className="hover:text-white transition-colors hidden sm:inline">How it works</a>
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
            not months. No code required.
          </p>

          {/* Idea Input */}
          <Card className="max-w-2xl mx-auto border-white/10">
            <CardContent className="p-6">
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
              { icon: Users, title: '2. The AI team builds', desc: 'Nine specialized agents handle product, architecture, code, tests, and compliance — in parallel.' },
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
                  <li>Free to start — $19/mo when you&apos;re serious</li>
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
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-white/70">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>
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
            <p>BoDiGi 2.0 — made by Bobbie Digital. Built with Letta.</p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <a href="/setup" className="hover:text-white/60 transition">Setup Guide</a>
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
            // Auto-submit after accepting
            handleSubmit();
          }}
        />
      )}
    </div>
  );
}
