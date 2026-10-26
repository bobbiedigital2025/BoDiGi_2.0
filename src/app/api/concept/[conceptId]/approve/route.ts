/**
 * API Route: POST /api/concept/[conceptId]/approve
 *
 * The APPROVED moment — the only door to a build (server-enforced).
 * The founder says yes to the card; the build fires from the APPROVED
 * CARD SNAPSHOT, not the raw idea. Quota is checked here, at the moment
 * of burn, not at card-drafting time.
 *
 * Statuses that may approve: presented (clean card on screen).
 * Flagged concepts wait for an admin clear first. Blocked never builds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createServerClient } from '@/lib/supabase/server-client';
import { checkBuildQuota } from '@/lib/quota';
import { createProject, getPipelineRun } from '@/lib/agents/pipeline';
import { buildBriefFromCard, ConceptCard } from '@/lib/agents/concept-gate';

// Builds run long multi-agent pipelines — same window as the old generate route
export const maxDuration = 300;

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
      .select('*')
      .eq('id', conceptId)
      .maybeSingle();

    if (fetchError || !concept) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }
    if (concept.user_id !== user.id) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }

    // Already approved and building — idempotent: hand back the project
    if (concept.status === 'building' && concept.project_id) {
      return NextResponse.json({ projectId: concept.project_id, message: 'Build already running' });
    }

    if (concept.status !== 'presented') {
      const messages: Record<string, string> = {
        flagged: 'This concept is under review — the build unlocks as soon as our team clears it.',
        blocked: "This concept doesn't meet our content rules and can't be built.",
        cancelled: 'This concept was cancelled — start a fresh idea anytime.',
        drafting: 'The concept card is still being drafted — refresh in a moment.',
        iterating: 'The card is mid-revision — try again in a few seconds.',
      };
      return NextResponse.json(
        { error: messages[concept.status] || `This concept is ${concept.status}.` },
        { status: 409 }
      );
    }

    // ── Quota at the moment of burn ──
    const quota = await checkBuildQuota(user.id);
    if (!quota.allowed) {
      // Concept STAYS approved — the founder can upgrade and return to it
      await supabase.from('concepts').update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      }).eq('id', conceptId);

      return NextResponse.json(
        {
          error: quota.message,
          quota: { tier: quota.tier, used: quota.used, limit: quota.limit },
          upgradeUrl: '/pricing',
          conceptApproved: true,
        },
        { status: 403 }
      );
    }

    // ── Lock the approval, then fire from the card snapshot ──
    const approvedCard = concept.card as ConceptCard;
    const buildIdea = buildBriefFromCard(approvedCard, concept.source_idea);

    const projectId = createProject(buildIdea, user.id);

    // Keep the function alive until the pipeline settles (same pattern as
    // the old generate route — without waitUntil, Vercel freezes mid-build)
    const run = getPipelineRun(projectId);
    if (run) waitUntil(run);

    const { error: updateError } = await supabase.from('concepts').update({
      status: 'building',
      project_id: projectId,
      updated_at: new Date().toISOString(),
    }).eq('id', conceptId);

    if (updateError) {
      console.error('[concept] approve link failed:', updateError.message);
      // The build is running; the link is bookkeeping — log, don't fail the build
    }

    return NextResponse.json({
      projectId,
      message: 'Approved! The AI team is starting your build...',
    });
  } catch (err) {
    console.error('[concept] approve error:', err);
    return NextResponse.json({ error: 'Something went wrong starting the build — try again.' }, { status: 500 });
  }
}
