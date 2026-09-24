/**
 * API Route: /api/admin/users
 *
 * PATCH — update a user's tier or role (admin only).
 * Lets a true admin grant tiers, promote/demote admins —
 * the human backstop for billing issues the AI can't touch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { admin: null as SupabaseClient | null };

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return { admin: profile?.role === 'admin' ? admin : null };
}

export async function PATCH(request: NextRequest) {
  const { admin } = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, tier, role } = body as { userId?: string; tier?: string; role?: string };

  if (!userId) {
    return NextResponse.json({ error: 'userId required.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tier && ['free', 'starter', 'pro', 'enterprise'].includes(tier)) update.tier = tier;
  if (role && ['user', 'admin'].includes(role)) update.role = role;

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { error } = await admin.from('profiles').update(update).eq('id', userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
