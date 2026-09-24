/**
 * API Route: /api/admin/support
 *
 * GET  — list all support tickets (admin only)
 * PATCH — update a ticket (status, priority, resolution note)
 *
 * Admin-only, enforced server-side via the service role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, admin: null as SupabaseClient | null };

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return { user, admin: profile?.role === 'admin' ? admin : null };
}

export async function GET() {
  const { admin } = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { data: tickets, error } = await admin
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tickets: tickets || [] });
}

export async function PATCH(request: NextRequest) {
  const { admin } = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const body = await request.json();
  const { id, status, priority, resolutionNote } = body as {
    id?: string;
    status?: string;
    priority?: string;
    resolutionNote?: string;
  };

  if (!id) {
    return NextResponse.json({ error: 'Ticket id required.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) update.status = status;
  if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) update.priority = priority;
  if (typeof resolutionNote === 'string') update.resolution_note = resolutionNote.slice(0, 4000);

  const { error } = await admin.from('support_tickets').update(update).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
