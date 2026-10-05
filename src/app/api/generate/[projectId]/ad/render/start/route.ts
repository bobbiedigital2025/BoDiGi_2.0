/**
 * API Route: POST /api/generate/[projectId]/ad/render/start
 *
 * Starts the HeyGen render for a PAID video purchase. Called by the
 * dashboard once it sees the purchase flip to 'paid' (after Stripe
 * checkout + webhook). Idempotent: if a video_id already exists for the
 * purchase, returns it instead of double-rendering (which would double-bill
 * the HeyGen wallet).
 *
 * Body: { purchaseId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { hasHeygenKey, submitRender } from '@/lib/agents/heygen-client';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { purchaseId } = await request.json().catch(() => ({}));
  if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });

  if (!hasHeygenKey()) {
    return NextResponse.json({ error: 'Video rendering is not available yet.' }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from('video_render_purchases')
    .select('id, user_id, project_id, status, render_params, heygen_video_id')
    .eq('id', Number(purchaseId))
    .eq('project_id', projectId)
    .single();

  if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (purchase.user_id !== user.id && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Not your purchase' }, { status: 403 });
  }

  // Idempotency: already submitted → return the existing video id
  if (purchase.heygen_video_id) {
    return NextResponse.json({ videoId: purchase.heygen_video_id, status: purchase.status });
  }
  if (purchase.status !== 'paid') {
    return NextResponse.json(
      { error: `Purchase is '${purchase.status}' — payment must clear before rendering.` },
      { status: 402 },
    );
  }

  const { data: project } = await admin.from('projects').select('name, specs').eq('id', projectId).single();
  const specs = (project?.specs || {}) as Record<string, unknown>;
  const ad = specs.ad as { script?: string; length?: number; scenes?: Array<{ background?: string }> } | undefined;
  if (!ad?.script) return NextResponse.json({ error: 'Ad kit missing' }, { status: 400 });

  const rp = (purchase.render_params || {}) as {
    avatarId: string; voiceId: string; dimension: string; supportedEngines?: string[];
  };

  try {
    const videoId = await submitRender({
      avatarId: rp.avatarId,
      voiceId: rp.voiceId,
      script: ad.script,
      aspectRatio: rp.dimension === '9:16' ? '9:16' : '16:9',
      backgroundColor: ad.scenes?.[0]?.background,
      title: `BoDiGi Ad — ${project?.name || projectId}`,
      supportedEngines: rp.supportedEngines,
    });

    await admin
      .from('video_render_purchases')
      .update({ status: 'rendering', heygen_video_id: videoId })
      .eq('id', purchase.id);

    return NextResponse.json({ videoId, status: 'rendering' });
  } catch (e) {
    await admin.from('video_render_purchases').update({ status: 'failed' }).eq('id', purchase.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Render failed to start' },
      { status: 502 },
    );
  }
}
