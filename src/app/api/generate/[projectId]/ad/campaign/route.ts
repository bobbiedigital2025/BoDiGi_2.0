/**
 * API Route: /api/generate/[projectId]/ad/campaign
 *
 * Ad Studio v2 — campaign mode (kinetic tier).
 * POST { brief } → creates a campaign row + generates the full package:
 *   master script, 3 hook variants, per-platform posting copy, posting plan.
 * GET → lists this project's campaigns (newest first).
 *
 * Render + delivery are separate steps (render queue comes next); this
 * route only takes a campaign from draft → scripted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { generateCampaign, campaignTierEnabled } from '@/lib/agents/ad-campaign';
import { setUsageContext } from '@/lib/agents/ai-client';

export const maxDuration = 120;

async function authorize(projectId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id, specs')
    .eq('id', projectId)
    .single();

  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const isAdmin = profile?.role === 'admin';
  if (project.user_id !== user.id && !isAdmin) {
    return { error: NextResponse.json({ error: 'Not your project' }, { status: 403 }) };
  }
  return { user, project };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;

  const supabase = await createServerClient();
  const { data: campaigns, error } = await supabase
    .from('ad_campaigns')
    .select('id, tier, status, brief, campaign, deliverables, error, created_at, updated_at')
    .eq('project_id', Number(projectId))
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Campaigns unavailable — has migration 020 been applied?' }, { status: 500 });
  }
  return NextResponse.json({ campaigns });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;
  const { user, project } = auth;

  const body = await request.json().catch(() => ({}));
  const brief = (body.brief || '').trim();
  if (brief.length < 20) {
    return NextResponse.json({ error: 'Describe your business in at least a sentence or two.' }, { status: 400 });
  }

  const tier: 'kinetic' | 'avatar' = body.tier === 'avatar' ? 'avatar' : 'kinetic';
  if (!campaignTierEnabled(tier)) {
    return NextResponse.json({ error: 'Campaigns are launching soon — pricing is being finalized.' }, { status: 503 });
  }

  // Create the campaign row first (draft), then script it.
  const admin = createAdminClient();
  const { data: campaign, error: insertError } = await admin
    .from('ad_campaigns')
    .insert({
      user_id: user.id,
      project_id: Number(projectId),
      tier,
      status: 'draft',
      brief,
    })
    .select('id')
    .single();

  if (insertError || !campaign) {
    return NextResponse.json({ error: 'Could not create campaign — has migration 020 been applied?' }, { status: 500 });
  }

  try {
    setUsageContext('ad-campaign', user.id, projectId);
    const specs = (project.specs as Record<string, unknown>) || {};
    const brandSpec = (specs.brand as { name?: string; voice?: string; tagline?: string; palette?: Record<string, string> }) || null;
    const generated = await generateCampaign(brief, brandSpec);

    const { error: updateError } = await admin
      .from('ad_campaigns')
      .update({ status: 'scripted', campaign: generated, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);

    if (updateError) throw new Error('Campaign scripted but not saved');

    return NextResponse.json({ campaignId: campaign.id, status: 'scripted', campaign: generated });
  } catch (err) {
    await admin
      .from('ad_campaigns')
      .update({ status: 'failed', error: err instanceof Error ? err.message : 'Campaign generation failed', updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
    return NextResponse.json({ error: 'Campaign generation failed. Your brief was saved — try again.' }, { status: 500 });
  }
}
