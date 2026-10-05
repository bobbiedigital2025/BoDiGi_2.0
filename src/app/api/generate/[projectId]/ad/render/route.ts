/**
 * API Route: POST /api/generate/[projectId]/ad/render
 *
 * Submits the project's ad kit narration to HeyGen (v3) as a
 * talking-avatar video. Body: { avatarId, voiceId, dimension: '16:9' | '9:16' }.
 * Requires an existing ad kit (generate one first via /ad).
 *
 * GET ?video_id=... polls the render status and persists the finished URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { hasHeygenKey, submitRender, pollRender } from '@/lib/agents/heygen-client';
import { createAdminClient } from '@/lib/supabase/server';

export const maxDuration = 300;

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;

  if (!hasHeygenKey()) {
    return NextResponse.json({ error: 'HeyGen is not configured on this server (missing HEYGEN_API_KEY)' }, { status: 503 });
  }

  const specs = (auth.project!.specs || {}) as Record<string, unknown>;
  const ad = specs.ad as
    | { script?: string; angle?: string; length?: number; scenes?: unknown[] }
    | undefined;
  if (!ad?.script) {
    return NextResponse.json({ error: 'No ad kit yet — generate one first (POST /api/generate/[projectId]/ad)' }, { status: 400 });
  }

  let body: { avatarId?: string; voiceId?: string; dimension?: string; supportedEngines?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // fall through to validation error below
  }
  if (!body.avatarId || !body.voiceId) {
    return NextResponse.json({ error: 'avatarId and voiceId are required' }, { status: 400 });
  }
  const aspectRatio = body.dimension === '9:16' ? '9:16' as const : '16:9' as const;

  // Brand background color from the kit's first scene, if present
  const scenes = (ad.scenes as Array<{ background?: string }>) || [];
  const backgroundColor = scenes[0]?.background || undefined;

  try {
    const videoId = await submitRender({
      avatarId: body.avatarId,
      voiceId: body.voiceId,
      script: ad.script,
      aspectRatio,
      backgroundColor,
      title: `BoDiGi Ad — ${aspectRatio === '9:16' ? 'Vertical' : 'Landscape'} ${ad.length || 30}s`,
      supportedEngines: body.supportedEngines,
    });

    // Persist render state on the ad kit so the dashboard can resume polling
    const supabase = createAdminClient();
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        specs: {
          ...specs,
          ad: {
            ...ad,
            render_status: 'rendering',
            render: {
              provider: 'heygen',
              api: 'v3',
              video_id: videoId,
              dimension: body.dimension || '16:9',
              started_at: new Date().toISOString(),
            },
          },
        },
      })
      .eq('id', projectId);
    if (updateError) throw new Error(`Could not save render state: ${updateError.message}`);

    return NextResponse.json({ videoId, status: 'rendering' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'HeyGen render submission failed' },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;

  const videoId = new URL(request.url).searchParams.get('video_id');
  if (!videoId) {
    return NextResponse.json({ error: 'video_id query param required' }, { status: 400 });
  }

  try {
    const status = await pollRender(videoId);

    const specs = (auth.project!.specs || {}) as Record<string, unknown>;
    const ad = specs.ad as Record<string, unknown> | undefined;
    const render = (ad?.render as Record<string, unknown>) || {};
    const supabase = createAdminClient();

    if (status.status === 'completed') {
      await supabase
        .from('projects')
        .update({
          specs: {
            ...specs,
            ad: {
              ...ad,
              render_status: 'ready',
              render: {
                ...render,
                video_url: status.videoUrl,
                thumbnail_url: status.thumbnailUrl,
                subtitle_url: status.subtitleUrl,
                duration_seconds: status.durationSeconds,
                completed_at: new Date().toISOString(),
              },
            },
          },
        })
        .eq('id', projectId);
    } else if (status.status === 'failed') {
      await supabase
        .from('projects')
        .update({
          specs: {
            ...specs,
            ad: { ...ad, render_status: 'failed' },
          },
        })
        .eq('id', projectId);
    }

    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'HeyGen status check failed' },
      { status: 502 },
    );
  }
}
