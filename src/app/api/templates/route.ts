/**
 * API Routes: /api/templates
 *   GET  — public: list template apps (no auth — browsable)
 *   POST — auth: flag/unflag own project as template (owner or admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('projects')
    .select('id, name, idea, is_template, created_at, state')
    .eq('is_template', true)
    .eq('progress', 100)
    .order('created_at', { ascending: false })
    .limit(60);

  const templates = (data || []).map((p: any) => {
    const specs = p.state?.specs;
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
