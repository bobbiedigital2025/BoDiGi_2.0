/**
 * API Route: POST /api/generate/[projectId]/brand
 *
 * Generates (or regenerates, with ?force=1) the project's brand kit:
 * logo, palette, voice, tagline. Available on every tier — a business
 * builder that ships no brand ships anonymous software.
 *
 * GET returns the existing kit without generating.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { generateBrandKit } from '@/lib/agents/brand';
import { setUsageContext } from '@/lib/agents/ai-client';

export const maxDuration = 240; // image generation is slow

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
  const brand = (auth.project!.specs as Record<string, unknown>)?.brand || null;
  return NextResponse.json({ brand });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (auth.error) return auth.error;

  const existing = (auth.project!.specs as Record<string, unknown>)?.brand;
  const force = request.nextUrl.searchParams.get('force') === '1';
  if (existing && !force) {
    return NextResponse.json({ brand: existing, cached: true });
  }

  try {
    setUsageContext('brand', auth.user!.id, projectId);
    const brand = await generateBrandKit(projectId);
    return NextResponse.json({ brand });
  } catch (err) {
    console.error('Brand generation failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Brand generation failed' },
      { status: 500 }
    );
  }
}
