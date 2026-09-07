/**
 * TEMPORARY debug route — reports presence (not values) of critical env vars.
 * DELETE after webhook debugging is complete.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const vars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_STARTER',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_ENTERPRISE',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'NEXT_PUBLIC_APP_URL',
    'SENTRY_DSN',
    'TELNYX_API_KEY',
    'LETTA_API_KEY',
    'ENCRYPTION_KEY',
    'CRON_SECRET',
  ];

  const report: Record<string, string> = {};
  for (const v of vars) {
    const val = process.env[v];
    report[v] = val ? `SET (starts: ${val.slice(0, 6)}...)` : 'MISSING';
  }

  // Also test Stripe client construction
  try {
    const { getStripe } = await import('@/lib/stripe/client');
    getStripe();
    report['_stripe_client'] = 'OK';
  } catch (e) {
    report['_stripe_client'] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(report);
}
