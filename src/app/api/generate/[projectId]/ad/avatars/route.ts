/**
 * API Route: GET /api/generate/[projectId]/ad/avatars
 *
 * Lists the HeyGen avatars + voices available to the configured key,
 * so the Ad Studio panel can offer a picker. Owner-or-admin auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { hasHeygenKey, listAvatars, listVoices } from '@/lib/agents/heygen-client';

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const isAdmin = profile?.role === 'admin';
  if (project.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Not your project' }, { status: 403 });
  }

  if (!hasHeygenKey()) {
    return NextResponse.json({ configured: false, avatars: [], voices: [] });
  }

  try {
    const [avatars, voices] = await Promise.all([listAvatars(), listVoices()]);
    return NextResponse.json({ configured: true, avatars, voices });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'HeyGen list failed' },
      { status: 502 },
    );
  }
}
