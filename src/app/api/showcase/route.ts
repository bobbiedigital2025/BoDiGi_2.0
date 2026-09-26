/**
 * API Routes: /api/showcase
 *   GET  — public: list showcased apps (no auth — the viral loop)
 *   POST — auth: toggle a project's public status (owner or admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('projects')
    .select('id, name, idea, showcase_slug, created_at, specs')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(60);

  // Shape for the gallery: name, one-liner, top features, slug
  const apps = (data || []).map((p: any) => {
    const specs = p.specs;
    return {
      id: p.id,
      slug: p.showcase_slug,
      name: p.name,
      tagline: specs?.summary || p.idea?.slice(0, 140) || '',
      features: (specs?.features || []).slice(0, 4).map((f: any) => f.name),
      audience: specs?.targetAudience || '',
      monetization: specs?.monetization || '',
      createdAt: p.created_at,
    };
  }).filter((a: any) => a.slug);

  return NextResponse.json({ apps });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 });
  }

  const { projectId, isPublic } = await request.json().catch(() => ({}));
  if (!projectId || typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'projectId and isPublic required' }, { status: 400 });
  }

  // Ownership
  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id, name')
    .eq('id', projectId)
    .maybeSingle();

  const adminRead = createAdminClient();
  const { data: profile } = await adminRead.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Generate a slug on first publish (unique: name + short random suffix)
  let slug: string | null = null;
  if (isPublic) {
    const base = (owned.name || 'app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'app';
    slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

    // Retry on the (astronomically unlikely) slug collision
    const { data: clash } = await adminRead.from('projects').select('id').eq('showcase_slug', slug).maybeSingle();
    if (clash) slug = `${base}-${Date.now().toString(36)}`;
  }

  const { error } = await adminRead
    .from('projects')
    .update({ is_public: isPublic, ...(isPublic ? { showcase_slug: slug } : { showcase_slug: null }) })
    .eq('id', projectId);

  if (error) {
    return NextResponse.json({ error: 'Could not update showcase status.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    isPublic,
    url: isPublic ? `/showcase/${slug}` : null,
  });
}
