/**
 * API Route: POST /api/templates/purchase { projectId }
 * Starts a one-time Stripe checkout for a paid template. On webhook
 * completion, the purchase row flips to 'paid' and fork unlocks.
 * Free templates: fork directly (no checkout needed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { getStripe } from '@/lib/stripe/client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bodigi2.com';
const PLATFORM_FEE_PERCENT = 20; // BoDiGi's cut of template sales

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.checkout);
  if (!rl.success) return NextResponse.json({ error: 'Too many checkout attempts — try again in a minute.' }, { status: 429 });

  const { projectId } = await request.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const admin = createAdminClient();

  // Template must exist, be a template, be complete, and have a price
  const { data: tpl } = await admin
    .from('projects')
    .select('id, name, user_id, is_template, progress, template_price_cents')
    .eq('id', projectId)
    .maybeSingle();

  if (!tpl || !tpl.is_template || (tpl.progress || 0) < 100) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (!tpl.template_price_cents || tpl.template_price_cents < 100) {
    return NextResponse.json({ error: 'This template is free — fork it directly.' }, { status: 400 });
  }

  // Can't buy your own template
  if (tpl.user_id === user.id) {
    return NextResponse.json({ error: 'This is your own template — fork it from your dashboard.' }, { status: 422 });
  }

  // Already purchased? No double-charging
  const { data: existing } = await admin
    .from('template_purchases')
    .select('id, status')
    .eq('template_project_id', projectId)
    .eq('buyer_user_id', user.id)
    .eq('status', 'paid')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'You already own this template — fork it from the gallery.' }, { status: 409 });
  }

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 });

  const boogiCut = Math.round(tpl.template_price_cents * PLATFORM_FEE_PERCENT / 100);
  const sellerEarnings = tpl.template_price_cents - boogiCut;

  // Record the pending purchase
  const { data: purchase, error: purchaseError } = await admin
    .from('template_purchases')
    .insert({
      template_project_id: projectId,
      buyer_user_id: user.id,
      seller_user_id: tpl.user_id,
      price_cents: tpl.template_price_cents,
      boogi_cut_cents: boogiCut,
      seller_earnings_cents: sellerEarnings,
      status: 'pending',
    })
    .select()
    .single();
  if (purchaseError) return NextResponse.json({ error: 'Could not start purchase.' }, { status: 500 });

  // One-time checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Template: ${tpl.name}` },
        unit_amount: tpl.template_price_cents,
      },
      quantity: 1,
    }],
    success_url: `${APP_URL}/templates?purchased=${projectId}`,
    cancel_url: `${APP_URL}/templates?canceled=true`,
    metadata: {
      kind: 'template_purchase',
      purchase_id: String(purchase.id),
      template_project_id: projectId,
      buyer_user_id: user.id,
      seller_user_id: tpl.user_id,
    },
  });

  // Save session id for webhook reconciliation
  await admin.from('template_purchases').update({ stripe_session_id: session.id }).eq('id', purchase.id);

  return NextResponse.json({ success: true, checkoutUrl: session.url });
}
