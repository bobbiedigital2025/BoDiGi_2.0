/**
 * Supabase-backed project store.
 * Replaces the in-memory Map with persistent database storage.
 * Each project is scoped to a user via user_id.
 */

import { createAdminClient } from './server';
import type { ProjectState, AgentTask, LogEntry, GeneratedFile, AgentRole, TaskStatus, TaskPriority } from '../agents/types';

interface StoredProject {
  orchestrator: {
    getState(): ProjectState;
    getProgress(): number;
    getAgentActivity(): Record<string, { total: number; completed: number; failed: number; inProgress: number }>;
    completeTask(taskId: string, output: unknown): void;
    failTask(taskId: string, error: string): void;
    startTask(taskId: string): void;
    addLog(level: string, agent: string, message: string): void;
  };
  files: GeneratedFile[];
  userId: string;
}

// In-memory cache for active pipelines (still needed while pipeline is running)
const activeProjects = new Map<string, StoredProject>();

export function setActiveProject(projectId: string, project: StoredProject) {
  activeProjects.set(projectId, project);
}

export function getActiveProject(projectId: string): StoredProject | null {
  return activeProjects.get(projectId) || null;
}

export function deleteActiveProject(projectId: string) {
  activeProjects.delete(projectId);
}

/**
 * Save a project to Supabase (upsert).
 */
export async function saveProject(userId: string, projectId: string, state: ProjectState, files: GeneratedFile[], progress: number) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const supabase = createAdminClient();

  // Upsert project
  await supabase.from('projects').upsert({
    id: projectId,
    user_id: userId,
    name: state.name,
    idea: state.idea,
    status: state.status,
    current_phase: state.currentPhase,
    progress,
    specs: state.specs,
    architecture: state.architecture,
    deployment_url: state.deploymentUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', projectId);

  // Upsert tasks
  for (const task of state.tasks) {
    await supabase.from('project_tasks').upsert({
      id: task.id,
      project_id: projectId,
      role: task.role,
      title: task.title,
      status: task.status,
      priority: task.priority,
      error: task.error,
      output: task.output,
      started_at: task.startedAt,
      completed_at: task.completedAt,
      retry_count: task.retryCount || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id);
  }

  // Save files (delete + insert to avoid duplicates)
  if (files.length > 0) {
    const fileRows = files.map(f => ({
      project_id: projectId,
      path: f.path,
      content: f.content,
      agent: f.agent,
      status: f.status,
    }));

    // SHRINK GUARD (Oct 14, SquishDough modify-pass incident): the modify
    // route loaded a stale/partial in-memory file set on a warm lambda and
    // this delete+insert then wiped the customer's real files. Legitimate
    // saves only ever grow the file set or rewrite it at the same size
    // (builds accumulate monotonically; modify/day2/history re-save the set
    // they loaded). An incoming set SMALLER than what the DB holds is by
    // definition missing files — never let it destroy rows. Patch-write the
    // incoming paths instead and keep everything else.
    const { count } = await supabase
      .from('project_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    const existing = count ?? 0;

    if (existing > files.length) {
      console.error(
        `[project-store] SHRINK GUARD tripped for ${projectId}: incoming ${files.length} file(s) < stored ${existing}. ` +
        `Patch-writing incoming paths only — a full overwrite would have destroyed ${existing - files.length} file(s).`
      );
      await supabase
        .from('project_files')
        .delete()
        .eq('project_id', projectId)
        .in('path', files.map(f => f.path));
      await supabase.from('project_files').insert(fileRows);
    } else {
      await supabase.from('project_files').delete().eq('project_id', projectId);
      await supabase.from('project_files').insert(fileRows);
    }
  }

  // Save logs — append-only, cursor-based. Logs are never edited or removed,
  // so instead of delete+insert of the full history we insert only the rows
  // appended since this process's cursor. Each log line has exactly one
  // creator process (the one that appended it after its own load point), so
  // concurrent saves from chain links can never duplicate a line — the old
  // delete+insert snapshot interleaved across lambdas and wrote every line
  // exactly 2x (90s relay test, Oct 13).
  const cursor = logCursor.get(projectId) ?? 0;
  const newLogs = state.logs.slice(cursor);
  if (newLogs.length > 0) {
    const logRows = newLogs.map(l => ({
      project_id: projectId,
      timestamp: l.timestamp,
      agent: l.agent,
      level: l.level,
      message: l.message,
    }));
    // Batch insert is atomic; advance the cursor only after success so a
    // failed save retries the same rows next time.
    await supabase.from('project_logs').insert(logRows);
    logCursor.set(projectId, state.logs.length);
  }
}

/**
 * Per-process count of log rows known to be persisted, keyed by project.
 * Seeded on load (loaded rows are already in the table) and advanced after
 * each successful insert. Process-local like the project store itself —
 * correct across chain links because each link re-seeds on rehydrate.
 */
const logCursor = new Map<string, number>();

/**
 * Load a project from Supabase for the dashboard/analytics API.
 */
export async function loadProjectFromSupabase(projectId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const supabase = createAdminClient();

  // Load project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (projectError || !project) return null;

  // Load tasks
  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  // Load files
  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId);

  // Load logs
  const { data: logs } = await supabase
    .from('project_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('timestamp', { ascending: true });

  // Reconstruct ProjectState
  const state: ProjectState = {
    id: project.id,
    name: project.name,
    idea: project.idea,
    status: project.status,
    currentPhase: project.current_phase,
    tasks: (tasks || []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      role: t.role as AgentRole,
      title: t.title as string,
      description: (t.description as string) || '',
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      dependencies: (t.dependencies as string[]) || [],
      input: (t.input as Record<string, unknown>) || {},
      output: t.output as Record<string, unknown> | null,
      assignedAgent: (t.assigned_agent as string) || null,
      retryCount: t.retry_count as number || 0,
      maxRetries: (t.max_retries as number) || 3,
      createdAt: (t.created_at as number) || Date.now(),
      startedAt: t.started_at as number | null,
      completedAt: t.completed_at as number | null,
      error: t.error as string | null,
    })),
    specs: project.specs,
    architecture: project.architecture,
    generatedFiles: (files || []).map((f: Record<string, unknown>) => ({
      path: f.path as string,
      content: f.content as string,
      agent: f.agent as AgentRole,
      status: f.status as 'generated' | 'tested' | 'deployed' | 'failed',
    })),
    testResults: null,
    deploymentUrl: project.deployment_url,
    logs: (logs || []).map((l: Record<string, unknown>) => ({
      timestamp: l.timestamp as number,
      agent: l.agent as AgentRole,
      level: l.level as 'info' | 'warn' | 'error' | 'debug',
      message: l.message as string,
    })),
    createdAt: new Date(project.created_at).getTime(),
    updatedAt: new Date(project.updated_at).getTime(),
  };

  const generatedFiles: GeneratedFile[] = state.generatedFiles;

  // Every loaded log row is already persisted — seed the save cursor so the
  // next saveProject inserts only lines appended after this load.
  logCursor.set(projectId, state.logs.length);

  return { state, files: generatedFiles, progress: project.progress, userId: project.user_id };
}

/**
 * List all projects for a user.
 */
export async function listUserProjects(userId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('projects')
    .select('id, name, idea, status, progress, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data || [];
}
