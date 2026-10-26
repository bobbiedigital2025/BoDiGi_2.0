/**
 * API Route: GET /api/concept/[conceptId]
 * Fetch one concept (owner or admin). Powers the Concept Card page —
 * the founder polls this while deciding, and it carries the status the
 * UI renders: presented | flagged | blocked | approved | building.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function GET(
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

    // RLS scopes this to owner (or admin read policy)
    const { data: concept, error } = await supabase
      .from('concepts')
      .select('*')
      .eq('id', conceptId)
      .maybeSingle();

    if (error || !concept) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }

    return NextResponse.json({ concept });
  } catch (err) {
    console.error('[concept] fetch error:', err);
    return NextResponse.json({ error: 'Could not load the concept' }, { status: 500 });
  }
}
