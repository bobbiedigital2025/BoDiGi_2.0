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
import { sendTicketReply } from '@/lib/email';

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

/**
 * POST — reply to a ticket. Emails the user and records the reply
 * on the ticket (appended to resolution_note with a timestamp).
 * Body: { id, reply }
 */
export async function POST(request: NextRequest) {
  const { admin } = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const body = await request.json();
  const { id, reply } = body as { id?: string; reply?: string };
  if (!id || !reply?.trim()) {
    return NextResponse.json({ error: 'Ticket id and reply text required.' }, { status: 400 });
  }

  const { data: ticket, error: fetchError } = await admin
    .from('support_tickets')
    .select('user_email, subject, status, resolution_note')
    .eq('id', id)
    .single();

  if (fetchError || !ticket) {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  }
  if (!ticket.user_email) {
    return NextResponse.json({ error: 'Ticket has no user email to reply to.' }, { status: 400 });
  }

  const { sent: emailSent } = await sendTicketReply({
    userEmail: ticket.user_email,
    ticketSubject: ticket.subject,
    replyText: reply.trim().slice(0, 4000),
  });

  // Record the reply on the ticket and move to in_progress if still open
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const prior = ticket.resolution_note ? ticket.resolution_note + '\n\n' : '';
  const note = `${prior}--- Reply sent ${stamp} ---\n${reply.trim().slice(0, 4000)}`;
  const statusUpdate = ticket.status === 'open' ? 'in_progress' : ticket.status;

  await admin
    .from('support_tickets')
    .update({
      resolution_note: note.slice(0, 8000),
      status: statusUpdate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({ success: true, emailSent });
}
