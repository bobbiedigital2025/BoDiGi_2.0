import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import ForkButton from '@/components/fork-button';

export const metadata = {
  title: 'Templates — start from a working app',
  description: 'Fork a finished app into your account in one click. Fully editable, deployable, yours.',
};

export const revalidate = 60; // ISR — public page

interface TemplateApp {
  id: string;
  name: string;
  tagline: string;
  features: string[];
  audience?: string;
  priceCents?: number | null;
}

async function loadTemplates(): Promise<TemplateApp[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('projects')
      .select('id, name, idea, specs, template_price_cents')
      .eq('is_template', true)
      .eq('progress', 100)
      .order('created_at', { ascending: false })
      .limit(60);

    return (data || []).map((p: any) => {
      const specs = p.specs;
      return {
        id: p.id,
        name: p.name,
        tagline: specs?.summary || p.idea?.slice(0, 140) || '',
        features: (specs?.features || []).slice(0, 4).map((f: any) => f.name),
        audience: specs?.targetAudience || '',
        priceCents: p.template_price_cents,
      };
    });
  } catch {
    return [];
  }
}

export default async function TemplatesPage() {
  const templates = await loadTemplates();

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <Link href="/" className="text-xs text-white/40 hover:text-white/70 transition">← BoDiGi 2.0</Link>
          <h1 className="text-4xl md:text-5xl font-bold mt-4 bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
            Templates
          </h1>
          <p className="text-white/50 mt-4 max-w-2xl mx-auto">
            Working apps, ready to fork. One click copies the entire app into your account —
            fully editable, deployable, yours. Rename it, restyle it, make it your business.
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-20 border border-white/10 rounded-2xl">
            <p className="text-white/50">No templates yet.</p>
            <p className="text-white/30 text-sm mt-2">Build an app, then hit &quot;Make a template&quot; on its page to share it here.</p>
            <Link href="/" className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-sm font-semibold">
              Build the first one →
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {templates.map((t) => (
              <div key={t.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col">
                <h2 className="text-lg font-semibold">{t.name}</h2>
                {t.priceCents && t.priceCents >= 100 ? (
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                    ${(t.priceCents / 100).toFixed(2)}
                  </span>
                ) : (
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">Free</span>
                )}
                <p className="text-sm text-white/50 mt-2 line-clamp-3 flex-1">{t.tagline}</p>
                {t.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {t.features.map((f, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                <ForkButton projectId={t.id} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-16 text-center border-t border-white/10 pt-10">
          <p className="text-white/60">Every template started as someone&apos;s one-sentence idea.</p>
          <Link href="/" className="inline-block mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 font-semibold">
            Or build yours from scratch — free
          </Link>
        </div>
      </div>
    </main>
  );
}
