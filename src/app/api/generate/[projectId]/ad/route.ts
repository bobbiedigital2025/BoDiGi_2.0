/**
 * API Route: POST /api/generate/[projectId]/ad
 *
 * Generates (or regenerates) the project's ad kit: a 15/30/60-second
 * ad script + storyboard written in the brand's voice. The Trupeer ×
 * Make smoosh lives here — every BoDiGi app can advertise itself.
 *
 * GET returns the existing kit without generating.
 * Body: { length?: 15 | 30 | 60, angle?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { generateAdKit } from '@/lib/agents/ad-studio';
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
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;
  const ad = (auth.project!.specs as Record<string, unknown>)?.ad || null;
  return NextResponse.json({ ad });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;

  let body: { length?: number; angle?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults apply
  }

  const length = body.length === 15 || body.length === 60 ? body.length : 30;

  try {
    setUsageContext('ad', auth.user!.id, projectId);
    const ad = await generateAdKit(projectId, length, body.angle);
    return NextResponse.json({ ad });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ad generation failed' },
      { status: 500 },
    );
  }
}
