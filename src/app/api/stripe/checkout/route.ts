/**
 * API Route: POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for a subscription upgrade.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { getStripe, getStripePriceId } from '@/lib/stripe/client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Rate limit checkout attempts
  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.checkout);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many checkout attempts. Please try again later.' },
      { status: 429 }
    );
  }

  const { tier, promoCode } = await request.json();

  if (!tier || !['starter', 'pro', 'enterprise'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier. Must be starter, pro, or enterprise.' }, { status: 400 });
  }

  const priceId = getStripePriceId(tier);
  if (!priceId) {
    return NextResponse.json({ error: `Stripe price not configured for tier: ${tier}. Set STRIPE_PRICE_${tier.toUpperCase()} in environment.` }, { status: 500 });
  }

  const stripe = getStripe();

  // Promo code support — one code per checkout (flash deal OR quiz reward, never both)
  let promotionCode: string | undefined;
  if (promoCode && typeof promoCode === 'string' && promoCode.length <= 40) {
    const codes = await stripe.promotionCodes.list({ code: promoCode.trim().toUpperCase(), active: true, limit: 1 });
    const code = codes.data[0];
    if (!code) {
      return NextResponse.json({ error: 'That promo code is not valid or has expired.' }, { status: 400 });
    }
    promotionCode = code.id;
  }

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, tier')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bobbiedigital2025-appforge-dev.vercel.app';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : {}),
    allow_promotion_codes: !promotionCode, // one discount max — no stacking
    success_url: `${appUrl}/dashboard?upgraded=true&tier=${tier}`,
    cancel_url: `${appUrl}/pricing?canceled=true`,
    metadata: {
      supabase_user_id: user.id,
      tier,
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        tier,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
