/**
 * AppForge Orchestrator
 * 
 * The central coordinator that manages the agent fleet.
 * Responsibilities:
 * 1. Task decomposition — break the user's idea into agent-assignable tasks
 * 2. Agent routing — assign tasks to the right specialist agent
 * 3. Dependency resolution — execute tasks in the right order
 * 4. Progress tracking — maintain shared project state
 * 5. Error handling — circuit breakers, retries, escalation
 * 6. Self-healing — detect failures and trigger healing agent
 * 
 * Pattern: Supervisor/Worker (Pattern 2 from production multi-agent guides)
 * The orchestrator is the supervisor; specialist agents are workers.
 */

import type {
  AgentTask,
  AgentRole,
  ProjectState,
  OrchestratorConfig,
  LogEntry,
} from './types';
import { AGENT_ROLES } from './types';

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentAgents: 5,
  defaultMaxRetries: 3,
  circuitBreakerThreshold: 3,
  circuitBreakerResetTime: 60000,
  taskTimeout: 120000,
  enableSelfHealing: true,
  humanReviewRequired: false,
};

/**
 * Circuit breaker state per agent role.
 * If an agent fails `threshold` times within `resetTime`, it trips
 * and no more tasks are assigned to it until it resets.
 */
interface CircuitBreakerState {
  failures: number;
  tripped: boolean;
  lastFailureAt: number | null;
}

export class AppForgeOrchestrator {
  private config: OrchestratorConfig;
  private state: ProjectState;
  private circuitBreakers: Map<AgentRole, CircuitBreakerState> = new Map();
  private taskQueue: AgentTask[] = [];
  private activeTasks: Map<string, AgentTask> = new Map();
  private completedTasks: Map<string, AgentTask> = new Map();
  private listeners: ((state: ProjectState) => void)[] = [];

  constructor(projectId: string, idea: string, config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      id: projectId,
      name: idea.slice(0, 80),
      idea,
      status: 'planning',
      currentPhase: 0,
      tasks: [],
      specs: null,
      architecture: null,
      generatedFiles: [],
      testResults: null,
      deploymentUrl: null,
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Initialize circuit breakers for all agent roles
    for (const role of AGENT_ROLES) {
      this.circuitBreakers.set(role, {
        failures: 0,
        tripped: false,
        lastFailureAt: null,
      });
    }
  }

  /**
   * Decompose the user's idea into a phased task plan.
   * Phase 1: PM generates specs and user stories
   * Phase 2: Architect designs the system
   * Phase 3: Frontend + Backend + Database agents build in parallel
   * Phase 4: Testing agent validates
   * Phase 5: Compliance agent audits
   * Phase 6: DevOps agent deploys
   * Phase 7: Docs agent writes documentation
   */
  decomposeIdea(idea: string): AgentTask[] {
    const tasks: AgentTask[] = [];
    const now = Date.now();

    // Phase 1: Planning
    tasks.push({
      id: `task-${now}-1`,
      role: 'pm',
      title: 'Generate project specifications',
      description: `Analyze the idea "${idea}" and generate: project summary, target audience, feature list with priorities, user stories with acceptance criteria, tech stack recommendation, compliance requirements, and monetization strategy.`,
      status: 'pending',
      priority: 'critical',
      dependencies: [],
      input: { idea },
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    });

    // Phase 2: Architecture (depends on PM)
    tasks.push({
      id: `task-${now}-2`,
      role: 'architect',
      title: 'Design system architecture',
      description: 'Based on PM specs, design: data models, API endpoints, page routes, component tree, security model, and scalability notes.',
      status: 'pending',
      priority: 'critical',
      dependencies: [`task-${now}-1`],
      input: { idea },
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    });

    // Phase 3: Build (depends on Architecture, runs in parallel)
    const buildRoles: AgentRole[] = ['database', 'backend', 'frontend'];
    buildRoles.forEach((role, i) => {
      const titles: Record<string, string> = {
        database: 'Design and generate database schema and migrations',
        backend: 'Generate API routes, server actions, and business logic',
        frontend: 'Generate UI components, pages, layouts, and client-facing interface',
      };
      tasks.push({
        id: `task-${now}-${3 + i}`,
        role,
        title: titles[role],
        description: `Based on architecture doc, generate all ${role} code following best practices.`,
        status: 'pending',
        priority: 'high',
        dependencies: [`task-${now}-2`],
        input: { idea },
        output: null,
        assignedAgent: null,
        retryCount: 0,
        maxRetries: this.config.defaultMaxRetries,
        createdAt: now,
        startedAt: null,
        completedAt: null,
        error: null,
      });
    });

    // Phase 4: Testing (depends on all build tasks)
    tasks.push({
      id: `task-${now}-6`,
      role: 'testing',
      title: 'Generate and run tests',
      description: 'Write unit tests, integration tests, and e2e tests (Playwright). Run all tests and report results.',
      status: 'pending',
      priority: 'high',
      dependencies: [`task-${now}-3`, `task-${now}-4`, `task-${now}-5`],
      input: {},
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    });

    // Phase 5: Compliance audit (depends on build + test)
    tasks.push({
      id: `task-${now}-7`,
      role: 'compliance',
      title: 'Audit for compliance, security, and best practices',
      description: 'Check: legal compliance (GDPR, CCPA, ADA), security (auth, data protection, OWASP), accessibility (WCAG), and coding best practices.',
      status: 'pending',
      priority: 'medium',
      dependencies: [`task-${now}-6`],
      input: {},
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    });

    // Phase 6: Deployment (depends on compliance)
    tasks.push({
      id: `task-${now}-8`,
      role: 'devops',
      title: 'Deploy to production',
      description: 'Set up CI/CD pipeline, configure environment, deploy to hosting (Vercel), and verify deployment.',
      status: 'pending',
      priority: 'high',
      dependencies: [`task-${now}-7`],
      input: {},
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    });

    // Phase 7: Documentation (depends on deployment)
    tasks.push({
      id: `task-${now}-9`,
      role: 'docs',
      title: 'Generate documentation',
      description: 'Write: README, API documentation, user guide, deployment guide, and architecture documentation.',
      status: 'pending',
      priority: 'medium',
      dependencies: [`task-${now}-8`],
      input: {},
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    });

    this.state.tasks = tasks;
    this.taskQueue = [...tasks];
    return tasks;
  }

  /**
   * Get the next executable task(s) — tasks whose dependencies are all met.
   * Respects circuit breaker state and concurrency limits.
   */
  getExecutableTasks(): AgentTask[] {
    const available: AgentTask[] = [];

    for (const task of this.taskQueue) {
      if (task.status !== 'pending') continue;

      // Check circuit breaker
      const cb = this.circuitBreakers.get(task.role);
      if (cb?.tripped) {
        // Check if it should reset
        if (cb.lastFailureAt && Date.now() - cb.lastFailureAt > this.config.circuitBreakerResetTime) {
          cb.tripped = false;
          cb.failures = 0;
          this.log(task.role, 'info', `Circuit breaker reset for ${task.role}`);
        } else {
          continue;
        }
      }

      // Check dependencies
      const depsMet = task.dependencies.every((depId) => {
        const dep = this.completedTasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (depsMet) {
        available.push(task);
      }

      // Respect concurrency limit
      if (available.length + this.activeTasks.size >= this.config.maxConcurrentAgents) {
        break;
      }
    }

    return available;
  }

  /**
   * Mark a task as started and track it.
   */
  startTask(taskId: string, agentId: string): void {
    const task = this.taskQueue.find((t) => t.id === taskId);
    if (!task) return;

    task.status = 'in_progress';
    task.startedAt = Date.now();
    task.assignedAgent = agentId;
    this.activeTasks.set(taskId, task);
    this.log(task.role, 'info', `Started: ${task.title}`);
    this.updateState();
  }

  /**
   * Mark a task as completed and store its output.
   */
  completeTask(taskId: string, output: Record<string, unknown>): void {
    const task = this.taskQueue.find((t) => t.id === taskId);
    if (!task) return;

    task.status = 'completed';
    task.completedAt = Date.now();
    task.output = output;
    this.activeTasks.delete(taskId);
    this.completedTasks.set(taskId, task);

    // Update project state based on which agent completed
    this.applyTaskOutput(task);

    this.log(task.role, 'info', `Completed: ${task.title}`);
    this.updateState();
  }

  /**
   * Mark a task as failed and handle retry/circuit breaker logic.
   */
  failTask(taskId: string, error: string): void {
    const task = this.taskQueue.find((t) => t.id === taskId);
    if (!task) return;

    this.activeTasks.delete(taskId);
    const cb = this.circuitBreakers.get(task.role);

    task.retryCount++;
    task.error = error;

    if (task.retryCount < task.maxRetries) {
      task.status = 'retrying';
      this.log(task.role, 'warn', `Retry ${task.retryCount}/${task.maxRetries}: ${task.title} — ${error}`);
      // Re-queue for execution
      setTimeout(() => {
        task.status = 'pending';
        this.updateState();
      }, 2000 * task.retryCount); // exponential backoff
    } else {
      task.status = 'failed';
      if (cb) {
        cb.failures++;
        cb.lastFailureAt = Date.now();
        if (cb.failures >= this.config.circuitBreakerThreshold) {
          cb.tripped = true;
          this.log(task.role, 'error', `Circuit breaker TRIPPED for ${task.role} after ${cb.failures} failures`);
        }
      }

      // If self-healing is enabled, trigger the healing agent
      if (this.config.enableSelfHealing && task.role !== 'healing') {
        this.triggerHealing(task, error);
      } else {
        this.log(task.role, 'error', `Permanently failed: ${task.title} — ${error}`);
        this.state.status = 'failed';
      }
    }

    this.updateState();
  }

  /**
   * Trigger the healing agent to analyze and fix a failed task.
   */
  private triggerHealing(failedTask: AgentTask, error: string): void {
    const now = Date.now();
    const healingTask: AgentTask = {
      id: `task-${now}-heal`,
      role: 'healing',
      title: `Heal failed task: ${failedTask.title}`,
      description: `Analyze the failure "${error}" for task "${failedTask.title}" and generate a fix.`,
      status: 'pending',
      priority: 'critical',
      dependencies: [],
      input: { failedTaskId: failedTask.id, error, originalTask: failedTask },
      output: null,
      assignedAgent: null,
      retryCount: 0,
      maxRetries: 2,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
    };

    this.state.tasks.push(healingTask);
    this.taskQueue.push(healingTask);
    this.log('healing', 'info', `Healing agent triggered for: ${failedTask.title}`);
  }

  /**
   * Reset a failed task so the pipeline retries it. Called by the healing
   * agent after it has produced a repair diagnosis. The diagnosis is attached
   * to the task input so the retrying agent can see what went wrong.
   */
  requeueFailedTask(taskId: string, healingNote: string): boolean {
    const task = this.taskQueue.find((t) => t.id === taskId);
    if (!task || task.status !== 'failed') return false;

    task.status = 'pending';
    task.error = null;
    task.retryCount = 0;
    task.maxRetries = 2; // one more honest attempt cycle after healing
    task.input = { ...(task.input as Record<string, unknown>), healingNote };
    this.log(task.role, 'info', `Re-queued after healing: ${task.title}`);
    // If the build had been marked failed, bring it back to building
    if (this.state.status === 'failed') this.state.status = 'building';
    this.updateState();
    return true;
  }

  /**
   * Apply a completed task's output to the shared project state.
   */
  private applyTaskOutput(task: AgentTask): void {
    if (!task.output) return;

    switch (task.role) {
      case 'pm':
        // Pipeline passes { specs } — unwrap so state.specs IS the specs object
        this.state.specs = (task.output.specs ?? task.output) as unknown as ProjectState['specs'];
        this.state.status = 'building';
        this.state.currentPhase = 1;
        break;
      case 'architect':
        // Pipeline passes { architecture } — unwrap
        this.state.architecture = (task.output.architecture ?? task.output) as unknown as ProjectState['architecture'];
        this.state.currentPhase = 2;
        break;
      case 'frontend':
      case 'backend':
      case 'database':
        if (task.output.files) {
          this.state.generatedFiles.push(...(task.output.files as ProjectState['generatedFiles']));
        }
        this.state.currentPhase = 3;
        break;
      case 'testing':
        this.state.testResults = task.output.results as ProjectState['testResults'];
        this.state.currentPhase = 4;
        break;
      case 'devops':
        this.state.deploymentUrl = task.output.url as string;
        this.state.currentPhase = 5;
        break;
      case 'docs':
        this.state.currentPhase = 6;
        this.state.status = 'done';
        break;
      case 'healing': {
        // Healing completed — re-queue the originally failed task with the
        // diagnosis attached so its retry knows what went wrong. Skip if the
        // healing agent judged the failure non-retriable.
        const out = (task.output || {}) as Record<string, unknown>;
        const input = task.input as { failedTaskId?: string } | null;
        if (out.healed === false) {
          this.log('healing', 'warn', 'Not re-queuing — failure needs human attention');
          break;
        }
        const note = String(out.diagnosis || 'Previous failure was analyzed; retry with fresh attempt.');
        if (input?.failedTaskId) {
          this.requeueFailedTask(input.failedTaskId, note);
        }
        break;
      }
    }
  }

  /**
   * Get the current project state snapshot.
   */
  getState(): ProjectState {
    return { ...this.state };
  }

  /**
   * Subscribe to state updates.
   */
  subscribe(listener: (state: ProjectState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get progress percentage (0-100).
   */
  getProgress(): number {
    const total = this.state.tasks.length;
    if (total === 0) return 0;
    const completed = this.completedTasks.size;
    return Math.round((completed / total) * 100);
  }

  /**
   * Get a summary of agent activity for the dashboard.
   */
  getAgentActivity(): Record<AgentRole, { total: number; completed: number; failed: number; inProgress: number }> {
    const summary = {} as Record<AgentRole, { total: number; completed: number; failed: number; inProgress: number }>;

    for (const role of AGENT_ROLES) {
      const roleTasks = this.state.tasks.filter((t) => t.role === role);
      summary[role] = {
        total: roleTasks.length,
        completed: roleTasks.filter((t) => t.status === 'completed').length,
        failed: roleTasks.filter((t) => t.status === 'failed').length,
        inProgress: roleTasks.filter((t) => t.status === 'in_progress').length,
      };
    }

    return summary;
  }

  /** Add a log entry. Public so the pipeline executor can log AI fallback warnings. */
  log(agent: AgentRole, level: LogEntry['level'], message: string): void {
    this.state.logs.push({
      timestamp: Date.now(),
      agent,
      level,
      message,
    });
  }

  private updateState(): void {
    this.state.updatedAt = Date.now();
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }
}
