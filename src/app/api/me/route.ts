/**
 * API Route: GET /api/me
 * Lightweight session probe for client components. Returns the caller's
 * role + tier so UI can branch (e.g. Ad Studio admin renders free,
 * subscribers go through Stripe checkout) without shipping service keys.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tier, email')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    authenticated: true,
    role: profile?.role || 'user',
    tier: profile?.tier || 'free',
    email: profile?.email || null,
  });
}
