/**
 * GET /api/vercel/connect?projectId=...
 * Starts the Vercel OAuth (integration) flow. Redirects the user to
 * vercel.com to authorize BoDiGi, then Vercel bounces back to
 * /api/vercel/callback with a code we exchange for an access token.
 *
 * Requires VERCEL_CLIENT_ID + VERCEL_CLIENT_SECRET env vars
 * (from the Vercel integration console). If they are not set, the
 * route explains the manual-token fallback instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const projectId = request.nextUrl.searchParams.get('projectId') || '';
  const clientId = process.env.VERCEL_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (!clientId) {
    // OAuth app not registered yet — send the user to the manual-token path
    return NextResponse.redirect(
      new URL(`/setup?vercel=manual${projectId ? `&projectId=${projectId}` : ''}`, appUrl)
    );
  }

  // State carries the project through the round-trip (plus CSRF protection)
  const state = Buffer.from(
    JSON.stringify({ p: projectId, u: user.id, t: Date.now() })
  ).toString('base64url');

  const authorize = new URL('https://vercel.com/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${appUrl}/api/vercel/callback`);
  authorize.searchParams.set('state', state);

  return NextResponse.redirect(authorize);
}
