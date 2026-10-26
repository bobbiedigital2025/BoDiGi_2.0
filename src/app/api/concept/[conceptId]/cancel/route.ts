/**
 * API Route: POST /api/concept/[conceptId]/cancel
 * The founder abandons a concept pre-build. Frees the flow; the idea text
 * stays in their history (nothing is deleted — their words are theirs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ conceptId: string }> }
) {
  try {
    const { conceptId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: concept, error: fetchError } = await supabase
      .from('concepts')
      .select('id, user_id, status')
      .eq('id', conceptId)
      .maybeSingle();

    if (fetchError || !concept) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }
    if (concept.user_id !== user.id) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }

    if (!['drafting', 'presented', 'iterating', 'flagged', 'approved'].includes(concept.status)) {
      return NextResponse.json(
        { error: concept.status === 'building' ? 'This build is already running — cancel it from the build page.' : `Concept is already ${concept.status}.` },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabase.from('concepts').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', conceptId);

    if (updateError) {
      console.error('[concept] cancel failed:', updateError.message);
      return NextResponse.json({ error: 'Could not cancel — try again.' }, { status: 500 });
    }

    return NextResponse.json({ status: 'cancelled' });
  } catch (err) {
    console.error('[concept] cancel error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
