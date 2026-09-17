/**
 * API Route: POST /api/generate/[projectId]/vercel-deploy
 * Pro/Enterprise perk — deploys the generated app to the user's OWN
 * Vercel account, using the token stored via the OAuth flow
 * (/api/vercel/connect) or a manual token (Setup → Vercel).
 *
 * Flow: load files → create/reuse Vercel project → create deployment
 * with inline files → poll until READY → return the live URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { decrypt } from '@/lib/encryption';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase } from '@/lib/supabase/project-store';
import type { GeneratedFile } from '@/lib/agents/types';

const VERCEL_API = 'https://api.vercel.com';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52) || 'bodigi-app';
}

interface StoredVercelToken {
  access_token: string;
  team_id?: string | null;
}

async function loadVercelToken(supabase: any, userId: string): Promise<{ token: string; teamId?: string | null } | null> {
  const { data: keyRow } = await supabase
    .from('user_api_keys')
    .select('key_value_encrypted')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!keyRow?.key_value_encrypted) return null;

  try {
    const raw = decrypt(keyRow.key_value_encrypted);
    // OAuth path stores a JSON blob; manual path stores the bare token
    if (raw.startsWith('{')) {
      const parsed: StoredVercelToken = JSON.parse(raw);
      return { token: parsed.access_token, teamId: parsed.team_id };
    }
    return { token: raw, teamId: null };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.githubExport);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  // 1. Tier gate — real deployment is Pro/Enterprise (admin bypasses)
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role')
    .eq('id', user.id)
    .single();

  const tier = profile?.tier || 'free';
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && !['pro', 'enterprise'].includes(tier)) {
    return NextResponse.json(
      { error: 'Live deployment is a Pro feature. Upgrade to deploy your app to Vercel.', upgrade: true },
      { status: 403 }
    );
  }

  // 2. Load project files (in-memory first, then Supabase) + ownership check
  const inMemory = getProject(projectId);
  let projectName: string;
  let files: GeneratedFile[];

  if (inMemory) {
    projectName = inMemory.state.name;
    files = inMemory.files;
  } else {
    const sbProject = await loadProjectFromSupabase(projectId);
    if (!sbProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const { data: owned } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    projectName = sbProject.state.name;
    files = sbProject.files || [];
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files to deploy yet — wait for the build to finish.' }, { status: 400 });
  }

  // 3. Get the user's Vercel token
  const stored = await loadVercelToken(supabase, user.id);
  if (!stored) {
    return NextResponse.json(
      { error: 'No Vercel connection found. Connect your Vercel account first.', needToken: true },
      { status: 400 }
    );
  }

  const teamQuery = stored.teamId ? `?teamId=${encodeURIComponent(stored.teamId)}` : '';
  const headers = {
    Authorization: `Bearer ${stored.token}`,
    'Content-Type': 'application/json',
  };

  // 4. Create (or reuse) the Vercel project
  const body = await request.json().catch(() => ({}));
  const projectSlug = slugify(body.projectName || projectName || 'bodigi-app');

  const createProjRes = await fetch(`${VERCEL_API}/v9/projects${teamQuery}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectSlug,
      framework: 'nextjs',
    }),
  });

  // 400/409 = name already taken on their account — that's fine, we reuse it
  if (!createProjRes.ok && createProjRes.status !== 400 && createProjRes.status !== 409) {
    if (createProjRes.status === 401 || createProjRes.status === 403) {
      return NextResponse.json(
        { error: 'Your Vercel token was rejected. Reconnect Vercel (it may have been revoked).' },
        { status: 400 }
      );
    }
    const errText = await createProjRes.text();
    return NextResponse.json(
      { error: `Vercel refused to create the project (${createProjRes.status}).`, detail: errText.slice(0, 200) },
      { status: 400 }
    );
  }

  // 5. Create the deployment with all files inline
  const deployFiles = files.map((f) => ({
    file: f.path.replace(/^\/+/, ''),
    data: f.content,
  }));

  const deployRes = await fetch(`${VERCEL_API}/v13/deployments${teamQuery}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectSlug,
      project: projectSlug,
      files: deployFiles,
      target: 'production',
      projectSettings: { framework: 'nextjs' },
    }),
  });

  if (!deployRes.ok) {
    const err = await deployRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: `Vercel deploy failed to start (${deployRes.status}).`, detail: (err as any)?.error?.message?.slice(0, 200) },
      { status: 400 }
    );
  }

  const deployment = await deployRes.json();
  const deploymentId: string = deployment.id;
  const readyUrl: string = deployment.url ? `https://${deployment.url}` : '';

  // 6. Poll until READY (max ~90s inside the route; Vercel usually finishes small apps in 20-40s)
  const deadline = Date.now() + 90_000;
  let state: string = deployment.readyState || 'QUEUED';
  let finalUrl = readyUrl;

  while (Date.now() < deadline && !['READY', 'ERROR', 'CANCELED'].includes(state)) {
    await new Promise((r) => setTimeout(r, 3000));
    const check = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}${teamQuery}`, { headers });
    if (check.ok) {
      const d = await check.json();
      state = d.readyState || state;
      if (d.url) finalUrl = `https://${d.url}`;
    }
  }

  if (state !== 'READY') {
    return NextResponse.json(
      {
        success: false,
        state,
        deploymentUrl: finalUrl,
        error: state === 'ERROR'
          ? 'Vercel reported a build error. Check the deployment logs in your Vercel dashboard.'
          : 'Deployment is still building — check your Vercel dashboard in a minute.',
      },
      { status: state === 'ERROR' ? 400 : 202 }
    );
  }

  return NextResponse.json({
    success: true,
    url: finalUrl,
    project: projectSlug,
    dashboard: 'https://vercel.com/dashboard',
    note: 'Your app is live on YOUR Vercel account. You can revoke BoDiGi\'s access anytime in Vercel Settings → Apps — your app keeps running either way.',
  });
}
