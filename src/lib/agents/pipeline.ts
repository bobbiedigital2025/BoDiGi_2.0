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
import { reflectOnBuild } from './build-memory';
import { hasAIKey, callAI, getAIStatus, setUsageContext } from './ai-client';
import { hasLettaKey, callLettaAgent, callWithFallback, getLettaStatus } from './letta-client';
import { markBuildFailed } from './stale-builds';
import type { ProjectState, GeneratedFile, AgentRole } from './types';
import { hasSupabase } from '../supabase/server';
import { saveProject, loadProjectFromSupabase, listUserProjects } from '../supabase/project-store';
import { isCancelledLocally, isProjectCancelled } from './cancel-switch';

// In-memory project store (shared with API routes)
// Still needed for active pipeline runs; completed projects persist to Supabase
declare global {
  // eslint-disable-next-line no-var
  var __appforgeProjects: Map<string, {
    orchestrator: AppForgeOrchestrator;
    state: ProjectState;
    files: GeneratedFile[];
    userId?: string;
    run?: Promise<void>;
  }> | undefined;
}

function getStore() {
  if (!globalThis.__appforgeProjects) {
    globalThis.__appforgeProjects = new Map();
  }
  return globalThis.__appforgeProjects!;
}

// ─── Relay runner ─────────────────────────────────────────────────────────
// Vercel kills a serverless function at maxDuration (300s). Long builds need
// more than one window, so before starting a task the pipeline checks
// whether that task can plausibly finish in the remaining time — if not, it
// saves and hands off to a fresh invocation via the /resume route, which
// re-enters the loop (completed tasks are skipped). Chaining always happens
// BETWEEN tasks, never mid-task: a mid-task death is the stuck-build bug.
// 15s of the window is reserved for the save + handoff fetch.
const PIPELINE_HARD_STOP_MS = 285_000;
// Conservative per-role runtime estimates. Wrong estimates degrade
// gracefully: an overestimate costs an extra chain hop (~1s), an
// underestimate risks a mid-task death — so these lean generous.
const ROLE_TIME_ESTIMATE_MS: Partial<Record<AgentRole, number>> = {
  pm: 90_000,
  architect: 90_000,
  // Codegen estimates MUST stay >= budgetForRole(role).timeoutMs (270s
  // since 0ea46d4). The Oct 28 verification builds died because backend
  // still estimated 180s: the chain check let it start in a window that
  // couldn't fit a 270s call, and the Vercel 300s ceiling killed the
  // function mid-flight. Underestimates risk mid-task death (RUNE, Oct 28).
  frontend: 270_000,
  backend: 270_000,
  database: 270_000,
  docs: 90_000,
};
const DEFAULT_TASK_ESTIMATE_MS = 60_000;
// A full build is ~15 tasks; 10 links ≈ 45 minutes of build time. Past that
// something is wrong — stop chaining and let the stale-build watchdog mark
// the build failed honestly instead of looping forever.
const MAX_CHAIN_DEPTH = 10;

/**
 * Hand the build off to a fresh serverless invocation. The resume route
 * acknowledges immediately (202) and keeps working via waitUntil, so this
 * await only lasts as long as the handoff itself.
 */
async function chainToFreshWindow(projectId: string, chainDepth: number): Promise<number> {
  // Hand off via the PUBLIC production URL, never the deployment-specific
  // VERCEL_URL: deployment URLs can be intercepted by platform protection
  // layers (the request then never reaches our route at all), while the
  // production alias is the path we have verified reaches the handler.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://bodigi2.com';
  const url = `${base}/api/generate/${projectId}/resume?depth=${chainDepth + 1}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
      // Never follow redirects: the platform protection wall answers a POST
      // with a 302 to its SSO page, and a followed redirect returns a 200
      // HTML login page that masquerades as our route's no-op. With
      // 'manual', an interception reports itself as a 3xx in the handoff log.
      redirect: 'manual',
    });
    if (!res.ok) {
      console.error(`Resume chain for ${projectId} got HTTP ${res.status} — watchdog will recover if the build stalls`);
    }
    return res.status;
  } catch (err) {
    // The build's state is saved; the stale-build watchdog flips it to
    // failed (honest) rather than leaving it 'building' forever.
    console.error(`Resume chain for ${projectId} failed:`, err);
    return -1;
  }
}

/**
 * Execute the full pipeline for a project.
 * This runs asynchronously — the dashboard polls for updates.
 */
export async function executePipeline(projectId: string, idea: string, userId?: string, chainDepth = 0): Promise<void> {
  const store = getStore();
  const project = store.get(projectId);
  if (!project) return;

  // Attribute every AI call in this window to the project. Module-level
  // usage context resets per serverless invocation — the relay pattern means
  // each window is a fresh invocation, so this must run at every entry or
  // ai_usage_log rows land with NULL user/project (Oct 28: RUNE's ledger
  // discriminator only worked after a project_id-less query).
  setUsageContext('build', userId, projectId);

  const { orchestrator } = project;
  const tasks = orchestrator.getState().tasks;
  const pipelineStart = Date.now();

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

      // ── CANCEL SWITCH (Concept Gate changeset, Oct 22 lock) ──
      // Check at every task boundary — the only place a cancel can safely
      // bite (never mid-agent-call). The Oct 22 incident: a cancelled
      // build's relay completed underneath and overwrote the kill. This
      // check, plus the DB flip the cancel route makes, plus the resume
      // gate refusing non-active statuses, closes all three seams.
      if (isCancelledLocally(projectId) || await isProjectCancelled(projectId)) {
        orchestrator.log('devops', 'info',
          `Build cancelled by the founder — halting before "${task.title}". Partial work is saved; nothing further runs.`);
        if (userId && hasSupabase()) {
          await saveProject(userId, projectId, orchestrator.getState(), project.files, orchestrator.getProgress())
            .catch(() => undefined);
        }
        return;
      }

      // Vercel kills this function at 300s. Only start this task if it can
      // plausibly finish inside the remaining window — otherwise save and
      // hand off to a fresh invocation, which re-enters this loop and skips
      // completed tasks. Never start a task that would die mid-call.
      const taskEstimate = ROLE_TIME_ESTIMATE_MS[task.role] ?? DEFAULT_TASK_ESTIMATE_MS;
      // Never chain for a task that could not fit in a FRESH window
      // (taskEstimate >= HARD_STOP): every child would instantly re-chain
      // forever — Vercel's 508 loop protection cut exactly that cascade in
      // the 90s-stop relay test. Running it is the lesser risk.
      const canFitInFreshWindow = taskEstimate < PIPELINE_HARD_STOP_MS;
      if (canFitInFreshWindow && Date.now() - pipelineStart + taskEstimate > PIPELINE_HARD_STOP_MS) {
        if (chainDepth >= MAX_CHAIN_DEPTH) {
          orchestrator.log('devops', 'error',
            `Relay chain depth ${chainDepth} reached — stopping handoffs. Watchdog will mark the build failed if it stalls.`);
          return;
        }
        orchestrator.log('devops', 'info',
          `Saving and handing off to a fresh build window before "${task.title}" — this keeps the build alive past the 5-minute limit`);
        if (userId && hasSupabase()) {
          await saveProject(userId, projectId, orchestrator.getState(), project.files, orchestrator.getProgress())
            .catch(() => undefined);
        }
        // Release the in-process run stash BEFORE the handoff. Vercel reuses
        // warm instances, so the child invocation can land on THIS instance
        // while we are still alive awaiting its response — and
        // rehydrateProjectForResume no-ops as a "duplicate link" whenever it
        // sees a stashed run. Clearing it here guarantees the child
        // rehydrates from the state we just saved and continues the relay.
        project.run = undefined;
        const handoffStatus = await chainToFreshWindow(projectId, chainDepth);
        // The handoff result decides whether this build lives. Log it into
        // the project log (Supabase) — console output is invisible in
        // production, and a stranded build must explain itself.
        if (handoffStatus === 202) {
          orchestrator.log('devops', 'info',
            `Handoff acknowledged (HTTP 202) — a fresh build window has taken over.`);
        } else if (handoffStatus === 200) {
          orchestrator.log('devops', 'error',
            `Handoff returned HTTP 200 (no-op): the fresh window saw this build as already running or not resumable. Watchdog will mark it failed if it stalls.`);
        } else if (handoffStatus === 401) {
          orchestrator.log('devops', 'error',
            `Handoff rejected (HTTP 401): CRON_SECRET is missing or mismatched in the production environment. Set it in Vercel (Production scope) and rebuild.`);
        } else if (handoffStatus === -1) {
          orchestrator.log('devops', 'error',
            `Handoff request failed (network error reaching the resume endpoint). Watchdog will mark this build failed if it stalls.`);
        } else {
          orchestrator.log('devops', 'error',
            `Handoff returned HTTP ${handoffStatus}. Watchdog will mark this build failed if it stalls.`);
        }
        if (userId && hasSupabase()) {
          await saveProject(userId, projectId, orchestrator.getState(), project.files, orchestrator.getProgress())
            .catch(() => undefined);
        }
        return;
      }

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
                () => { setUsageContext('build', userId, projectId); return callAI(PM_AGENT_SYSTEM_PROMPT, pmPrompt); },
                (level, msg) => orchestrator.log('pm', level, msg)
              );
              result = parsePMResponse(raw, idea);
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
            { architecture: state.architecture!, specs: state.specs!, projectName: state.name },
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
          // Marketing kit is a Pro/Enterprise perk — look up the owner's tier
          let includeMarketing = false;
          if (userId && hasSupabase()) {
            try {
              const { createClient } = await import('@supabase/supabase-js');
              const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
              );
              const { data: profile } = await supabase
                .from('profiles')
                .select('tier, role')
                .eq('id', userId)
                .single();
              const tier = profile?.tier || 'free';
              includeMarketing = ['pro', 'enterprise'].includes(tier) || profile?.role === 'admin';
              if (includeMarketing) {
                orchestrator.log('docs', 'info', 'Generating launch marketing kit (Pro perk)');
              }
            } catch (err) {
              orchestrator.log('docs', 'warn', `Tier lookup failed, skipping marketing kit: ${err instanceof Error ? err.message : 'unknown'}`);
            }
          }
          const docs = await runDocsAgent(orchestrator.getState(), (level, msg) =>
            orchestrator.log('docs', level, msg)
          , { includeMarketing });
          const docFiles = [
            { path: 'README.md', content: docs.readme, agent: 'docs' as const, status: 'generated' as const },
            { path: 'INVESTOR_PITCH.md', content: docs.investorPitch, agent: 'docs' as const, status: 'generated' as const },
            { path: 'REALITY_CHECK.md', content: docs.realityCheck, agent: 'docs' as const, status: 'generated' as const },
            { path: 'LAUNCH_GUIDE.md', content: docs.launchGuide, agent: 'docs' as const, status: 'generated' as const },
            ...(docs.marketingKit
              ? [{ path: 'MARKETING_KIT.md', content: docs.marketingKit, agent: 'docs' as const, status: 'generated' as const }]
              : []),
          ].filter(f => f.content.length > 0);
          project.files.push(...docFiles);
          output = { files: docFiles };
          break;
        }

        // ─── Healing Agent ───
        case 'healing': {
          const healInput = task.input as { failedTaskId?: string; error?: string; originalTask?: { title?: string; role?: string } } | null;
          const failedTitle = healInput?.originalTask?.title || 'unknown task';
          const failedRole = healInput?.originalTask?.role || 'unknown';
          const failError = healInput?.error || 'unknown error';

          orchestrator.log('healing', 'info', `Analyzing failure in "${failedTitle}": ${failError}`);

          const HEALING_PROMPT = `You are the healing agent for an AI app-building pipeline. Another agent's task failed. Diagnose the root cause and produce a concrete repair strategy.

Failed task: "${failedTitle}" (agent role: ${failedRole})
Error: ${failError}

Classify the failure into exactly one category and respond with ONLY valid JSON:
{"category":"api_timeout|ai_parse_error|rate_limit|missing_dependency|bad_input|transient_network|unknown","diagnosis":"one sentence: what actually went wrong","repairStrategy":"one sentence: what the retry should do differently","retriable":true|false}

Rules: rate limits and timeouts ARE retriable (retry with backoff). AI parse errors ARE retriable (retry asks the model for stricter JSON). Missing dependencies and bad config are NOT retriable by the same agent.`;

          let diagnosis = `Failure in "${failedTitle}" was logged; retrying with fresh attempt.`;
          let retriable = true;

          if (hasAIKey()) {
            try {
              const raw = await callAI(HEALING_PROMPT, `Diagnose this pipeline failure. Failed task: ${failedTitle}. Role: ${failedRole}. Error: ${failError}`);
              const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
              const parsed = JSON.parse(cleaned);
              diagnosis = String(parsed.diagnosis || diagnosis);
              retriable = parsed.retriable !== false;
              const strategy = String(parsed.repairStrategy || '');
              const category = String(parsed.category || 'unknown');
              orchestrator.log('healing', 'info', `Diagnosis (${category}): ${diagnosis}`);
              if (strategy) orchestrator.log('healing', 'info', `Repair strategy: ${strategy}`);
              diagnosis = `${diagnosis}${strategy ? ` Repair: ${strategy}` : ''}`;
            } catch (err) {
              orchestrator.log('healing', 'warn', `Healing AI call failed, using generic retry: ${err instanceof Error ? err.message : 'unknown'}`);
            }
          } else {
            await delay(800);
          }

          if (!retriable) {
            orchestrator.log('healing', 'warn', `Failure in "${failedTitle}" judged non-retriable — leaving for user attention`);
          }

          output = { healed: retriable, diagnosis };
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

    // Persist after every task — fire-and-forget. Without this, the only
    // writes were create-time and final-state, so a serverless freeze
    // mid-build left project_tasks frozen at 'pending' forever even though
    // they completed (the "tasks never flip to done" quirk), and the
    // dashboard saw a dead build.
    if (userId && hasSupabase()) {
      // Awaited, not fire-and-forget: saveProject replaces project_logs
      // (delete + full insert), and two overlapping saves interleave as
      // delete+delete → insert+insert — every log line exactly 2x in the
      // table (observed on chained relay builds, where the final-on-chain
      // save overlapped the previous task's still-running incremental save).
      // The loop is AI-latency-bound; the extra ~200ms per task is nothing.
      await saveProject(userId, projectId, orchestrator.getState(), project.files, orchestrator.getProgress())
        .catch((err) => console.error('Incremental project save failed:', err));
    }
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

  // ── CANCEL SWITCH: never save a "completed" over a founder's cancel ──
  if (await isProjectCancelled(projectId)) {
    orchestrator.log('devops', 'info',
      'Build was cancelled while the final phase ran — keeping the cancelled status, not overwriting it.');
    return;
  }

  // Persist final state to Supabase
  if (userId && hasSupabase()) {
    try {
      await saveProject(userId, projectId, finalState, project.files, orchestrator.getProgress());
    } catch (err) {
      console.error(`Failed to save final project state to Supabase:`, err);
    }
  }

  // Build memory: extract lessons from this build (fallbacks, retries,
  // structure) so the next build starts smarter. Fire-and-forget — the
  // build is done; memory is a bonus, never a failure.
  try {
    const warnLogs = (finalState.logs || [])
      .filter((l) => l.level === 'warn' || l.level === 'error')
      .map((l) => `${l.agent}: ${l.message}`)
      .slice(-10);
    void reflectOnBuild(
      projectId,
      finalState.specs?.summary || '',
      project.files.map((f) => f.path),
      warnLogs,
      (level, msg) => orchestrator.log('docs', level, msg)
    ).catch(() => undefined);
  } catch {
    // non-fatal
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

  launchPipelineRun(projectId, idea, userId);

  return projectId;
}

/**
 * Start (or continue) the pipeline asynchronously and stash the promise on
 * the store entry so API routes can hand it to Vercel's waitUntil — without
 * that, the serverless function could be frozen mid-build and the project
 * sat in 'building' forever.
 *
 * Used by createProject for fresh builds and by the /resume route for relay
 * handoffs, so both get identical crash handling.
 */
export function launchPipelineRun(projectId: string, idea: string, userId: string | undefined, chainDepth = 0): Promise<void> {
  const run = executePipeline(projectId, idea, userId, chainDepth).catch((err) => {
    console.error(`Pipeline failed for ${projectId}:`, err);
    // Persist the crash — otherwise a hard failure leaves the project
    // stuck in 'building' with no explanation (the stuck-build bug).
    markBuildFailed(
      projectId,
      `Build crashed: ${err instanceof Error ? err.message : 'unknown error'}. Start a new build to retry.`
    ).catch(() => undefined);
  });
  getStore().get(projectId)!.run = run;
  return run;
}

/**
 * Rebuild a project's live store entry from Supabase so the pipeline can be
 * resumed in a fresh serverless invocation (relay runner). Returns what the
 * resume route needs to relaunch, or null when there is nothing safe to
 * resume — project not found, or a run already live in this process (a
 * duplicate chain link; the route should acknowledge and no-op).
 */
export async function rehydrateProjectForResume(projectId: string): Promise<{ idea: string; userId?: string } | null> {
  const store = getStore();
  if (store.get(projectId)?.run) {
    console.warn(`[resume] ${projectId}: live run stash present in this process — duplicate chain link, no-op`);
    return null;
  }

  // Load persisted state, with one retry. The child usually cold-starts on a
  // fresh instance, and a transient pooler/network flake here was previously
  // swallowed by `.catch(() => null)` — stranding the relay as a 200 no-op
  // with zero evidence (verification build 4). Every null path logs its cause.
  let persisted: Awaited<ReturnType<typeof loadProjectFromSupabase>> = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      persisted = await loadProjectFromSupabase(projectId);
      break;
    } catch (err) {
      console.error(`[resume] ${projectId}: state load threw (attempt ${attempt}/2):`, err);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  if (!persisted) {
    console.warn(`[resume] ${projectId}: no persisted state found — nothing to resume`);
    return null;
  }
  const { state, files, userId } = persisted;

  // Only builds that were interrupted mid-run should be resumed.
  if (state.status !== 'building' && state.status !== 'planning') {
    console.warn(`[resume] ${projectId}: status '${state.status}' is not resumable — no-op`);
    return null;
  }

  const orchestrator = new AppForgeOrchestrator(projectId, state.idea);
  orchestrator.adoptState(state);
  store.set(projectId, {
    orchestrator,
    state: orchestrator.getState(),
    files: files || [],
    userId,
  });
  return { idea: state.idea, userId };
}

/**
 * Get the in-flight pipeline promise for a project (if this function
 * instance is the one running it) so routes can keep the serverless
 * invocation alive with waitUntil until the build settles.
 */
export function getPipelineRun(projectId: string): Promise<void> | null {
  return getStore().get(projectId)?.run ?? null;
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
    userId: project.userId || null,
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
