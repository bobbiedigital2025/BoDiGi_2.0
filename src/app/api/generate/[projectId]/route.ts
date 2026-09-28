/**
 * API Route: GET /api/generate/[projectId]
 *
 * Returns the current state of a project — tasks, progress, logs, specs, files, etc.
 * The dashboard polls this to show real-time agent activity.
 * Now checks that the project belongs to the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectFromSupabase } from '@/lib/agents/pipeline';
import { createServerClient } from '@/lib/supabase/server-client';

/**
 * PATCH /api/generate/[projectId] — rename a project.
 * Body: { name: string }. Updates the project row and specs.name so the
 * dashboard, showcase, and Brand Agent all see the new name. The showcase
 * slug is intentionally left alone — URLs should never break on a rename.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: 'Name must be 2–80 characters' }, { status: 400 });
  }

  // RLS scopes this to the owner's row — no row returned means not theirs
  const { data: project } = await supabase
    .from('projects')
    .select('id, specs')
    .eq('id', projectId)
    .single();
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const specs = (project.specs && typeof project.specs === 'object')
    ? { ...(project.specs as Record<string, unknown>), name }
    : project.specs;

  const { error } = await supabase
    .from('projects')
    .update({ name, specs })
    .eq('id', projectId);
  if (error) {
    return NextResponse.json({ error: `Rename failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // Get authenticated user
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Try in-memory first (active pipeline)
  const project = getProject(projectId);

  if (project) {
    return NextResponse.json(project);
  }

  // Try Supabase (completed/persisted project)
  const stored = await getProjectFromSupabase(projectId);
  if (stored) {
    return NextResponse.json({
      state: stored.state,
      progress: stored.progress,
      agentActivity: {},
      files: stored.files,
      ai: { configured: false, model: null },
      letta: { configured: false, agents: 0 },
      testResults: null,
      complianceChecks: null,
    });
  }

  return NextResponse.json({ error: 'Project not found' }, { status: 404 });
}
