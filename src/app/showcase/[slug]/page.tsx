import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';

export const revalidate = 60;

interface ShowcaseDetail {
  name: string;
  tagline: string;
  features: { name: string; description: string }[];
  audience: string;
  monetization: string;
  marketplace: string;
  userStories: { id: string; role: string; goal: string; benefit: string }[];
  createdAt: string;
}

async function loadApp(slug: string): Promise<ShowcaseDetail | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('projects')
      .select('id, name, idea, showcase_slug, created_at, specs')
      .eq('showcase_slug', slug)
      .eq('is_public', true)
      .maybeSingle();

    if (!data) return null;
    const specs = data.specs;
    return {
      name: data.name,
      tagline: specs?.summary || data.idea?.slice(0, 200) || '',
      features: (specs?.features || []).map((f: any) => ({ name: f.name, description: f.description })),
      audience: specs?.targetAudience || '',
      monetization: specs?.monetization || '',
      marketplace: specs?.marketplace || 'web',
      userStories: (specs?.userStories || []).slice(0, 6),
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await loadApp(slug);
  return {
    title: app ? `${app.name} — built with BoDiGi 2.0` : 'Showcase — BoDiGi 2.0',
    description: app?.tagline?.slice(0, 160) || 'An app built with BoDiGi 2.0.',
  };
}

export default async function ShowcaseAppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await loadApp(slug);
  if (!app) notFound();

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/showcase" className="text-xs text-white/40 hover:text-white/70 transition">← All showcased apps</Link>

        {/* Hero */}
        <div className="mt-8">
          <h1 className="text-4xl font-bold">{app.name}</h1>
          <p className="text-lg text-white/60 mt-3">{app.tagline}</p>
          <div className="flex flex-wrap gap-2 mt-5 text-xs">
            {app.audience && <span className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300">For: {app.audience.slice(0, 100)}</span>}
            {app.monetization && <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">{app.monetization.slice(0, 80)}</span>}
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">{app.marketplace}</span>
          </div>
        </div>

        {/* Features */}
        {app.features.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold mb-4">What it does</h2>
            <div className="space-y-3">
              {app.features.map((f, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="font-medium text-fuchsia-300">{f.name}</div>
                  <div className="text-sm text-white/60 mt-1">{f.description}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* User stories — investor-grade specificity */}
        {app.userStories.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Who it serves</h2>
            <div className="space-y-2">
              {app.userStories.map((us, i) => (
                <div key={i} className="text-sm text-white/60 border-l-2 border-fuchsia-500/40 pl-4">
                  As a <span className="text-white/85">{us.role}</span>, I want to <span className="text-white/85">{us.goal}</span>, so that <span className="text-white/85">{us.benefit}</span>.
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer CTA — the viral loop */}
        <div className="mt-16 border-t border-white/10 pt-8 text-center">
          <p className="text-white/40 text-sm">
            This app was built with{' '}
            <Link href="/" className="text-fuchsia-400 hover:underline font-medium">BoDiGi 2.0</Link>{' '}
            — from one sentence to a working product in minutes.
          </p>
          <Link href="/" className="inline-block mt-5 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 font-semibold">
            Build yours — free
          </Link>
        </div>
      </div>
    </main>
  );
}
