/**
 * API Route: POST /api/generate/[projectId]/ad/render/checkout
 *
 * Creates a Stripe Checkout Session for a single pay-per-video purchase.
 * The render does NOT start until the webhook confirms payment
 * (metadata.kind === 'ad_render_purchase' → video_render_purchases → paid).
 *
 * Body: { tier: 'short' | 'long', avatarId, voiceId, dimension, supportedEngines? }
 *   short → 30s ad,  $4.99
 *   long  → 1–2 min, $12.99
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/client';
import { hasHeygenKey } from '@/lib/agents/heygen-client';

export const maxDuration = 60;

const TIERS = {
  short: { label: '30-second ad', cents: 499 },
  long: { label: '1–2 minute ad', cents: 1299 },
} as const;

async function authorize(projectId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };

  const { data: profile } = await supabase.from('profiles').select('role, stripe_customer_id').eq('id', user.id).single();
  const { data: project } = await supabase.from('projects').select('id, user_id, name, specs').eq('id', projectId).single();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const isAdmin = profile?.role === 'admin';
  if (project.user_id !== user.id && !isAdmin) {
    return { error: NextResponse.json({ error: 'Not your project' }, { status: 403 }) };
  }
  return { user, project, profile };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;

  if (!hasHeygenKey()) {
    return NextResponse.json({ error: 'Video rendering is not available yet.' }, { status: 503 });
  }

  const specs = (auth.project!.specs || {}) as Record<string, unknown>;
  const ad = specs.ad as { script?: string } | undefined;
  if (!ad?.script) {
    return NextResponse.json({ error: 'Generate an ad kit first — the render needs a script.' }, { status: 400 });
  }

  let body: { tier?: string; avatarId?: string; voiceId?: string; dimension?: string; supportedEngines?: string[] } = {};
  try { body = await request.json(); } catch { /* validated below */ }

  const tier = body.tier === 'long' ? 'long' : 'short';
  if (!body.avatarId || !body.voiceId) {
    return NextResponse.json({ error: 'avatarId and voiceId are required' }, { status: 400 });
  }
  const dimension = body.dimension === '9:16' ? '9:16' : '16:9';

  const supabase = createAdminClient();

  const { data: purchase, error: insertErr } = await supabase
    .from('video_render_purchases')
    .insert({
      project_id: projectId,
      user_id: auth.user!.id,
      tier,
      amount_cents: TIERS[tier].cents,
      status: 'pending',
      render_params: {
        avatarId: body.avatarId,
        voiceId: body.voiceId,
        dimension,
        supportedEngines: body.supportedEngines || [],
      },
    })
    .select('id')
    .single();
  if (insertErr || !purchase) {
    return NextResponse.json({ error: `Could not create purchase: ${insertErr?.message}` }, { status: 500 });
  }

  const stripe = getStripe();
  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://bodigi2.com';

  const envPrice = tier === 'short' ? process.env.STRIPE_PRICE_AD_SHORT : process.env.STRIPE_PRICE_AD_LONG;
  const lineItem = envPrice
    ? { price: envPrice, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: TIERS[tier].cents,
          product_data: {
            name: `AI Avatar Ad — ${TIERS[tier].label}`,
            description: `Talking-avatar video ad for "${auth.project!.name}", rendered on BoDiGi Ad Studio.`,
          },
        },
      };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: auth.profile?.stripe_customer_id || undefined,
      line_items: [lineItem],
      metadata: {
        kind: 'ad_render_purchase',
        purchase_id: String(purchase.id),
        project_id: projectId,
        supabase_user_id: auth.user!.id,
        tier,
      },
      success_url: `${origin}/dashboard/${projectId}?ad_paid=1`,
      cancel_url: `${origin}/dashboard/${projectId}?ad_canceled=1`,
    });

    await supabase
      .from('video_render_purchases')
      .update({ stripe_session_id: session.id })
      .eq('id', purchase.id);

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (e) {
    await supabase.from('video_render_purchases').delete().eq('id', purchase.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Stripe checkout failed' },
      { status: 502 },
    );
  }
}
