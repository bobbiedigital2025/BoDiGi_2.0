import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Showcase — apps built with BoDiGi 2.0',
  description: 'Real apps built by real founders in minutes with BoDiGi 2.0. Browse the showcase, meet the founders, and see what an idea becomes.',
};

export const revalidate = 60; // ISR — public page, cheap to serve

interface ShowcaseApp {
  id: string;
  slug: string | null;
  name: string;
  tagline: string;
  features: string[];
  audience?: string;
}

async function loadApps(): Promise<ShowcaseApp[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('projects')
      .select('id, name, idea, showcase_slug, state')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(60);

    return (data || [])
      .map((p: any) => {
        const specs = p.state?.specs;
        return {
          id: p.id,
          slug: p.showcase_slug,
          name: p.name,
          tagline: specs?.summary || p.idea?.slice(0, 140) || '',
          features: (specs?.features || []).slice(0, 4).map((f: any) => f.name),
          audience: specs?.targetAudience || '',
        };
      })
      .filter((a: any) => a.slug);
  } catch {
    return [];
  }
}

export default async function ShowcasePage() {
  const apps = await loadApps();

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-14">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70 transition">← BoDiGi 2.0</Link>
          <h1 className="text-4xl md:text-5xl font-bold mt-4 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            The Showcase
          </h1>
          <p className="text-white/50 mt-4 max-w-2xl mx-auto">
            Real apps, built by real founders — in minutes, not months. Every one of these
            started as a single sentence. Investors welcome.
          </p>
        </div>

        {/* Gallery */}
        {apps.length === 0 ? (
          <div className="text-center py-20 border border-white/10 rounded-2xl">
            <p className="text-white/50">Nothing published yet — be the first.</p>
            <p className="text-white/30 text-sm mt-2">Build an app, then hit "Publish to Showcase" on its page.</p>
            <Link href="/" className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-semibold">
              Build your app →
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/showcase/${app.slug}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-fuchsia-500/40 hover:bg-white/[0.05] transition"
              >
                <h2 className="text-lg font-semibold group-hover:text-fuchsia-300 transition">{app.name}</h2>
                <p className="text-sm text-white/50 mt-2 line-clamp-3">{app.tagline}</p>
                {app.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {app.features.map((f, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {app.audience && (
                  <p className="text-[11px] text-white/30 mt-3">For: {app.audience.slice(0, 80)}</p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* CTA loop */}
        <div className="mt-16 text-center border-t border-white/10 pt-10">
          <p className="text-white/60">Have an idea? Your app could be on this wall.</p>
          <Link href="/" className="inline-block mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 font-semibold">
            Build it in minutes — free
          </Link>
        </div>
      </div>
    </main>
  );
}
