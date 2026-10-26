/**
 * API Route: POST /api/admin/flagged-concepts/[conceptId]
 * Admin-only. Human review verdict on a borderline concept:
 *   { action: 'clear' } → back to 'presented' — the founder can approve and build
 *   { action: 'block' } → 'blocked' — no build, founder gets a clean refusal
 * The admin's verdict is recorded in classifier_reason (audit trail).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conceptId: string }> }
) {
  try {
    const { conceptId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const action: string = body.action;

    if (action !== 'clear' && action !== 'block') {
      return NextResponse.json({ error: 'action must be "clear" or "block"' }, { status: 400 });
    }

    // Admin client: the concept belongs to another user (RLS owner policy
    // would block the write) — the admin read policy covers SELECT, and the
    // service role handles the verdict write.
    const { createAdminClient } = await import('@/lib/supabase/server');
    const admin = createAdminClient();

    const { data: concept } = await admin
      .from('concepts')
      .select('id, status')
      .eq('id', conceptId)
      .maybeSingle();

    if (!concept) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }
    if (concept.status !== 'flagged') {
      return NextResponse.json({ error: `Concept is ${concept.status}, not flagged` }, { status: 409 });
    }

    const { error } = await admin
      .from('concepts')
      .update({
        status: action === 'clear' ? 'presented' : 'blocked',
        classifier: action === 'clear' ? 'clean' : 'blocked',
        classifier_reason: action === 'clear'
          ? `Reviewed and cleared by admin (${user.id.slice(0, 8)})`
          : `Reviewed and blocked by admin (${user.id.slice(0, 8)})`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conceptId);

    if (error) {
      console.error('[admin/flagged] verdict failed:', error.message);
      return NextResponse.json({ error: 'Could not record the verdict' }, { status: 500 });
    }

    return NextResponse.json({ status: action === 'clear' ? 'presented' : 'blocked' });
  } catch (err) {
    console.error('[admin/flagged] error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
