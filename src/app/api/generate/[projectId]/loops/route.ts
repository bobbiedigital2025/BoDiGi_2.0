/**
 * API Routes: /api/generate/[projectId]/loops
 *   GET    — list this app's engagement loops
 *   POST   — create a loop { action, actionLabel, reward, rewardLabel, rewardConfig }
 *   PATCH  — toggle active / update
 *   DELETE — remove (?loopId=)
 * All owner-gated. Loops are CONFIG; the "wire" happens via the modify
 * pipeline (separate wire action below) which generates the actual
 * tracking + redemption code into the user's app.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

const ACTIONS = ['try_app', 'invite_friend', 'share_facebook', 'share_x', 'upgrade', 'post_accomplishment', 'complete_onboarding', 'refer_customer'];
const REWARDS = ['discount_10', 'discount_25', 'free_feature_24h', 'free_feature_72h', 'unlock_premium_feature', 'badge', 'early_access'];

async function requireOwner(supabase: any, projectId: string, userId: string) {
  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id, name')
    .eq('id', projectId)
    .maybeSingle();
  if (!owned) return { ok: false as const, status: 404, error: 'Project not found' };
  if (owned.user_id !== userId) {
    const adminRead = createAdminClient();
    const { data: profile } = await adminRead.from('profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'admin') {
      return { ok: false as const, status: 404, error: 'Project not found' };
    }
  }
  return { ok: true as const, project: owned };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const gate = await requireOwner(supabase, projectId, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const admin = createAdminClient();
  const { data } = await admin.from('engagement_loops').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
  return NextResponse.json({ loops: data || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const gate = await requireOwner(supabase, projectId, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json().catch(() => ({}));
  const { action, actionLabel, reward, rewardLabel, rewardConfig } = body;

  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Choose from: ${ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (!REWARDS.includes(reward)) {
    return NextResponse.json({ error: `Invalid reward. Choose from: ${REWARDS.join(', ')}` }, { status: 400 });
  }
  if (!actionLabel || typeof actionLabel !== 'string' || actionLabel.length > 200) {
    return NextResponse.json({ error: 'Describe the action for your users (max 200 chars)' }, { status: 400 });
  }
  if (!rewardLabel || typeof rewardLabel !== 'string' || rewardLabel.length > 200) {
    return NextResponse.json({ error: 'Describe the reward (max 200 chars)' }, { status: 400 });
  }

  // Cap: 8 loops per app — keep the loop board focused, not a slot machine
  const admin = createAdminClient();
  const { count } = await admin.from('engagement_loops').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  if ((count || 0) >= 8) {
    return NextResponse.json({ error: 'Max 8 loops per app — remove one first. Focused loops convert better than walls of offers.' }, { status: 422 });
  }

  const { data, error } = await admin.from('engagement_loops').insert({
    project_id: projectId,
    action,
    action_label: actionLabel,
    reward,
    reward_label: rewardLabel,
    reward_config: rewardConfig ? JSON.stringify(rewardConfig).slice(0, 500) : null,
  }).select().single();

  if (error) return NextResponse.json({ error: 'Could not create loop' }, { status: 500 });
  return NextResponse.json({ loop: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const gate = await requireOwner(supabase, projectId, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { loopId, active, wired } = await request.json().catch(() => ({}));
  if (!loopId) return NextResponse.json({ error: 'loopId required' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('engagement_loops')
    .update({
      ...(typeof active === 'boolean' ? { active } : {}),
      ...(wired === true ? { wired_at: Date.now() } : {}),
    })
    .eq('id', loopId)
    .eq('project_id', projectId);

  if (error) return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const gate = await requireOwner(supabase, projectId, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const loopId = new URL(request.url).searchParams.get('loopId');
  if (!loopId) return NextResponse.json({ error: 'loopId required' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('engagement_loops').delete().eq('id', Number(loopId)).eq('project_id', projectId);
  if (error) return NextResponse.json({ error: 'Could not delete' }, { status: 500 });
  return NextResponse.json({ success: true });
}
