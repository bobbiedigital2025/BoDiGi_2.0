/**
 * API Route: GET /api/showcase/[slug] — public detail for one showcased
 * app: the investor-facing page data. No auth (public by design).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const rl = rateLimit(getClientId(request), RATE_LIMITS.api);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('projects')
    .select('id, name, idea, showcase_slug, created_at, state, deployment_url:state')
    .eq('showcase_slug', slug)
    .eq('is_public', true)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const specs = data.state?.specs;
  return NextResponse.json({
    name: data.name,
    slug: data.showcase_slug,
    tagline: specs?.summary || data.idea?.slice(0, 200) || '',
    problem: data.state?.realityCheck ? undefined : undefined, // kept minimal — docs stay owner-gated
    features: (specs?.features || []).map((f: any) => ({ name: f.name, description: f.description })),
    audience: specs?.targetAudience || '',
    monetization: specs?.monetization || '',
    marketplace: specs?.marketplace || 'web',
    techStack: specs?.techStack || null,
    userStories: (specs?.userStories || []).slice(0, 6),
    createdAt: data.created_at,
  });
}
