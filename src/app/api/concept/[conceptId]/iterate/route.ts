/**
 * API Route: POST /api/concept/[conceptId]/iterate
 *
 * The founder's revise-until-approved loop: keep what they like, change what
 * they name. The iteration prompt carries forward unchanged elements
 * explicitly (her rule, at prompt level). Each iteration re-classifies —
 * content can drift when it changes.
 *
 * Iterations are UNCAPPED against tier AI allowances (Sunday CEO decision)
 * — the only bound is the abuse rate-limit. The approved card version is
 * the snapshot the build uses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { classifyContent, iterateConceptCard, ConceptCard, IterationRecord } from '@/lib/agents/concept-gate';

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

    const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.conceptIterate);
    if (!rl.success) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Lots of iterating! Take a breather — try again in ${Math.ceil(retryAfter / 60)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const body = await request.json();
    const feedback: string = body.feedback;
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length < 3) {
      return NextResponse.json(
        { error: 'Tell us what to change — even a few words helps.' },
        { status: 400 }
      );
    }
    const sanitizedFeedback = feedback.trim().slice(0, 1000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

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

    // Iterate from presented / iterating / flagged (flagged founders can keep
    // refining while review happens — they still can't build until cleared).
    if (!['presented', 'iterating', 'flagged'].includes(concept.status)) {
      return NextResponse.json(
        { error: `This concept is ${concept.status} — iteration is closed.` },
        { status: 409 }
      );
    }

    const previousCard = concept.card as ConceptCard;
    const nextCard = await iterateConceptCard(concept.source_idea, previousCard, sanitizedFeedback);

    // Re-classify on every iteration — content can drift when it changes
    const classification = await classifyContent(
      `${concept.source_idea}\n\nFounder's iteration: ${sanitizedFeedback}`,
      user.id
    );

    if (classification.verdict === 'blocked') {
      await supabase.from('concepts').update({
        status: 'blocked',
        classifier: 'blocked',
        classifier_reason: classification.reason,
        updated_at: new Date().toISOString(),
      }).eq('id', conceptId);
      return NextResponse.json(
        {
          status: 'blocked',
          error: "This version doesn't meet our content rules, so the concept is closed. Start a new idea anytime.",
        },
        { status: 403 }
      );
    }

    const nextStatus = classification.verdict === 'borderline' ? 'flagged' : 'presented';

    const iterations: IterationRecord[] = Array.isArray(concept.iterations) ? concept.iterations : [];
    iterations.push({
      feedback: sanitizedFeedback,
      card: previousCard,
      at: new Date().toISOString(),
    });

    const { error: updateError } = await supabase.from('concepts').update({
      status: nextStatus,
      card: nextCard,
      card_version: (concept.card_version || 1) + 1,
      iterations,
      classifier: classification.verdict,
      classifier_reason: classification.reason,
      updated_at: new Date().toISOString(),
    }).eq('id', conceptId);

    if (updateError) {
      console.error('[concept] iterate update failed:', updateError.message);
      return NextResponse.json({ error: 'Could not save the revision — try again.' }, { status: 500 });
    }

    return NextResponse.json({
      conceptId,
      status: nextStatus,
      card: nextCard,
      card_version: (concept.card_version || 1) + 1,
      classifier: classification.verdict,
      flaggedNotice:
        nextStatus === 'flagged'
          ? 'Revision saved. Our team is reviewing one detail before the build can start.'
          : undefined,
    });
  } catch (err) {
    console.error('[concept] iterate error:', err);
    return NextResponse.json({ error: 'Something went wrong revising — try again.' }, { status: 500 });
  }
}
