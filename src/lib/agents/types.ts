/**
 * AppForge Agent Types
 * 
 * Core type definitions for the multi-agent orchestration system.
 * Every agent in the system adheres to these contracts.
 */

export type AgentRole =
  | 'pm'           // Project Manager: specs, stories, planning
  | 'architect'    // System architecture, tech stack, data models
  | 'frontend'     // UI components, pages, layouts
  | 'backend'      // API, server logic, integrations
  | 'database'     // Schema design, migrations, data layer
  | 'testing'      // Test generation and execution
  | 'devops'       // CI/CD, deployment, hosting
  | 'compliance'   // Legal, security, accessibility, best practices
  | 'docs'         // Documentation generation
  | 'healing';     // Self-healing: detect failures, apply fixes

/** Shared array of all agent roles — used by orchestrator for initialization and activity tracking. */
export const AGENT_ROLES: AgentRole[] = [
  'pm', 'architect', 'frontend', 'backend', 'database',
  'testing', 'devops', 'compliance', 'docs', 'healing',
];

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'retrying';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * A single unit of work assigned to an agent.
 */
export interface AgentTask {
  id: string;
  role: AgentRole;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];      // Task IDs that must complete first
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  assignedAgent: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

/**
 * Shared project state — all agents read from and write to this.
 * This is the "shared memory" pattern from production multi-agent systems.
 */
export interface ProjectState {
  id: string;
  name: string;
  idea: string;                    // The original user prompt
  status: 'planning' | 'building' | 'testing' | 'deploying' | 'done' | 'failed';
  currentPhase: number;
  tasks: AgentTask[];
  specs: ProjectSpecs | null;
  architecture: ArchitectureDoc | null;
  generatedFiles: GeneratedFile[];
  testResults: TestResult[] | null;
  deploymentUrl: string | null;
  logs: LogEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSpecs {
  summary: string;
  targetAudience: string;
  features: FeatureSpec[];
  userStories: UserStory[];
  techStack: TechStackRecommendation;
  compliance: string[];
  monetization: string | null;
  marketplace: 'web' | 'ios' | 'shopify' | 'google-play' | 'multi';
  requiredApis: RequiredApi[];
}

export interface RequiredApi {
  /** Provider name, e.g. "Stripe" */
  provider: string;
  /** Why this app needs it, tied to a feature, e.g. "Subscription billing" */
  reason: string;
  /** Env var names the generated app expects, e.g. ["STRIPE_SECRET_KEY"] */
  envVars: string[];
  /** Where the user signs up / gets the key */
  signupUrl: string;
  /** Free tier availability note for cost-anxious users */
  costNote: string;
  /** Always-on (Supabase) vs feature-dependent (Stripe only if payments) */
  required: boolean;
}

export interface FeatureSpec {
  name: string;
  description: string;
  priority: TaskPriority;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface UserStory {
  id: string;
  role: string;
  goal: string;
  benefit: string;
  acceptanceCriteria: string[];
}

export interface TechStackRecommendation {
  frontend: string;
  backend: string;
  database: string;
  hosting: string;
  auth: string;
  payments: string | null;
  testing: string;
  rationale: string;
}

export interface ArchitectureDoc {
  overview: string;
  dataModels: DataModel[];
  apiEndpoints: ApiEndpoint[];
  pageRoutes: PageRoute[];
  componentTree: ComponentNode[];
  securityModel: string;
  scalabilityNotes: string;
}

export interface DataModel {
  name: string;
  fields: { name: string; type: string; required: boolean; references?: string }[];
  relationships: string[];
}

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  authRequired: boolean;
}

export interface PageRoute {
  path: string;
  name: string;
  authRequired: boolean;
  role: 'public' | 'user' | 'admin';
}

export interface ComponentNode {
  name: string;
  type: 'page' | 'layout' | 'component';
  children: ComponentNode[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  agent: AgentRole;
  status: 'generated' | 'tested' | 'deployed' | 'failed';
}

export interface TestResult {
  testName: string;
  type: 'unit' | 'integration' | 'e2e';
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error: string | null;
}

export interface LogEntry {
  timestamp: number;
  agent: AgentRole;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

/**
 * Contract that every agent must fulfill.
 * This ensures type-safe handoffs between agents.
 */
export interface AgentContract {
  role: AgentRole;
  name: string;
  description: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  maxIterations: number;
  tools: string[];
}

/**
 * The orchestrator's configuration for managing the agent fleet.
 */
export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  defaultMaxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTime: number;  // ms
  taskTimeout: number;              // ms
  enableSelfHealing: boolean;
  humanReviewRequired: boolean;
}
