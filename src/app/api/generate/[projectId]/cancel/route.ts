/**
 * API Route: POST /api/generate/[projectId]/cancel
 *
 * THE CANCEL SWITCH (paired hardening, Concept Gate changeset, Oct 22 lock).
 * Before this existed, a "cancel" was a status flip the build ignored — the
 * Oct 22 incident had a cancelled build's relay complete underneath and
 * overwrite the kill. Now cancel is three layers:
 *   1. this route flips projects.status → 'cancelled' (DB, authoritative)
 *   2. the pipeline checks at every task boundary and halts (in-flight legs)
 *   3. the resume relay refuses non-active statuses (the chain dies at handoff)
 *
 * Cancellation waits for the current agent step to settle — never mid-call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { cancelBuild } from '@/lib/agents/cancel-switch';

const ACTIVE_STATUSES = ['planning', 'building', 'testing', 'deploying'];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: project, error } = await supabase
      .from('projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .maybeSingle();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!ACTIVE_STATUSES.includes(project.status)) {
      return NextResponse.json(
        { error: `This build is already ${project.status} — nothing to cancel.` },
        { status: 409 }
      );
    }

    await cancelBuild(projectId);

    return NextResponse.json({
      status: 'cancelled',
      message: 'Build cancelled. Work completed so far is saved on the build page.',
    });
  } catch (err) {
    console.error('[cancel] error:', err);
    return NextResponse.json({ error: 'Could not cancel the build — try again.' }, { status: 500 });
  }
}
