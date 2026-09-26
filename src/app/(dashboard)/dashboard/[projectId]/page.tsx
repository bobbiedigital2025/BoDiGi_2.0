'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Brain, Code2, Database, Shield, Rocket, FileText, Wrench,
  CheckCircle2, XCircle, Loader2, Clock, AlertCircle, Download, Zap, ZapOff,
  FlaskConical, Scale, Eye, List, BarChart3, Bot
} from 'lucide-react';
import { SetupAgent } from '@/components/setup-agent';
import { agentName } from '@/lib/agents/types';

interface AgentActivity {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

interface ProjectData {
  state: {
    id: string;
    name: string;
    idea: string;
    status: string;
    currentPhase: number;
    tasks: Array<{
      id: string;
      role: string;
      title: string;
      status: string;
      priority: string;
      error: string | null;
      startedAt: number | null;
      completedAt: number | null;
    }>;
    logs: Array<{
      timestamp: number;
      agent: string;
      level: string;
      message: string;
    }>;
    specs: {
      summary: string;
      targetAudience: string;
      features: Array<{ name: string; description: string; priority: string; complexity: string }>;
      userStories: Array<{ id: string; role: string; goal: string; benefit: string; acceptanceCriteria: string[] }>;
      techStack: Record<string, string>;
      compliance: string[];
      monetization: string;
      marketplace: string;
      requiredApis?: Array<{ provider: string; reason: string; envVars: string[]; signupUrl: string; costNote: string; required: boolean }>;
    } | null;
    deploymentUrl: string | null;
  };
  progress: number;
  agentActivity: Record<string, AgentActivity>;
  files: Array<{
    path: string;
    content: string;
    agent: string;
    status: string;
  }>;
  ai: {
    connected: boolean;
    model: string;
  };
  testResults: Array<{
    testName: string;
    type: string;
    status: string;
    duration: number;
    error: string | null;
  }> | null;
  complianceChecks: Array<{
    name: string;
    status: string;
    details: string;
  }> | null;
}

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pm: Brain,
  architect: Brain,
  frontend: Code2,
  backend: Code2,
  database: Database,
  testing: Shield,
  devops: Rocket,
  compliance: Shield,
  docs: FileText,
  healing: Wrench,
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  in_progress: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  retrying: AlertCircle,
  blocked: AlertCircle,
};

const PHASES = [
  { name: 'Planning', agent: 'PM Agent', desc: 'Generating specs and user stories' },
  { name: 'Architecture', agent: 'Architect Agent', desc: 'Designing system architecture' },
  { name: 'Building', agent: 'Build Agents', desc: 'Frontend + Backend + Database in parallel' },
  { name: 'Testing', agent: 'Testing Agent', desc: 'Running automated tests' },
  { name: 'Compliance', agent: 'Compliance Agent', desc: 'Auditing security and legal' },
  { name: 'Deploying', agent: 'DevOps Agent', desc: 'Deploying to production' },
  { name: 'Documentation', agent: 'Docs Agent', desc: 'Writing documentation' },
];

export default function DashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'pipeline' | 'preview'>('pipeline');
  const [setupAgentOpen, setSetupAgentOpen] = useState(false);

  // Detect if project has build issues (failed tasks). Missing deploymentUrl is NOT
  // an issue — apps are hosted previews inside BoDiGi 2.0, not external deployments.
  const hasDeploymentIssues = data?.state?.tasks?.some(t => t.status === 'failed');
  const missingKeys = hasDeploymentIssues ? ['OPENROUTER_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] : [];

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/generate/${projectId}`);
        if (!res.ok) throw new Error('Project not found');
        const json = await res.json();
        if (active) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load project');
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Project not found</h2>
            <p className="text-white/50 mb-6">{error}</p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
      </div>
    );
  }

  const { state, progress, agentActivity } = data;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">
            AF
          </div>
          <div>
            <h1 className="font-semibold text-sm">{state.name}</h1>
            <p className="text-xs text-white/40">Project ID: {state.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {data.ai && (
            <Badge variant={data.ai.connected ? 'success' : 'warning'} className="text-xs">
              {data.ai.connected ? <Zap className="w-3 h-3 mr-1" /> : <ZapOff className="w-3 h-3 mr-1" />}
              {data.ai.connected ? `AI: ${data.ai.model}` : 'AI: Demo mode'}
            </Badge>
          )}
          <a href={`/analytics/${projectId}`}>
            <Button variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </Button>
          </a>
          <Badge variant={state.status === 'done' ? 'success' : state.status === 'failed' ? 'error' : 'info'}>
            {state.status}
          </Badge>
          <span className="text-sm text-white/60">{progress}% complete</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* View toggle */}
        <div className="flex gap-1 mb-6 border-b border-white/10">
          <button
            onClick={() => setView('pipeline')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              view === 'pipeline' ? 'text-white border-fuchsia-500' : 'text-white/40 border-transparent hover:text-white/70'
            }`}
          >
            <List className="w-4 h-4" />
            Pipeline
          </button>
          <button
            onClick={() => setView('preview')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              view === 'preview' ? 'text-white border-fuchsia-500' : 'text-white/40 border-transparent hover:text-white/70'
            }`}
          >
            <Eye className="w-4 h-4" />
            Live Preview
            {state.status !== 'done' && (
              <span className="inline-flex items-center gap-1 ml-1 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              </span>
            )}
          </button>
        </div>

        {/* Live Preview view */}
        {view === 'preview' && (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black" style={{ height: 'calc(100vh - 200px)' }}>
            <iframe
              src={`/preview/${projectId}`}
              className="w-full h-full"
              title="Live Preview"
              style={{ border: 'none' }}
            />
          </div>
        )}

        {/* Pipeline view */}
        {view === 'pipeline' && (
          <>
        {/* Progress bar */}
        <div className="mb-8">
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-white/40">
            {PHASES.map((phase, i) => (
              <span key={i} className={state.currentPhase >= i ? 'text-fuchsia-400' : ''}>
                {phase.name}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Pipeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Pipeline phases */}
            <Card>
              <CardHeader>
                <CardTitle>Agent Pipeline</CardTitle>
                <CardDescription>Real-time view of the agent team building your app</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {PHASES.map((phase, i) => {
                  const phaseTasks = state.tasks.filter((t) => {
                    const phaseRoles: Record<number, string[]> = {
                      0: ['pm'],
                      1: ['architect'],
                      2: ['frontend', 'backend', 'database'],
                      3: ['testing'],
                      4: ['compliance'],
                      5: ['devops'],
                      6: ['docs'],
                    };
                    return phaseRoles[i]?.includes(t.role);
                  });
                  const isComplete = phaseTasks.length > 0 && phaseTasks.every((t) => t.status === 'completed');
                  const isInProgress = phaseTasks.some((t) => t.status === 'in_progress' || t.status === 'retrying');
                  const isPending = phaseTasks.length > 0 && phaseTasks.every((t) => t.status === 'pending');
                  const hasFailed = phaseTasks.some((t) => t.status === 'failed');

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
                        isComplete ? 'border-emerald-500/20 bg-emerald-500/5' :
                        isInProgress ? 'border-fuchsia-500/30 bg-fuchsia-500/5' :
                        hasFailed ? 'border-red-500/20 bg-red-500/5' :
                        'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isComplete ? 'bg-emerald-500/20' :
                        isInProgress ? 'bg-fuchsia-500/20' :
                        hasFailed ? 'bg-red-500/20' :
                        'bg-white/5'
                      }`}>
                        {isComplete ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                         isInProgress ? <Loader2 className="w-5 h-5 text-fuchsia-400 animate-spin" /> :
                         hasFailed ? <XCircle className="w-5 h-5 text-red-400" /> :
                         <Clock className="w-5 h-5 text-white/30" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-sm">{phase.name}</h3>
                          <span className="text-xs text-white/40">{phase.agent}</span>
                        </div>
                        <p className="text-xs text-white/50 mt-1">{phase.desc}</p>
                        {phaseTasks.length > 0 && (
                          <div className="flex gap-1.5 mt-2">
                            {phaseTasks.map((t) => {
                              const StatusIcon = STATUS_ICONS[t.status] || Clock;
                              return (
                                <Badge key={t.id} variant={
                                  t.status === 'completed' ? 'success' :
                                  t.status === 'failed' ? 'error' :
                                  t.status === 'in_progress' ? 'info' : 'default'
                                } className="text-xs">
                                  <StatusIcon className={`w-3 h-3 mr-1 ${t.status === 'in_progress' ? 'animate-spin' : ''}`} />
                                  {agentName(t.role)}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Specs (if available) */}
            {state.specs && (
              <Card>
                <CardHeader>
                  <CardTitle>Project Specifications</CardTitle>
                  <CardDescription>Generated by the PM Agent</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-white/80 mb-1">Summary</h4>
                    <p className="text-sm text-white/60">{state.specs.summary}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white/80 mb-1">Target Audience</h4>
                    <p className="text-sm text-white/60">{state.specs.targetAudience}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white/80 mb-2">Features</h4>
                    <div className="space-y-2">
                      {state.specs.features.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <Badge variant={
                            f.priority === 'critical' ? 'error' :
                            f.priority === 'high' ? 'warning' : 'default'
                          } className="text-xs">
                            {f.priority}
                          </Badge>
                          <span className="text-white/70">{f.name}</span>
                          <span className="text-white/40 text-xs">— {f.complexity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white/80 mb-2">Tech Stack</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(state.specs.techStack).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-white/40 text-xs capitalize">{key}:</span>
                          <span className="text-white/70 text-xs">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {state.specs.compliance.map((c, i) => (
                      <Badge key={i} variant="info" className="text-xs">{c}</Badge>
                    ))}
                  </div>
                  <div>
                    <span className="text-white/40 text-xs">Monetization: </span>
                    <span className="text-white/70 text-sm">{state.specs.monetization}</span>
                  </div>
                  {Array.isArray(state.specs.requiredApis) && state.specs.requiredApis.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-white/80 mb-2">Services this app needs</h4>
                      <div className="space-y-2">
                        {state.specs.requiredApis.map((api, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white/90 flex items-center gap-2">
                                {api.provider}
                                {api.required && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25">required</span>}
                              </div>
                              <div className="text-xs text-white/50 mt-0.5">{api.reason}</div>
                              <div className="text-[11px] text-white/35 mt-0.5 font-mono truncate">{api.envVars.join(', ')}</div>
                              {api.costNote && <div className="text-[11px] text-emerald-400/70 mt-0.5">{api.costNote}</div>}
                            </div>
                            {api.signupUrl && (
                              <a href={api.signupUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-fuchsia-400 hover:underline mt-0.5">
                                Get keys →
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-white/35 mt-2">The Setup Agent (bottom-left) walks you through getting each key, step by step.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Test results */}
            {data.testResults && data.testResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-cyan-400" />
                    Test Results
                  </CardTitle>
                  <CardDescription>
                    {data.testResults.filter(t => t.status === 'passed' || t.status === 'pass').length} passed,
                    {' '}{data.testResults.filter(t => t.status === 'failed' || t.status === 'fail').length} failed,
                    {' '}{data.testResults.filter(t => t.status === 'skipped' || t.status === 'skip').length} skipped
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.testResults.map((test, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-white/5 last:border-0">
                      {test.status === 'passed' || test.status === 'pass' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : test.status === 'failed' || test.status === 'fail' ? (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-white/30 flex-shrink-0" />
                      )}
                      <span className="text-white/70">{test.testName}</span>
                      <Badge variant="default" className="text-xs ml-auto">{test.type}</Badge>
                      <span className="text-white/40 text-xs tabular-nums">{test.duration}ms</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Compliance checks */}
            {data.complianceChecks && data.complianceChecks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-400" />
                    Compliance Audit
                  </CardTitle>
                  <CardDescription>
                    {data.complianceChecks.filter(c => c.status === 'passed' || c.status === 'pass').length} passed,
                    {' '}{data.complianceChecks.filter(c => c.status === 'failed' || c.status === 'fail').length} failed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.complianceChecks.map((check, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm py-1.5 border-b border-white/5 last:border-0">
                      {check.status === 'passed' || check.status === 'pass' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white/70 font-medium">{check.name}</span>
                          <Badge variant={check.status === 'passed' || check.status === 'pass' ? 'success' : 'error'} className="text-xs">
                            {check.status}
                          </Badge>
                        </div>
                        <p className="text-white/40 text-xs mt-0.5">{check.details}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Generated files */}
            {data.files && data.files.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Generated Files</CardTitle>
                    <CardDescription>{data.files.length} files generated by the agent team</CardDescription>
                  </div>
                  <a href={`/api/generate/${projectId}/download`} download>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Download ZIP
                    </Button>
                  </a>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.files.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <FileText className="w-4 h-4 text-white/40 flex-shrink-0" />
                      <span className="text-white/70 font-mono text-xs">{file.path}</span>
                      <Badge variant="info" className="text-xs ml-auto">{file.agent}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Hosted Preview — honest status, no fake deployment URL */}
            {state.status === 'done' && (
              <Card>
                <CardHeader>
                  <CardTitle>Hosted Preview</CardTitle>
                  <CardDescription>Your app lives here inside BoDiGi 2.0 — nothing is deployed externally yet</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-white/60">
                    View your app in the <span className="text-fuchsia-400 font-medium">Live Preview</span> tab above.
                    To put it on the real internet, export your code and deploy it — the Setup Agent walks you through it.
                  </p>
                  <a
                    href="/pricing"
                    className="inline-block text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium hover:opacity-90 transition"
                  >
                    Upgrade to export & deploy
                  </a>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Agent activity + logs */}
          <div className="space-y-6">
            {/* Agent activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(agentActivity).map(([role, activity]) => {
                  const Icon = AGENT_ICONS[role] || Brain;
                  return (
                    <div key={role} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-white/60" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">{agentName(role)}</span>
                          <span className="text-xs text-white/40">
                            {activity.completed}/{activity.total}
                          </span>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {activity.inProgress > 0 && <Badge variant="info" className="text-xs">active</Badge>}
                          {activity.failed > 0 && <Badge variant="error" className="text-xs">{activity.failed} failed</Badge>}
                          {activity.completed > 0 && activity.failed === 0 && activity.inProgress === 0 && (
                            <Badge variant="success" className="text-xs">done</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Live logs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
                  {state.logs.length === 0 ? (
                    <p className="text-white/30">Waiting for agent activity...</p>
                  ) : (
                    state.logs.slice(-30).reverse().map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-white/30">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={
                          log.level === 'error' ? 'text-red-400' :
                          log.level === 'warn' ? 'text-amber-400' :
                          'text-cyan-400'
                        }>
                          [{log.agent}]
                        </span>
                        <span className="text-white/60">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Setup Agent floating button */}
      <button
        onClick={() => setSetupAgentOpen(true)}
        className="fixed bottom-4 left-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30 flex items-center justify-center hover:scale-110 transition-transform"
        title="Setup Agent — Get help with API keys, deployment, and customization"
      >
        <Bot className="w-6 h-6 text-white" />
      </button>

      {/* Setup Agent chat */}
      <SetupAgent
        isOpen={setupAgentOpen}
        onClose={() => setSetupAgentOpen(false)}
        missingKeys={missingKeys}
        projectId={projectId}
      />
    </div>
  );
}
