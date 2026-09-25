/**
 * API Route: POST /api/generate/[projectId]/rename
 *
 * Rename a project. The pipeline defaults names to the first 80 chars
 * of the idea text; owners (or the AI support chat acting through the
 * modify pipeline) can set a real product name. Persists to both the
 * projects row and the stored project state so it sticks everywhere.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase, saveProject } from '@/lib/supabase/project-store';

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = profile?.role === 'admin';

  // Ownership check via the projects table
  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (name.length < 2) {
    return NextResponse.json({ error: 'Give it a real name — at least 2 characters.' }, { status: 400 });
  }

  // Update the projects row
  const { error } = await admin
    .from('projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update stored state so the preview shows the new name too
  const inMemory = getProject(projectId);
  if (inMemory) {
    inMemory.state.name = name;
  } else {
    const stored = await loadProjectFromSupabase(projectId);
    if (stored) {
      stored.state.name = name;
      await saveProject(owned.user_id, projectId, stored.state, stored.files, stored.progress);
    }
  }

  return NextResponse.json({ success: true, name });
}
