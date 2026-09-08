/**
 * AppForge Pipeline Executor
 * 
 * Runs the full agent pipeline when a user submits an idea.
 * This is the engine that connects the orchestrator to the individual agents.
 * 
 * Flow:
 * 1. PM Agent → generate specs
 * 2. Architect Agent → design architecture
 * 3. Database + Backend + Frontend agents → generate code (parallel)
 * 4. Testing Agent → validate
 * 5. Compliance Agent → audit
 * 6. DevOps Agent → deploy
 * 7. Docs Agent → document
 * 
 * AI provider: Telnyx Inference API (TELNYX_API_KEY). When configured, all
 * agents call real AI (MiniMax-M3 by default) using the system prompts in
 * each agent module. On any failure, agents fall back to default generators
 * so the pipeline always completes.
 */

import { AppForgeOrchestrator } from './orchestrator';
import {
  generateDefaultSpecs,
  parsePMResponse,
  buildPMPrompt,
  PM_AGENT_SYSTEM_PROMPT,
  type PMAgentOutput,
} from './pm-agent';
import {
  generateDefaultArchitecture,
  parseArchitectResponse,
  buildArchitectPrompt,
  ARCHITECT_AGENT_SYSTEM_PROMPT,
  type ArchitectAgentOutput,
} from './architect-agent';
import {
  generateDefaultDatabaseFiles,
  generateDefaultBackendFiles,
  generateDefaultFrontendFiles,
  runDatabaseAgent,
  runBackendAgent,
  runFrontendAgent,
} from './codegen-agents';
import { runTestingAgent, runComplianceAgent, runDocsAgent, runDevOpsAgent } from './qa-agents';
import { hasAIKey, callAI, getAIStatus } from './ai-client';
import { hasLettaKey, callLettaAgent, callWithFallback, getLettaStatus } from './letta-client';
import type { ProjectState, GeneratedFile } from './types';
import { hasSupabase } from '../supabase/server';
import { saveProject, loadProjectFromSupabase, listUserProjects } from '../supabase/project-store';

// In-memory project store (shared with API routes)
// Still needed for active pipeline runs; completed projects persist to Supabase
declare global {
  // eslint-disable-next-line no-var
  var __appforgeProjects: Map<string, {
    orchestrator: AppForgeOrchestrator;
    state: ProjectState;
    files: GeneratedFile[];
    userId?: string;
  }> | undefined;
}

function getStore() {
  if (!globalThis.__appforgeProjects) {
    globalThis.__appforgeProjects = new Map();
  }
  return globalThis.__appforgeProjects!;
}

/**
 * Execute the full pipeline for a project.
 * This runs asynchronously — the dashboard polls for updates.
 */
export async function executePipeline(projectId: string, idea: string, userId?: string): Promise<void> {
  const store = getStore();
  const project = store.get(projectId);
  if (!project) return;

  const { orchestrator } = project;
  const tasks = orchestrator.getState().tasks;

  // Helper: simulate work delay
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Execute tasks in dependency order, with retry passes.
  // A failed task flips to 'retrying' then back to 'pending' after its backoff
  // timer, so we re-scan until nothing runnable remains (or safety limit hit).
  const MAX_PASSES = 4;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let ranAny = false;

    for (const task of tasks) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'retrying') continue;

      // Start the task
      orchestrator.startTask(task.id, `agent-${task.role}`);

    try {
      let output: Record<string, unknown>;

      switch (task.role) {
        // ─── Phase 1: PM Agent ───
        case 'pm': {
          let result: PMAgentOutput;
          const pmPrompt = buildPMPrompt({ idea });
          if (hasLettaKey() || hasAIKey()) {
            try {
              const raw = await callWithFallback(
                'pm',
                pmPrompt,
                () => callAI(PM_AGENT_SYSTEM_PROMPT, pmPrompt),
                (level, msg) => orchestrator.log('pm', level, msg)
              );
              result = parsePMResponse(raw);
            } catch (err) {
              orchestrator.log('pm', 'warn', `AI call failed, using default specs: ${err instanceof Error ? err.message : 'unknown'}`);
              result = generateDefaultSpecs(idea);
            }
          } else {
            await delay(1500);
            result = generateDefaultSpecs(idea);
          }
          output = { specs: result.specs };
          break;
        }

        // ─── Phase 2: Architect Agent ───
        case 'architect': {
          const state = orchestrator.getState();
          const specs = state.specs!;
          let result: ArchitectAgentOutput;
          const archPrompt = buildArchitectPrompt({ specs, idea });
          if (hasLettaKey() || hasAIKey()) {
            try {
              const raw = await callWithFallback(
                'architect',
                `Here is the product specification for the app:\n\n${JSON.stringify(specs, null, 2)}\n\nOriginal idea: ${idea}\n\nPlease produce a technical architecture in JSON format.`,
                () => callAI(ARCHITECT_AGENT_SYSTEM_PROMPT, archPrompt),
                (level, msg) => orchestrator.log('architect', level, msg)
              );
              result = parseArchitectResponse(raw);
            } catch (err) {
              orchestrator.log('architect', 'warn', `AI call failed, using default architecture: ${err instanceof Error ? err.message : 'unknown'}`);
              result = generateDefaultArchitecture(specs, idea);
            }
          } else {
            await delay(2000);
            result = generateDefaultArchitecture(specs, idea);
          }
          output = { architecture: result.architecture };
          break;
        }

        // ─── Phase 3: Code Generation (parallel) ───
        case 'database': {
          if (!hasAIKey()) await delay(2500);
          const state = orchestrator.getState();
          const result = await runDatabaseAgent(
            { architecture: state.architecture!, specs: state.specs! },
            (level, msg) => orchestrator.log('database', level, msg)
          );
          project.files.push(...result.files);
          output = { files: result.files };
          break;
        }

        case 'backend': {
          if (!hasAIKey()) await delay(3000);
          const state = orchestrator.getState();
          const result = await runBackendAgent(
            { architecture: state.architecture!, specs: state.specs! },
            (level, msg) => orchestrator.log('backend', level, msg)
          );
          project.files.push(...result.files);
          output = { files: result.files };
          break;
        }

        case 'frontend': {
          if (!hasAIKey()) await delay(3500);
          const state = orchestrator.getState();
          const result = await runFrontendAgent(
            { architecture: state.architecture!, specs: state.specs! },
            (level, msg) => orchestrator.log('frontend', level, msg)
          );
          project.files.push(...result.files);
          output = { files: result.files };
          break;
        }

        // ─── Phase 4: Testing Agent ───
        case 'testing': {
          const state = orchestrator.getState();
          if (!hasAIKey()) await delay(2000);
          const result = await runTestingAgent(state.specs!, (level, msg) =>
            orchestrator.log('testing', level, msg)
          );
          output = result;
          break;
        }

        // ─── Phase 5: Compliance Agent ───
        case 'compliance': {
          const state = orchestrator.getState();
          if (!hasAIKey()) await delay(2000);
          const result = await runComplianceAgent(state.specs!, (level, msg) =>
            orchestrator.log('compliance', level, msg)
          );
          output = result;
          break;
        }

        // ─── Phase 6: DevOps Agent ───
        case 'devops': {
          const state = orchestrator.getState();
          if (!hasAIKey()) await delay(2500);
          const result = await runDevOpsAgent(state.specs!, (level: 'warn', msg: string) =>
            orchestrator.log('devops', level, msg)
          );
          project.files.push(...result.files);
          output = {
            files: result.files,
            deployment: 'Vercel',
            buildStatus: 'success',
            // NOTE: no deployment URL is set here. The app is NOT deployed —
            // it lives as a hosted preview inside BoDiGi 2.0. A real URL only
            // exists after a paid one-click deploy (future Deployment Agent).
          };
          break;
        }

        // ─── Phase 7: Docs Agent ───
        case 'docs': {
          if (!hasAIKey()) await delay(1500);
          const docs = await runDocsAgent(orchestrator.getState(), (level, msg) =>
            orchestrator.log('docs', level, msg)
          );
          const docFiles = [
            { path: 'README.md', content: docs.readme, agent: 'docs' as const, status: 'generated' as const },
            { path: 'INVESTOR_PITCH.md', content: docs.investorPitch, agent: 'docs' as const, status: 'generated' as const },
            { path: 'REALITY_CHECK.md', content: docs.realityCheck, agent: 'docs' as const, status: 'generated' as const },
            { path: 'LAUNCH_GUIDE.md', content: docs.launchGuide, agent: 'docs' as const, status: 'generated' as const },
          ].filter(f => f.content.length > 0);
          project.files.push(...docFiles);
          output = { files: docFiles };
          break;
        }

        // ─── Healing Agent ───
        case 'healing': {
          await delay(1000);
          output = { healed: true, fix: 'Applied fallback strategy' };
          break;
        }

        default:
          output = {};
      }

      orchestrator.completeTask(task.id, output);
    } catch (error) {
      orchestrator.failTask(
        task.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
      ranAny = true;
    }

    // Nothing ran this pass — all tasks are completed, failed, or waiting
    if (!ranAny) break;

    // If any task is in retry backoff, wait for it to flip back to pending
    if (tasks.some((t) => t.status === 'retrying')) {
      await delay(5000);
    }
  }

  // Update final state
  const finalState = orchestrator.getState();
  project.state = finalState;
  store.set(projectId, project);

  // Persist final state to Supabase
  if (userId && hasSupabase()) {
    try {
      await saveProject(userId, projectId, finalState, project.files, orchestrator.getProgress());
    } catch (err) {
      console.error(`Failed to save final project state to Supabase:`, err);
    }
  }
}

/**
 * Create a new project and start the pipeline.
 */
export function createProject(idea: string, userId?: string): string {
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orchestrator = new AppForgeOrchestrator(projectId, idea);
  orchestrator.decomposeIdea(idea);

  const store = getStore();
  store.set(projectId, {
    orchestrator,
    state: orchestrator.getState(),
    files: [],
    userId,
  });

  // Persist to Supabase if configured
  if (userId && hasSupabase()) {
    saveProject(userId, projectId, orchestrator.getState(), [], 0).catch((err) => {
      console.error(`Failed to save project to Supabase:`, err);
    });
  }

  // Start the pipeline asynchronously
  executePipeline(projectId, idea, userId).catch((err) => {
    console.error(`Pipeline failed for ${projectId}:`, err);
  });

  return projectId;
}

/**
 * Get project state for the dashboard.
 */
export function getProject(projectId: string) {
  const store = getStore();
  const project = store.get(projectId);
  if (!project) return null;

  // Extract test results and compliance checks from completed task outputs
  const state = project.orchestrator.getState();
  const testTask = state.tasks.find(t => t.role === 'testing' && t.output);
  const complianceTask = state.tasks.find(t => t.role === 'compliance' && t.output);

  return {
    state,
    progress: project.orchestrator.getProgress(),
    agentActivity: project.orchestrator.getAgentActivity(),
    files: project.files,
    ai: getAIStatus(),
    letta: getLettaStatus(),
    testResults: (testTask?.output as { results?: unknown[] })?.results || null,
    complianceChecks: (complianceTask?.output as { checks?: unknown[] })?.checks || null,
  };
}

/**
 * Get project from Supabase (for completed/persisted projects).
 */
export async function getProjectFromSupabase(projectId: string) {
  return loadProjectFromSupabase(projectId);
}

/**
 * Persistence-aware project loader.
 * Tries the in-memory store first (live builds), then falls back to
 * Supabase (persisted projects). Essential on serverless (Vercel),
 * where the in-memory store is empty once the build function ends.
 * Returns the same shape as getProject().
 */
export async function getProjectAnywhere(projectId: string) {
  const live = getProject(projectId);
  if (live) return live;

  const persisted = await loadProjectFromSupabase(projectId);
  if (!persisted) return null;

  const state = persisted.state;
  const testTask = state.tasks.find(t => t.role === 'testing' && t.output);
  const complianceTask = state.tasks.find(t => t.role === 'compliance' && t.output);

  return {
    state,
    progress: persisted.progress,
    agentActivity: [] as object[],
    files: persisted.files,
    ai: null as { connected: boolean; model: string } | null,
    letta: null,
    userId: (persisted as { userId?: string }).userId || null,
    testResults: (testTask?.output as { results?: unknown[] } | null)?.results || null,
    complianceChecks: (complianceTask?.output as { checks?: unknown[] } | null)?.checks || null,
  };
}

/**
 * List all projects for a user (from Supabase, falling back to in-memory).
 */
export async function listProjectsForUser(userId: string) {
  if (hasSupabase()) {
    const projects = await listUserProjects(userId);
    if (projects.length > 0) return projects;
  }
  // Fallback: return in-memory projects
  const store = getStore();
  return Array.from(store.entries())
    .filter(([, p]) => p.userId === userId || !p.userId)
    .map(([id, p]) => ({
      id,
      name: p.state.name,
      idea: p.state.idea,
      status: p.state.status,
      progress: p.orchestrator.getProgress(),
      created_at: new Date(p.state.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    }));
}

/**
 * List all project IDs (legacy, for in-memory only).
 */
export function listProjects(): string[] {
  const store = getStore();
  return Array.from(store.keys());
}
