/**
 * API Routes: /api/templates
 *   GET  — public: list template apps (no auth — browsable)
 *   POST — auth: flag/unflag own project as template (owner or admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Automated QA pass for marketplace submissions. A template gets forked
 * into strangers' accounts — so it must be a real, buildable app with no
 * secrets baked in. Mirrors the admin security-audit patterns.
 */
async function runTemplateQa(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string
): Promise<{ pass: boolean; failures: string[] }> {
  const failures: string[] = [];

  const { data: files } = await admin
    .from('project_files')
    .select('path, content')
    .eq('project_id', projectId)
    .limit(500);

  if (!files || files.length < 5) {
    failures.push('Too few files — this does not look like a complete app build.');
    return { pass: false, failures };
  }

  const paths = files.map((f: any) => f.path as string);

  // Structure: a Next.js app must have a package.json and an entry page
  if (!paths.some((p) => p === 'package.json' || p.endsWith('/package.json'))) {
    failures.push('Missing package.json — the app cannot install or build.');
  }
  if (!paths.some((p) => /(^|\/)app\/page\.tsx$/.test(p) || /(^|\/)src\/app\/page\.tsx$/.test(p) || /(^|\/)pages\/index\.(tsx|jsx|js)$/.test(p))) {
    failures.push('Missing entry page (app/page.tsx) — the app has no home route.');
  }

  // Secret scan — same patterns as the admin security audit
  const secretPatterns = [
    { re: /sk_live_[A-Za-z0-9]{10,}/, label: 'Stripe live key' },
    { re: /sk-or-v1-[A-Za-z0-9]{10,}/, label: 'OpenRouter key' },
    { re: /eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_-]{15,}/, label: 'JWT token' },
    { re: /sk-[A-Za-z0-9]{20,}/, label: 'OpenAI-style key' },
  ];
  for (const f of files) {
    const content = (f as any).content || '';
    for (const p of secretPatterns) {
      if (p.re.test(content)) {
        failures.push(`Possible ${p.label} found in ${f.path} — remove it before listing.`);
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('projects')
    .select('id, name, idea, is_template, created_at, specs')
    .eq('is_template', true)
    .eq('progress', 100)
    .order('created_at', { ascending: false })
    .limit(60);

  const templates = (data || []).map((p: any) => {
    const specs = p.specs;
    return {
      id: p.id,
      name: p.name,
      tagline: specs?.summary || p.idea?.slice(0, 140) || '',
      features: (specs?.features || []).slice(0, 4).map((f: any) => f.name),
      audience: specs?.targetAudience || '',
      monetization: specs?.monetization || '',
    };
  });

  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { projectId, isTemplate, priceCents } = await request.json().catch(() => ({}));
  if (!projectId || typeof isTemplate !== 'boolean') {
    return NextResponse.json({ error: 'projectId and isTemplate required' }, { status: 400 });
  }
  if (priceCents !== undefined && (typeof priceCents !== 'number' || priceCents < 0 || priceCents > 500000)) {
    return NextResponse.json({ error: 'Price must be between $0 and $5,000.' }, { status: 400 });
  }

  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id, progress')
    .eq('id', projectId)
    .maybeSingle();

  const adminRead = createAdminClient();
  const { data: profile } = await adminRead.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Only finished builds can be templates — nobody wants to fork a half-built app
  if (isTemplate && owned.progress < 100) {
    return NextResponse.json({ error: 'Only completed builds can become templates — wait for the build to finish.' }, { status: 422 });
  }

  // ─── Marketplace QA gate ───
  // Before anything can be listed, it must pass an automated quality pass:
  // structure check (is this a real, buildable app?) + secret scan (no
  // leaked keys riding into every fork). Keeps the marketplace clean.
  if (isTemplate) {
    const qa = await runTemplateQa(adminRead, projectId);
    if (!qa.pass) {
      return NextResponse.json({
        error: 'Template QA failed — fix these before listing:',
        failures: qa.failures,
      }, { status: 422 });
    }
  }

  const { error } = await adminRead
    .from('projects')
    .update({
      is_template: isTemplate,
      // Setting a price: only when flagging as template. Unflagging clears it.
      ...(isTemplate && priceCents !== undefined
        ? { template_price_cents: priceCents >= 100 ? Math.round(priceCents) : null }
        : {}),
      ...(!isTemplate ? { template_price_cents: null } : {}),
    })
    .eq('id', projectId);

  if (error) return NextResponse.json({ error: 'Could not update template status.' }, { status: 500 });
  return NextResponse.json({ success: true, isTemplate });
}
