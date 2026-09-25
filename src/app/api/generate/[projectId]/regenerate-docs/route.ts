/**
 * API Route: POST /api/generate/[projectId]/regenerate-docs
 *
 * Re-runs the docs agent against an existing project. Useful when the
 * original build used fallback content (AI was offline) and you want
 * real AI-generated docs after configuring a working API key.
 *
 * Owner or admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase, saveProject } from '@/lib/supabase/project-store';
import { runDocsAgent } from '@/lib/agents/qa-agents';
import { hasAIKey } from '@/lib/agents/ai-client';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!hasAIKey()) {
    return NextResponse.json({ error: 'No AI provider configured — set OPENROUTER_API_KEY in Vercel env vars.' }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Load the project state
  const inMemory = getProject(projectId);
  let state: any;
  let files: any[];
  let progress = 100;
  const userId: string = owned.user_id;

  if (inMemory) {
    state = inMemory.state;
    files = inMemory.files;
    progress = inMemory.progress;
  } else {
    const stored = await loadProjectFromSupabase(projectId);
    if (!stored) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    state = stored.state;
    files = stored.files || [];
    progress = stored.progress;
  }

  // Re-run the docs agent
  const warnings: string[] = [];
  const log = (level: 'warn', msg: string) => { warnings.push(msg); };

  try {
    const docs = await runDocsAgent(state, log, { includeMarketing: true });

    // Replace the docs files in the project
    const docPaths: Record<string, string> = {
      'README.md': docs.readme,
      'INVESTOR_PITCH.md': docs.investorPitch,
      'REALITY_CHECK.md': docs.realityCheck,
      'LAUNCH_GUIDE.md': docs.launchGuide,
    };
    if (docs.marketingKit) {
      docPaths['MARKETING_KIT.md'] = docs.marketingKit;
    }

    const fileMap = new Map(files.map((f: any) => [f.path, f]));
    for (const [path, content] of Object.entries(docPaths)) {
      if (fileMap.has(path)) {
        fileMap.get(path)!.content = content;
      } else {
        fileMap.set(path, { path, content, agent: 'docs' as const, status: 'generated' as const });
      }
    }

    const newFiles = Array.from(fileMap.values());
    await saveProject(userId, projectId, state, newFiles, progress);
    if (inMemory) {
      inMemory.files.length = 0;
      inMemory.files.push(...newFiles);
    }

    revalidatePath(`/preview/${projectId}`);

    return NextResponse.json({
      success: true,
      regenerated: Object.keys(docPaths),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Docs regeneration failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
