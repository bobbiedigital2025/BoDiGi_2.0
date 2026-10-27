/**
 * API Route: POST /api/generate
 *
 * Takes a user's app idea, creates a project, and kicks off the agent pipeline.
 * Returns the project ID so the client can redirect to the dashboard and watch progress.
 * Now requires authentication — projects are scoped to the logged-in user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createProject, listProjectsForUser, getPipelineRun } from '@/lib/agents/pipeline';
import { sweepStaleBuilds } from '@/lib/agents/stale-builds';
import { buildBriefFromCard, type ConceptCard } from '@/lib/agents/concept-gate';
import { createServerClient } from '@/lib/supabase/server-client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { checkBuildQuota } from '@/lib/quota';

// Builds run long multi-agent pipelines — keep the function alive for the
// full allowed window instead of the default 60s.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to create a project.' },
        { status: 401 }
      );
    }

    // Rate limit pipeline generation (expensive AI calls)
    const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.generate);
    if (!rl.success) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Rate limit reached. You can start a new build in ${Math.ceil(retryAfter / 60)} minutes. Free tier allows ${RATE_LIMITS.generate.limit} builds per hour.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Tier build quota (free: 1/mo, starter: 5/mo, pro: 10/day guardrail)
    const quota = await checkBuildQuota(user.id);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: quota.message,
          quota: { tier: quota.tier, used: quota.used, limit: quota.limit },
          upgradeUrl: '/pricing',
        },
        { status: 403 }
      );
    }

    // ── CONCEPT APPROVAL GATE (Oct 22 lock) ────────────────────────────────
    // This route used to take a raw idea and burn a build silently. Now it
    // is server-enforced: a build only fires from an APPROVED concept card.
    // Admins may bypass for verification builds (audit-logged path).
    const body = await request.json();
    const conceptId: string | undefined = body.conceptId;

    let idea: string;
    let lockedConceptId: string | null = null;

    if (conceptId && typeof conceptId === 'string') {
      const { data: concept, error: conceptError } = await supabase
        .from('concepts')
        .select('id, user_id, status, card, source_idea, project_id')
        .eq('id', conceptId)
        .maybeSingle();

      if (conceptError || !concept || concept.user_id !== user.id) {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }

      // Idempotent: an approved concept that already launched hands back its project
      if (concept.status === 'building' && concept.project_id) {
        return NextResponse.json({
          projectId: concept.project_id,
          message: 'Build already running',
        });
      }

      if (concept.status !== 'approved') {
        return NextResponse.json(
          {
            error:
              concept.status === 'presented' || concept.status === 'iterating'
                ? 'Approve the concept card first — then the build fires.'
                : `This concept is ${concept.status} and cannot start a build.`,
            conceptFlow: true,
          },
          { status: 403 }
        );
      }

      // Build from the APPROVED CARD SNAPSHOT, not the raw idea
      // Atomic flip approved → building first (double-fire guard, CPO review
      // fix Oct 26): a concurrent second call finds 'building' and hands
      // back the running project instead of burning a second build. This
      // door also LINKS the project, which it previously never did.
      const { data: locked, error: lockError } = await supabase
        .from('concepts')
        .update({ status: 'building', updated_at: new Date().toISOString() })
        .eq('id', conceptId)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle();

      if (lockError) {
        return NextResponse.json({ error: 'Something went wrong starting the build — try again.' }, { status: 500 });
      }
      if (!locked) {
        const { data: current } = await supabase
          .from('concepts')
          .select('status, project_id')
          .eq('id', conceptId)
          .maybeSingle();
        if (current?.status === 'building' && current.project_id) {
          return NextResponse.json({ projectId: current.project_id, message: 'Build already running' });
        }
        return NextResponse.json({ error: 'This concept is no longer approved for a build.' }, { status: 409 });
      }
      lockedConceptId = conceptId;

      idea = buildBriefFromCard(concept.card as ConceptCard, concept.source_idea);
    } else {
      // No conceptId: admin bypass only (verification builds, audit path)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role !== 'admin') {
        return NextResponse.json(
          {
            error: 'Every build starts with a concept card now — tell us your idea and approve the concept first.',
            conceptFlow: true,
          },
          { status: 403 }
        );
      }

      const rawIdea: string = body.idea;
      if (!rawIdea || typeof rawIdea !== 'string' || rawIdea.trim().length < 10) {
        return NextResponse.json(
          { error: 'Please provide a more detailed app idea (at least 10 characters)' },
          { status: 400 }
        );
      }
      idea = rawIdea.trim().slice(0, 2000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    // (idea is now either an approved-card brief or an admin-bypass idea —
    //  both sanitized at their origin; card content was sanitized at draft time)

    let projectId: string;
    try {
      projectId = createProject(idea, user.id);
    } catch (err) {
      if (lockedConceptId) {
        // Fire failed — unwind the lock so the founder can retry
        await supabase
          .from('concepts')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', lockedConceptId);
      }
      throw err; // falls through to the route's catch → 500
    }

    if (lockedConceptId) {
      // Link the project to the concept (this door previously never linked)
      await supabase
        .from('concepts')
        .update({ project_id: projectId, updated_at: new Date().toISOString() })
        .eq('id', lockedConceptId);
    }

    // Keep this function instance alive until the pipeline settles.
    // Fire-and-forget without waitUntil is what let Vercel freeze builds
    // mid-run and leave them in 'building' forever.
    const run = getPipelineRun(projectId);
    if (run) waitUntil(run);

    return NextResponse.json({
      projectId,
      message: 'Project created. Agent team is starting...',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ projects: [] });
  }

  // Watchdog: flip any builds whose runner died >15 min ago to failed so
  // the dashboard never shows an infinite spinner. One cheap select when
  // nothing is stale.
  waitUntil(sweepStaleBuilds().catch(() => 0));

  const projects = await listProjectsForUser(user.id);
  return NextResponse.json({ projects });
}
