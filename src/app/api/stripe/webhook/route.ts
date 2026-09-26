/**
 * API Route: POST /api/stripe/webhook
 * Handles Stripe webhook events to sync subscription state to Supabase.
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 *   URL: https://your-domain.vercel.app/api/stripe/webhook
 *   Events: checkout.session.completed, customer.subscription.updated,
 *           customer.subscription.deleted
 * Then set STRIPE_WEBHOOK_SECRET in environment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import { sendUpgradeConfirmationEmail } from '@/lib/email';
import Stripe from 'stripe';

// Use service role client for webhook (bypasses RLS, runs without user session)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // ─── Template marketplace purchase ───
      if (session.metadata?.kind === 'template_purchase') {
        const purchaseId = session.metadata.purchase_id;
        if (purchaseId) {
          await supabase
            .from('template_purchases')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', Number(purchaseId))
            .eq('status', 'pending'); // idempotent — webhook retries can't double-flip
          console.log(`Template purchase ${purchaseId} paid`);
        }
        break;
      }

      const userId = session.metadata?.supabase_user_id;
      const tier = session.metadata?.tier;

      if (userId && tier) {
        // Set tier with 30-day expiry (renews via subscription.updated)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);

        await supabase
          .from('profiles')
          .update({
            tier,
            tier_expires_at: expiresAt.toISOString(),
            stripe_customer_id: session.customer as string,
          })
          .eq('id', userId);

        console.log(`User ${userId} upgraded to ${tier}`);

        // Send upgrade confirmation email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single();

        if (profile?.email) {
          const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
          await sendUpgradeConfirmationEmail(profile.email, tierName);
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      const tier = subscription.metadata?.tier;

      if (userId) {
        if (subscription.status === 'active' && tier) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 31);

          await supabase
            .from('profiles')
            .update({
              tier,
              tier_expires_at: expiresAt.toISOString(),
            })
            .eq('id', userId);
        } else if (['canceled', 'unpaid', 'past_due'].includes(subscription.status)) {
          // Downgrade to free on cancellation/non-payment
          await supabase
            .from('profiles')
            .update({
              tier: 'free',
              tier_expires_at: null,
            })
            .eq('id', userId);

          console.log(`User ${userId} downgraded to free (status: ${subscription.status})`);
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;

      if (userId) {
        await supabase
          .from('profiles')
          .update({
            tier: 'free',
            tier_expires_at: null,
          })
          .eq('id', userId);

        console.log(`User ${userId} subscription deleted, downgraded to free`);
      }
      break;
    }

    default:
      // Unhandled event type — fine, acknowledge receipt
      break;
  }

  return NextResponse.json({ received: true });
}
