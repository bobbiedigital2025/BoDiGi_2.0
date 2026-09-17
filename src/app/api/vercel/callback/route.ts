/**
 * GET /api/vercel/callback?code=...&state=...
 * Vercel OAuth redirect target. Exchanges the code for an access token,
 * encrypts it, stores it in user_api_keys (provider: 'vercel'), then
 * sends the user back to their project preview.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { encrypt } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get('code');
  const stateRaw = request.nextUrl.searchParams.get('state');

  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL('/setup?vercel=error&reason=missing_code', appUrl));
  }

  let state: { p?: string; u?: string } = {};
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'));
  } catch {
    return NextResponse.redirect(new URL('/setup?vercel=error&reason=bad_state', appUrl));
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (state.u && state.u !== user.id)) {
    return NextResponse.redirect(new URL('/login', appUrl));
  }

  const clientId = process.env.VERCEL_CLIENT_ID;
  const clientSecret = process.env.VERCEL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/setup?vercel=error&reason=oauth_not_configured', appUrl));
  }

  // Exchange code → token
  const tokenRes = await fetch('https://api.vercel.com/v2/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${appUrl}/api/vercel/callback`,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/setup?vercel=error&reason=exchange_failed', appUrl));
  }

  const tokenData = await tokenRes.json();
  const accessToken: string | undefined = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL('/setup?vercel=error&reason=no_token', appUrl));
  }

  // Store encrypted — upsert so reconnects just refresh the token.
  // team_id / user_id from Vercel are stored alongside for deploy scoping.
  const payload = JSON.stringify({
    access_token: accessToken,
    team_id: tokenData.team_id || null,
    vercel_user_id: tokenData.user_id || null,
  });

  const { error: upsertError } = await supabase
    .from('user_api_keys')
    .upsert(
      {
        user_id: user.id,
        provider: 'vercel',
        key_value_encrypted: encrypt(payload),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

  if (upsertError) {
    return NextResponse.redirect(new URL('/setup?vercel=error&reason=storage_failed', appUrl));
  }

  const back = state.p ? `/preview/${state.p}?vercel=connected` : '/dashboard?vercel=connected';
  return NextResponse.redirect(new URL(back, appUrl));
}
