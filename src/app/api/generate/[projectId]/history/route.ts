/**
 * API Routes: /api/generate/[projectId]/history
 *   GET    — list version history (MOD-SNAPSHOT entries from project_logs)
 *   POST   — restore a snapshot: { logId } rolls the files back to the
 *            pre-modify state captured in that snapshot entry.
 * Snapshots are written by the modify route before every change, so each
 * entry is a complete restore point of the files it touched.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveTier } from '@/lib/trial';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { loadProjectFromSupabase, saveProject } from '@/lib/supabase/project-store';
import { getProject } from '@/lib/agents/pipeline';
import type { GeneratedFile } from '@/lib/agents/types';

interface SnapshotEntry {
  id: number;
  timestamp: number;
  instruction: string;
  files: string[]; // paths in the snapshot
}

interface SnapshotFile {
  path: string;
  content: string;
}

function parseSnapshotMessage(message: string): { instruction: string; files: SnapshotFile[] } | null {
  // Format: MOD-SNAPSHOT before "instruction": [{path, content}, ...]
  const m = message.match(/^MOD-SNAPSHOT before "([\s\S]*)": ([\s\S]*)$/);
  if (!m) return null;
  let files: SnapshotFile[] = [];
  try {
    const parsed = JSON.parse(m[2]);
    if (Array.isArray(parsed)) files = parsed;
  } catch {
    return null; // truncated JSON — not restorable
  }
  return { instruction: m[1], files };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Rate limit — history listing hits project_logs which can be large
  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 });
  }

  // Ownership check
  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

  const isAdmin = await (async () => {
    const adminRead = createAdminClient();
    const { data: profile } = await adminRead.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role === 'admin';
  })();

  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: logs } = await createAdminClient()
    .from('project_logs')
    .select('id, timestamp, message')
    .eq('project_id', projectId)
    .like('message', 'MOD-SNAPSHOT%')
    .order('timestamp', { ascending: false })
    .limit(50);

  const history: SnapshotEntry[] = [];
  for (const log of logs || []) {
    const parsed = parseSnapshotMessage(log.message);
    if (!parsed) continue; // skip unparseable/truncated entries
    history.push({
      id: log.id,
      timestamp: log.timestamp,
      instruction: parsed.instruction,
      files: parsed.files.map((f) => f.path),
    });
  }

  return NextResponse.json({ history });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rlPost = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rlPost.success) {
    return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 });
  }

  // Tier gate — same as modify: rollback is a Pro perk, admin bypasses
  const adminRead = createAdminClient();
  const { data: profile } = await adminRead.from('profiles').select('tier, role, is_trial, tier_expires_at').eq('id', user.id).single();
  const tier = resolveTier(profile);
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && !['pro', 'enterprise'].includes(tier)) {
    return NextResponse.json(
      { error: `Version history is a Pro feature — you're signed in as ${user.email || 'unknown'} (${tier}).`, upgrade: true },
      { status: 403 }
    );
  }

  // Ownership
  const { data: owned } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (!owned || (owned.user_id !== user.id && !isAdmin)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { logId } = await request.json().catch(() => ({}));
  if (!logId || typeof logId !== 'number') {
    return NextResponse.json({ error: 'logId required' }, { status: 400 });
  }

  // Load the snapshot
  const { data: log } = await adminRead
    .from('project_logs')
    .select('id, timestamp, message')
    .eq('project_id', projectId)
    .eq('id', logId)
    .like('message', 'MOD-SNAPSHOT%')
    .single();

  if (!log) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  const parsed = parseSnapshotMessage(log.message);
  if (!parsed || parsed.files.length === 0) {
    return NextResponse.json({ error: 'This snapshot is damaged and cannot be restored.' }, { status: 422 });
  }

  // Load current project
  const inMemory = getProject(projectId);
  let state: any;
  let files: GeneratedFile[];
  let progress: number;

  if (inMemory) {
    state = inMemory.state;
    files = inMemory.files;
    progress = inMemory.progress;
  } else {
    const sbProject = await loadProjectFromSupabase(projectId);
    if (!sbProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    state = sbProject.state;
    files = sbProject.files || [];
    progress = sbProject.progress;
  }

  // Snapshot the CURRENT state first, so a rollback is itself reversible
  const currentSnapshot = parsed.files.map((sf) => ({
    path: sf.path,
    content: files.find((f) => f.path === sf.path)?.content ?? '',
  })).filter((f) => f.content !== '');

  if (currentSnapshot.length > 0) {
    await adminRead.from('project_logs').insert({
      project_id: projectId,
      timestamp: Date.now(),
      agent: 'backend',
      level: 'info',
      message: `MOD-SNAPSHOT before "rollback to #${logId}": ${JSON.stringify(currentSnapshot).slice(0, 50000)}`,
    });
  }

  // Apply the old contents
  const snapshotMap = new Map(parsed.files.map((f) => [f.path, f.content]));
  for (const file of files) {
    const old = snapshotMap.get(file.path);
    if (old !== undefined) file.content = old;
  }

  // Persist (both stores, mirroring the modify route)
  const userId: string = owned.user_id;
  if (inMemory) {
    await saveProject(userId, projectId, state, files, progress);
  } else {
    await saveProject(userId, projectId, state, files, progress);
  }

  return NextResponse.json({ restored: true, filesRestored: snapshotMap.size });
}
