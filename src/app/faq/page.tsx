import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'What is BoDiGi 2.0, how it differs from Lovable and Base44, who owns the code, and what it costs — straight answers for founders.',
  alternates: { canonical: '/faq' },
};

const faqs = [
  {
    q: 'What is BoDiGi 2.0?',
    a: 'BoDiGi 2.0 is an AI app factory: describe your idea in one sentence and nine specialized AI agents build a complete, working application — frontend, backend, database, tests, compliance checks, and documentation — plus an investor one-pager, an honest reality-check report, and a 30-day marketing kit.',
  },
  {
    q: 'How is BoDiGi different from Lovable, Bolt, or Base44?',
    a: 'Ownership. BoDiGi deploys your app to your own Vercel account, exports your full source code, and runs on your own API keys. Cancel anytime and keep everything — your app keeps running. Every build also includes an honest reality-check document that names your idea\'s weaknesses, with one-click AI fixes.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'No. BoDiGi is built for founders, not developers. One plain-English prompt produces a working app you can preview the same day, with a step-by-step launch guide written for non-technical users.',
  },
  {
    q: 'What does BoDiGi cost?',
    a: 'Free tier: build a real app with a 7-day live preview, no card required. Starter ($19/mo): export your code and keep previews 30 days. Pro ($49/mo): unlimited apps, one-click deploy to your own Vercel, AI chat-to-edit, and the full marketing kit. Enterprise ($199/mo): everything unlimited plus phone support.',
  },
  {
    q: 'Who owns the app BoDiGi builds?',
    a: 'You do — completely. Download the ZIP, push to your own GitHub, deploy to your own Vercel account. Your code, your hosting, your keys. There is no lock-in and no ransom: cancel your subscription and everything you built keeps working.',
  },
  {
    q: 'What kinds of apps can it build?',
    a: 'BoDiGi is strongest on standard SaaS shapes — dashboards, marketplaces, booking platforms, subscription services, and tools with auth and data. It is weakest on heavy real-time products like multiplayer games or live video. The reality-check report will tell you honestly if your idea is in the weak zone before you spend a dollar.',
  },
];

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-white/50 text-sm hover:text-white/80 transition">
          ← BoDiGi 2.0
        </Link>
        <h1 className="text-4xl font-bold mt-6 mb-2">Frequently asked questions</h1>
        <p className="text-white/50 mb-12">
          Straight answers. The same honesty we put in every reality check.
        </p>

        <div className="space-y-8">
          {faqs.map((f) => (
            <div key={f.q} className="border-b border-white/10 pb-8">
              <h2 className="text-lg font-semibold mb-3">{f.q}</h2>
              <p className="text-white/60 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/signup"
            className="inline-block px-8 py-3 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 font-medium hover:opacity-90 transition"
          >
            Build your first app free
          </Link>
        </div>
      </div>
    </div>
  );
}
