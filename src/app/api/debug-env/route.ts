/**
 * TEMPORARY debug route — reports presence (not values) of critical env vars.
 * Locked behind SUPABASE_SERVICE_ROLE_KEY bearer auth (already a server secret).
 * DELETE after webhook debugging is complete.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    'NEXT_PUBLIC_SENTRY_DSN',
    'TELNYX_API_KEY',
    'LETTA_API_KEY',
    'ENCRYPTION_KEY',
    'CRON_SECRET',
  ];

  const report: Record<string, string> = {};
  for (const v of vars) {
    const val = process.env[v];
    // Report format/prefix class only — never value characters beyond the
    // well-known public prefix (sk_test, whsec, price_, https, etc.)
    if (!val) {
      report[v] = 'MISSING';
    } else {
      const knownPrefixes = ['sk_test', 'sk_live', 'whsec', 'price_', 'https', 're_', 'sb_', 'KEY', 'sk-let', 'BoDiGi'];
      const matched = knownPrefixes.find((p) => val.startsWith(p));
      report[v] = matched ? `SET (${matched}...)` : 'SET (format unrecognized)';
    }
  }

  try {
    const { getStripe } = await import('@/lib/stripe/client');
    getStripe();
    report['_stripe_client'] = 'OK';
  } catch (e) {
    report['_stripe_client'] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(report);
}
