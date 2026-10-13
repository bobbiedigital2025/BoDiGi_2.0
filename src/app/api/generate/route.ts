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

    const body = await request.json();
    const idea: string = body.idea;

    if (!idea || typeof idea !== 'string' || idea.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please provide a more detailed app idea (at least 10 characters)' },
        { status: 400 }
      );
    }

    // Sanitize: cap length, strip control characters
    const sanitized = idea.trim().slice(0, 2000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    const projectId = createProject(sanitized, user.id);

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
