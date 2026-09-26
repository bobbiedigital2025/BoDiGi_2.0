/**
 * API Route: POST /api/templates/fork { projectId }
 * Copies a template app into the caller's account: a NEW project row
 * (their id, their ownership), copied specs/architecture, and all files
 * — instantly usable, fully editable, deployable as theirs.
 * Counts against the forker's build quota (it's a new app in their account).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { checkBuildQuota } from '@/lib/quota';
import type { GeneratedFile } from '@/lib/agents/types';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.generate);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit reached — try again in an hour.' }, { status: 429 });

  const { projectId } = await request.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  // Quota — forking creates a real app in their account
  const quota = await checkBuildQuota(user.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quota.message, quota: { tier: quota.tier, used: quota.used, limit: quota.limit }, upgradeUrl: '/pricing' },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Source must be a public template
  const { data: source } = await admin
    .from('projects')
    .select('id, name, idea, status, current_phase, progress, specs, architecture, user_id, is_template, template_price_cents')
    .eq('id', projectId)
    .maybeSingle();

  if (!source || !source.is_template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if ((source.progress || 0) < 100) return NextResponse.json({ error: 'This template is still building — try again shortly.' }, { status: 422 });

  // Paid template? Buyer must have purchased it (or be the owner/admin)
  if (source.template_price_cents && source.template_price_cents >= 100 && source.user_id !== user.id) {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      const { data: purchase } = await admin
        .from('template_purchases')
        .select('id')
        .eq('template_project_id', projectId)
        .eq('buyer_user_id', user.id)
        .eq('status', 'paid')
        .maybeSingle();
      if (!purchase) {
        return NextResponse.json(
          { error: 'This is a paid template — purchase it to fork.', requiresPurchase: true },
          { status: 402 }
        );
      }
    }
  }

  // Copy files
  const { data: fileRows } = await admin
    .from('project_files')
    .select('path, content, agent, status')
    .eq('project_id', projectId);

  if (!fileRows || fileRows.length === 0) {
    return NextResponse.json({ error: 'Template has no files to copy.' }, { status: 422 });
  }

  // New project — forker's id, fresh name
  const newId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const newName = `${source.name} (my copy)`;

  const { error: insertError } = await admin.from('projects').insert({
    id: newId,
    user_id: user.id,
    name: newName,
    idea: source.idea,
    status: 'completed',
    current_phase: source.current_phase,
    progress: 100,
    specs: source.specs,
    architecture: source.architecture,
    is_template: false,       // their copy is NOT automatically a template
    is_public: false,         // and NOT published to the showcase
  });
  if (insertError) return NextResponse.json({ error: 'Could not create your copy.' }, { status: 500 });

  // Copy files in batches (Supabase insert limit safety)
  const BATCH = 200;
  for (let i = 0; i < fileRows.length; i += BATCH) {
    const batch = fileRows.slice(i, i + BATCH).map((f: any) => ({
      project_id: newId,
      path: f.path,
      content: f.content,
      agent: f.agent,
      status: f.status,
    }));
    const { error: fileErr } = await admin.from('project_files').insert(batch);
    if (fileErr) {
      // Clean up the partial copy — don't leave a broken project
      await admin.from('projects').delete().eq('id', newId);
      return NextResponse.json({ error: 'Could not copy template files.' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, projectId: newId, name: newName, fileCount: fileRows.length });
}
