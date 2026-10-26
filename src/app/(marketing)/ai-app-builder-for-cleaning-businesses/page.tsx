import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'AI App Builder for Cleaning Businesses',
  description:
    'Describe your cleaning-business app in one sentence — an 11-agent AI team builds the real thing. Proof inside: a complete booking page built in minutes. Free preview.',
  alternates: { canonical: '/ai-app-builder-for-cleaning-businesses' },
};

const CTA_HREF =
  '/?utm_source=organic&utm_medium=seo&utm_campaign=programmatic&utm_content=cleaning-business';

const needs = [
  'A service menu that shows prices up front — Standard, Deep, Move-Out — so customers stop asking "how much?"',
  'A scheduling calendar people can book from — real time slots, no phone tag, no "text me when you\'re free"',
  'A form that takes name, phone, address, and the stuff that matters ("gate code, friendly dog, focus on the kitchen")',
  'A confirmation your customer can screenshot — reference code, summary, your number for changes',
  'An owner view that\'s just yours — PIN-protected, today\'s jobs highlighted, tap-to-call',
  'Controls for real life — block off vacation days, choose which weekdays take bookings',
];

const proofPoints = [
  'Customers pick a clean — Standard $80, Deep $150, Move-Out $220 (prices you set, shown up front)',
  'They book a day and a time slot on a plain calendar',
  'They get an instant confirmation with a reference code and your phone number',
  'You open the owner dashboard with your PIN and see today\'s jobs, the notes, and tap-to-call',
];

const steps = [
  {
    title: 'Type your sentence.',
    body: '"A booking page for my cleaning business in Dallas — deep cleans and move-outs, bookings till 6pm." One sentence is the whole brief.',
  },
  {
    title: 'An 11-agent AI team builds it.',
    body: 'Plans, frontend, backend, tests, docs — each agent does its part.',
  },
  {
    title: 'Watch the free preview.',
    body: 'You see the real build before any money changes hands.',
  },
  {
    title: 'Want the business extras?',
    body: 'Paid tiers add the investor pitch, an honest reality check, and a marketing kit — and deploy to your own Vercel. Your code, your keys, no lock-in.',
  },
];

const faqs = [
  {
    q: 'How much does an app for a cleaning business cost?',
    a: 'Not the $10-25k an agency will quote you. The build preview is free — you pay only if you want the business extras and deployment, at prices listed on the main page.',
  },
  {
    q: 'How long does it take to build a cleaning business app?',
    a: 'The proof build above took 6.7 minutes. Your build\'s size depends on your sentence — but we\'re talking minutes to hours, not months.',
  },
  {
    q: 'I\'m not technical. Can I still do this?',
    a: 'This is built for you. The proof build was designed for a non-technical owner: big buttons, plain language, works on a phone. You never touch code — but you own the code.',
  },
  {
    q: 'I run my business on paper and texts. Will this fit?',
    a: 'That\'s exactly who the proof build was made for. Customers book themselves; you check a dashboard instead of a stack of sticky notes. Start with one page, like Sparkle Clean did.',
  },
  {
    q: 'Does it take payments?',
    a: 'The proof build doesn\'t — its brief was booking without payments, and it says so on the page. Your one sentence sets your scope; describe what you need and the team builds to it.',
  },
  {
    q: 'Who owns the app?',
    a: 'You do. Your code, your keys — it can deploy to your own Vercel account. No lock-in, no hostage situation.',
  },
  {
    q: 'What if my idea is bad?',
    a: 'The team will tell you. Every build ships with an honest reality check — pros, cons, and whether the idea holds up. Nobody else does that.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'BoDiGi 2.0',
      url: 'https://bodigi2.com',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      description:
        'AI app builder for cleaning businesses — describe your app in one sentence and an 11-agent AI build team builds the real thing. Free preview.',
      offers: [
        { '@type': 'Offer', name: 'Free Preview', price: '0', priceCurrency: 'USD' },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

function Screenshot({
  src,
  alt,
  wide,
}: {
  src: string;
  alt: string;
  wide?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1280}
      height={800}
      className={`rounded-lg border border-white/10 w-full h-auto ${wide ? '' : 'object-cover'}`}
    />
  );
}

export default function CleaningBusinessPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-white/50 text-sm hover:text-white/80 transition">
          ← BoDiGi 2.0
        </Link>

        {/* Hero */}
        <h1 className="text-4xl font-bold mt-6 mb-4 leading-tight">
          Build an app for your cleaning business — no code, no $20k quote
        </h1>
        <p className="text-white/60 leading-relaxed mb-8">
          Describe it in one sentence. An 11-agent AI build team builds the real
          thing — booking page, owner dashboard, the works. The free preview
          shows it to you before any money changes hands.
        </p>
        <div className="text-center">
          <Link
            href={CTA_HREF}
            className="inline-block px-8 py-3 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 font-medium hover:opacity-90 transition"
          >
            Build mine free
          </Link>
        </div>
        <p className="text-center text-sm text-amber-200/80 mt-6">
          We built one to prove it. Sparkle Clean Co — a complete booking page
          for a local cleaning business, from ONE sentence, in under 7 minutes.
          Keep reading ↓
        </p>

        {/* What it needs */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold mb-2">
            What a cleaning-business app actually needs
          </h2>
          <p className="text-white/50 mb-8">
            Written for the owner doing this on a phone between jobs — not for
            developers.
          </p>
          <ul className="space-y-4 mb-8">
            {needs.map((n) => (
              <li key={n} className="flex gap-3 text-white/70 leading-relaxed">
                <span className="text-amber-300 shrink-0">✦</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
          <div className="grid sm:grid-cols-2 gap-4">
            <Screenshot
              src="/images/seo/sparkle-1.png"
              alt="Sparkle Clean Co service menu — three cleaning services with prices shown up front"
            />
            <Screenshot
              src="/images/seo/sparkle-2.png"
              alt="Booking calendar with real time slots customers can pick"
            />
          </div>
        </section>

        {/* The proof */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold mb-2">The proof — Sparkle Clean Co</h2>
          <p className="text-white/60 leading-relaxed mb-6">
            We asked for exactly one thing: "a booking page for a local cleaning
            business called Sparkle Clean Co." The build team delivered the whole
            page — 38 files of real code — in 6.7 minutes. No templates, no
            filler. It&apos;s the living proof that "one sentence in, a real app
            out" is literal.
          </p>
          <ul className="space-y-3 mb-8">
            {proofPoints.map((p) => (
              <li key={p} className="flex gap-3 text-white/70 leading-relaxed">
                <span className="text-emerald-400 shrink-0">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-4 mb-8">
            <div className="grid sm:grid-cols-2 gap-4">
              <Screenshot
                src="/images/seo/sparkle-3.png"
                alt="Simple booking form — name, phone, address, and notes"
              />
              <Screenshot
                src="/images/seo/sparkle-4.png"
                alt="Instant booking confirmation with a reference code and the business phone number"
              />
            </div>
            <Screenshot
              src="/images/seo/sparkle-5.png"
              alt="PIN-protected owner dashboard showing today's cleaning jobs with tap-to-call"
            />
          </div>
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-5">
            <h3 className="text-amber-200 font-semibold mb-2">Honest scope</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              This build doesn&apos;t take payments — its brief was booking
              without them, and it says so plainly on the page ("No payment now
              — we settle up after your home sparkles."). Your one sentence
              sets your scope.
            </p>
          </div>
        </section>

        {/* How to */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold mb-8">
            How to build an app for a cleaning business (the one-sentence way)
          </h2>
          <ol className="space-y-6">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-semibold text-sm">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-white/60 leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Honest pricing */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold mb-6">Honest pricing</h2>
          <ul className="space-y-4 mb-8">
            <li className="flex gap-3 text-white/70 leading-relaxed">
              <span className="text-emerald-400 shrink-0">✓</span>
              <span>
                The preview is free — the team builds your app and you look at
                it. No card, no commitment.
              </span>
            </li>
            <li className="flex gap-3 text-white/70 leading-relaxed">
              <span className="text-emerald-400 shrink-0">✓</span>
              <span>
                Paid tiers add the business extras and deployment. Full pricing
                lives on the{' '}
                <Link href="/pricing" className="underline hover:text-white">
                  main pricing page
                </Link>{' '}
                — no surprises buried on a landing page, that&apos;s not how we
                do it.
              </span>
            </li>
          </ul>
          <div className="text-center">
            <Link
              href={CTA_HREF}
              className="inline-block px-8 py-3 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 font-medium hover:opacity-90 transition"
            >
              Type your sentence
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold mb-8">
            Questions cleaning-business owners ask
          </h2>
          <div className="space-y-8">
            {faqs.map((f) => (
              <div key={f.q} className="border-b border-white/10 pb-8">
                <h3 className="text-lg font-semibold mb-3">{f.q}</h3>
                <p className="text-white/60 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 text-center">
          <Link
            href={CTA_HREF}
            className="inline-block px-8 py-3 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 font-medium hover:opacity-90 transition"
          >
            Build mine free
          </Link>
        </div>
      </div>
    </div>
  );
}
