/**
 * API Route: POST /api/concept
 *
 * CONCEPT APPROVAL GATE — entry point (Bobbie's funnel catch, Oct 22 lock).
 * The old flow: idea (or interview brief) fed /api/generate SILENTLY and the
 * build burned without the founder ever approving the concept. This route is
 * the new front door: classify the content, draft the one-screen Concept
 * Card, present it. Nothing builds until the founder approves.
 *
 * One gate, two jobs — the classifier runs BEFORE the card is presented:
 *   blocked    → explicit adult content: no card flow, no build (403)
 *   borderline → flagged for human review: card shown, build waits for admin
 *   clean      → card presented, founder approves or iterates
 *
 * The gate never dead-ends: if the AI is down, the card falls back to a
 * minimal card built from the brief text with zero AI calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { classifyContent, draftConceptCard } from '@/lib/agents/concept-gate';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to start a build.' },
        { status: 401 }
      );
    }

    const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.concept);
    if (!rl.success) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `You're moving fast! Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const body = await request.json();
    const idea: string = body.idea;
    const source: string = body.source === 'interview' ? 'interview' : 'idea';

    if (!idea || typeof idea !== 'string' || idea.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please provide a more detailed app idea (at least 10 characters)' },
        { status: 400 }
      );
    }

    // Same sanitization rules as the old generate route
    const sanitized = idea.trim().slice(0, 2000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // ── JOB 2 FIRST: classify before anything burns ──
    const classification = await classifyContent(sanitized, user.id);

    if (classification.verdict === 'blocked') {
      const conceptId = `concept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await supabase.from('concepts').insert({
        id: conceptId,
        user_id: user.id,
        source,
        source_idea: sanitized,
        status: 'blocked',
        classifier: 'blocked',
        classifier_reason: classification.reason,
      });
      return NextResponse.json(
        {
          conceptId,
          status: 'blocked',
          error: "We can't build this one — the concept doesn't meet our content rules. If you think that's a mistake, contact support@bobbie.digital.",
        },
        { status: 403 }
      );
    }

    // ── JOB 1: draft the card (AI, with never-dead-ends fallback) ──
    const card = await draftConceptCard(sanitized);

    const conceptId = `concept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const status = classification.verdict === 'borderline' ? 'flagged' : 'presented';

    const { error } = await supabase.from('concepts').insert({
      id: conceptId,
      user_id: user.id,
      source,
      source_idea: sanitized,
      status,
      card,
      card_version: 1,
      classifier: classification.verdict,
      classifier_reason: classification.reason,
    });

    if (error) {
      console.error('[concept] insert failed:', error.message);
      return NextResponse.json(
        { error: 'Could not save your concept — try again in a moment.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conceptId,
      status,
      card,
      classifier: classification.verdict,
      // Flagged cards are visible but can't be approved until an admin clears them
      flaggedNotice:
        status === 'flagged'
          ? 'Your concept card is ready. Our team is reviewing one detail before the build can start — you can still refine the card below.'
          : undefined,
    });
  } catch (err) {
    console.error('[concept] route error:', err);
    return NextResponse.json(
      { error: 'Something went wrong drafting your concept — try again.' },
      { status: 500 }
    );
  }
}
