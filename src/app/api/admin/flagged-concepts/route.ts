/**
 * API Route: GET /api/admin/flagged-concepts
 * Admin-only. The borderline-content review queue (classifier flags these
 * before a card can be approved). Newest first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function GET(_request: NextRequest) {
  try {
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

    const { data: flagged, error } = await supabase
      .from('concepts')
      .select('id, user_id, source, source_idea, status, card, card_version, classifier, classifier_reason, created_at')
      .eq('status', 'flagged')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[admin/flagged] list error:', error.message);
      return NextResponse.json({ error: 'Could not load the review queue' }, { status: 500 });
    }

    return NextResponse.json({ flagged });
  } catch (err) {
    console.error('[admin/flagged] error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
