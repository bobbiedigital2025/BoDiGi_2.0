'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Brain, Code2, Database, Shield, Rocket, FileText, Wrench,
  CheckCircle2, XCircle, Loader2, Clock, AlertCircle,
  FlaskConical, Scale, BarChart3, TrendingUp, Layers, Zap, ZapOff,
  ArrowLeft, Users, DollarSign, Target, Package,
} from 'lucide-react';

interface AgentActivity {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

interface TaskData {
  id: string;
  role: string;
  title: string;
  status: string;
  priority: string;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  retryCount?: number;
}

interface ProjectData {
  state: {
    id: string;
    name: string;
    idea: string;
    status: string;
    currentPhase: number;
    tasks: TaskData[];
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
      userStories: Array<{ id: string; role: string; goal: string; benefit: string }>;
      techStack: Record<string, string>;
      compliance: string[];
      monetization: string | null;
      marketplace: string;
    } | null;
    architecture: {
      overview: string;
      dataModels: Array<{ name: string; fields: Array<{ name: string; type: string; required: boolean }> }>;
      apiEndpoints: Array<{ method: string; path: string; description: string; authRequired: boolean }>;
      pageRoutes: Array<{ path: string; name: string; authRequired: boolean }>;
      componentTree: Array<{ name: string; type: string }>;
      securityModel: string;
      scalabilityNotes: string;
    } | null;
    deploymentUrl: string | null;
    createdAt: number;
    updatedAt: number;
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
  letta?: {
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

const ROLE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  pm: { icon: Brain, label: 'PM Agent', color: 'text-violet-400' },
  architect: { icon: Layers, label: 'Architect', color: 'text-indigo-400' },
  database: { icon: Database, label: 'Database', color: 'text-cyan-400' },
  backend: { icon: Code2, label: 'Backend', color: 'text-emerald-400' },
  frontend: { icon: Code2, label: 'Frontend', color: 'text-fuchsia-400' },
  testing: { icon: FlaskConical, label: 'Testing', color: 'text-amber-400' },
  compliance: { icon: Scale, label: 'Compliance', color: 'text-orange-400' },
  devops: { icon: Rocket, label: 'DevOps', color: 'text-blue-400' },
  docs: { icon: FileText, label: 'Docs', color: 'text-slate-400' },
  healing: { icon: Wrench, label: 'Healing', color: 'text-red-400' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function AnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/generate/${projectId}`);
        if (!res.ok) throw new Error('Project not found');
        const json = await res.json();
        if (active) { setData(json); setError(null); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [projectId]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Project not found</h2>
            <p className="text-white/50 mb-6">{error}</p>
            <Button variant="outline" onClick={() => window.history.back()}>Go back</Button>
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
  const tasks = state.tasks;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const totalDuration = tasks.reduce((sum, t) => {
    if (t.startedAt && t.completedAt) return sum + (t.completedAt - t.startedAt);
    return sum;
  }, 0);
  const totalRetries = tasks.reduce((sum, t) => sum + (t.retryCount || 0), 0);

  // File stats
  const files = data.files || [];
  const totalLines = files.reduce((sum, f) => sum + (f.content?.split('\n').length || 0), 0);
  const filesByAgent: Record<string, number> = {};
  files.forEach(f => { filesByAgent[f.agent] = (filesByAgent[f.agent] || 0) + 1; });

  // Architecture stats
  const arch = state.architecture;
  const dataModels = arch?.dataModels?.length || 0;
  const apiEndpoints = arch?.apiEndpoints?.length || 0;
  const pageRoutes = arch?.pageRoutes?.length || 0;
  const totalModelFields = arch?.dataModels?.reduce((sum, m) => sum + (m.fields?.length || 0), 0) || 0;

  // Test stats
  const testResults = data.testResults || [];
  const testsPassed = testResults.filter(t => t.status === 'passed' || t.status === 'pass').length;
  const testsFailed = testResults.filter(t => t.status === 'failed' || t.status === 'fail').length;
  const testsSkipped = testResults.filter(t => t.status === 'skipped' || t.status === 'skip').length;
  const testPassRate = testResults.length > 0 ? Math.round((testsPassed / testResults.length) * 100) : 0;

  // Compliance stats
  const complianceChecks = data.complianceChecks || [];
  const compliancePassed = complianceChecks.filter(c => c.status === 'passed' || c.status === 'pass').length;
  const complianceFailed = complianceChecks.filter(c => c.status === 'failed' || c.status === 'fail').length;
  const complianceScore = complianceChecks.length > 0 ? Math.round((compliancePassed / complianceChecks.length) * 100) : 0;

  // Feature stats
  const specs = state.specs;
  const features = specs?.features || [];
  const criticalFeatures = features.filter(f => f.priority === 'critical').length;
  const highFeatures = features.filter(f => f.priority === 'high').length;
  const moderateFeatures = features.filter(f => f.priority === 'moderate' || f.priority === 'medium').length;
  const simpleFeatures = features.filter(f => f.complexity === 'simple').length;
  const moderateComplexity = features.filter(f => f.complexity === 'moderate').length;
  const complexFeatures = features.filter(f => f.complexity === 'complex').length;

  // API method breakdown
  const apiByMethod: Record<string, number> = {};
  arch?.apiEndpoints?.forEach(e => { apiByMethod[e.method] = (apiByMethod[e.method] || 0) + 1; });

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-4">
          <a href={`/dashboard/${projectId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </a>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">{state.name} — Analytics</h1>
              <p className="text-xs text-white/40">Project ID: {state.id}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {data.letta && (
            <Badge variant={data.letta.connected ? 'success' : 'warning'} className="text-xs">
              {data.letta.connected ? <Zap className="w-3 h-3 mr-1" /> : <ZapOff className="w-3 h-3 mr-1" />}
              Letta: {data.letta.connected ? data.letta.model : 'offline'}
            </Badge>
          )}
          <Badge variant={data.ai?.connected ? 'success' : 'warning'} className="text-xs">
            {data.ai?.connected ? <Zap className="w-3 h-3 mr-1" /> : <ZapOff className="w-3 h-3 mr-1" />}
            {(data.ai as { label?: string })?.label || 'AI'}: {data.ai?.connected ? data.ai.model : 'offline'}
          </Badge>
          <Badge variant={state.status === 'done' ? 'success' : state.status === 'failed' ? 'error' : 'info'}>
            {state.status}
          </Badge>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Top metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-white/50">Tasks Done</span>
              </div>
              <p className="text-2xl font-bold">{completed}<span className="text-sm text-white/40">/{tasks.length}</span></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-white/50">Total Time</span>
              </div>
              <p className="text-2xl font-bold">{formatDuration(totalDuration)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-white/50">Data Models</span>
              </div>
              <p className="text-2xl font-bold">{dataModels}</p>
              <p className="text-xs text-white/40">{totalModelFields} fields</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-4 h-4 text-fuchsia-400" />
                <span className="text-xs text-white/50">API Endpoints</span>
              </div>
              <p className="text-2xl font-bold">{apiEndpoints}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-white/50">Files Generated</span>
              </div>
              <p className="text-2xl font-bold">{files.length}</p>
              <p className="text-xs text-white/40">{totalLines.toLocaleString()} lines</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-white/50">Retries</span>
              </div>
              <p className="text-2xl font-bold">{totalRetries}</p>
              {failed > 0 && <p className="text-xs text-red-400">{failed} failed</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Agent Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                Agent Performance
              </CardTitle>
              <CardDescription>Per-agent execution metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.map((task) => {
                const meta = ROLE_META[task.role] || { icon: Brain, label: task.role, color: 'text-white/60' };
                const Icon = meta.icon;
                const duration = task.startedAt && task.completedAt ? task.completedAt - task.startedAt : null;
                return (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{meta.label}</span>
                        <div className="flex items-center gap-2">
                          {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          {task.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                          {task.status === 'in_progress' && <Loader2 className="w-4 h-4 text-fuchsia-400 animate-spin" />}
                          {task.status === 'pending' && <Clock className="w-4 h-4 text-white/30" />}
                          {task.status === 'retrying' && <AlertCircle className="w-4 h-4 text-amber-400" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-white/40 capitalize">{task.status}</span>
                        {duration !== null && (
                          <span className="text-xs text-white/40 tabular-nums">{formatDuration(duration)}</span>
                        )}
                        {(task.retryCount || 0) > 0 && (
                          <span className="text-xs text-amber-400">{task.retryCount} retries</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Test & Compliance Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                Quality & Compliance
              </CardTitle>
              <CardDescription>Test results and compliance audit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Test results */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-medium">Test Results</h4>
                  </div>
                  {testResults.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tabular-nums">{testPassRate}%</span>
                      <Badge variant={testPassRate >= 80 ? 'success' : testPassRate >= 50 ? 'warning' : 'error'} className="text-xs">
                        {testsPassed}P / {testsFailed}F / {testsSkipped}S
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-white/30">No test data</span>
                  )}
                </div>
                {testResults.length > 0 && (
                  <div className="space-y-1.5">
                    {testResults.map((test, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1">
                        {test.status === 'passed' || test.status === 'pass' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : test.status === 'failed' || test.status === 'fail' ? (
                          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                        )}
                        <span className="text-white/70 truncate flex-1">{test.testName}</span>
                        <Badge variant="default" className="text-xs">{test.type}</Badge>
                        <span className="text-white/40 tabular-nums">{test.duration}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compliance */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-orange-400" />
                    <h4 className="text-sm font-medium">Compliance Audit</h4>
                  </div>
                  {complianceChecks.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tabular-nums">{complianceScore}%</span>
                      <Badge variant={complianceScore >= 80 ? 'success' : 'warning'} className="text-xs">
                        {compliancePassed}P / {complianceFailed}F
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-white/30">No compliance data</span>
                  )}
                </div>
                {complianceChecks.length > 0 && (
                  <div className="space-y-1.5">
                    {complianceChecks.map((check, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs py-1">
                        {check.status === 'passed' || check.status === 'pass' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <span className="text-white/70 font-medium">{check.name}</span>
                          <p className="text-white/40 mt-0.5">{check.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Architecture Breakdown */}
        {arch && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Architecture Breakdown
              </CardTitle>
              <CardDescription>System design generated by the Architect Agent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Data Models */}
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    Data Models ({dataModels})
                  </h4>
                  <div className="space-y-2">
                    {arch.dataModels?.map((model, i) => (
                      <div key={i} className="p-2 rounded-lg border border-white/10 bg-white/[0.02]">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-cyan-300">{model.name}</span>
                          <Badge variant="default" className="text-xs">{model.fields?.length || 0} fields</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {model.fields?.slice(0, 6).map((field, j) => (
                            <span key={j} className="text-xs text-white/40 font-mono">
                              {field.name}:{field.type}
                            </span>
                          ))}
                          {(model.fields?.length || 0) > 6 && (
                            <span className="text-xs text-white/30">+{(model.fields?.length || 0) - 6} more</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API Endpoints */}
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-fuchsia-400" />
                    API Endpoints ({apiEndpoints})
                  </h4>
                  <div className="space-y-1.5">
                    {arch.apiEndpoints?.slice(0, 10).map((endpoint, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Badge
                          variant={
                            endpoint.method === 'GET' ? 'info' :
                            endpoint.method === 'POST' ? 'success' :
                            endpoint.method === 'DELETE' ? 'error' :
                            'warning'
                          }
                          className="text-xs font-mono"
                        >
                          {endpoint.method}
                        </Badge>
                        <span className="text-white/70 font-mono truncate">{endpoint.path}</span>
                        {endpoint.authRequired && <Shield className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      </div>
                    ))}
                    {(arch.apiEndpoints?.length || 0) > 10 && (
                      <span className="text-xs text-white/30">+{(arch.apiEndpoints?.length || 0) - 10} more</span>
                    )}
                  </div>
                  {/* Method breakdown */}
                  {Object.keys(apiByMethod).length > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {Object.entries(apiByMethod).map(([method, count]) => (
                        <Badge key={method} variant="default" className="text-xs">
                          {method}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Page Routes */}
                <div>
                  <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    Page Routes ({pageRoutes})
                  </h4>
                  <div className="space-y-1.5">
                    {arch.pageRoutes?.map((route, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-white/70 font-mono">{route.path}</span>
                        <span className="text-white/40 truncate">{route.name}</span>
                        {route.authRequired && <Shield className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Security & Scalability */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                  <h5 className="text-xs font-medium text-white/60 mb-1">Security Model</h5>
                  <p className="text-xs text-white/50">{arch.securityModel}</p>
                </div>
                <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                  <h5 className="text-xs font-medium text-white/60 mb-1">Scalability Notes</h5>
                  <p className="text-xs text-white/50">{arch.scalabilityNotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Business Analytics */}
        {specs && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Business Analytics
              </CardTitle>
              <CardDescription>Market positioning, monetization, and feature analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-fuchsia-400" />
                    <span className="text-xs text-white/50">Target Audience</span>
                  </div>
                  <p className="text-sm text-white/80">{specs.targetAudience || 'Not specified'}</p>
                </div>
                <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-white/50">Monetization</span>
                  </div>
                  <p className="text-sm text-white/80">{specs.monetization || 'Not specified'}</p>
                </div>
                <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-white/50">Marketplace</span>
                  </div>
                  <p className="text-sm text-white/80 capitalize">{specs.marketplace || 'web'}</p>
                </div>
                <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-violet-400" />
                    <span className="text-xs text-white/50">User Stories</span>
                  </div>
                  <p className="text-sm text-white/80">{specs.userStories?.length || 0} stories</p>
                </div>
              </div>

              {/* Feature breakdown */}
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-3">Feature Analysis ({features.length} features)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* By priority */}
                  <div>
                    <h5 className="text-xs text-white/50 mb-2">By Priority</h5>
                    <div className="space-y-2">
                      {[
                        { label: 'Critical', count: criticalFeatures, color: 'bg-red-500' },
                        { label: 'High', count: highFeatures, color: 'bg-amber-500' },
                        { label: 'Moderate', count: moderateFeatures, color: 'bg-blue-500' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-3">
                          <span className="text-xs text-white/60 w-16">{item.label}</span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className={`h-full ${item.color} rounded-full transition-all`}
                              style={{ width: `${features.length > 0 ? (item.count / features.length) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/40 tabular-nums w-6 text-right">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* By complexity */}
                  <div>
                    <h5 className="text-xs text-white/50 mb-2">By Complexity</h5>
                    <div className="space-y-2">
                      {[
                        { label: 'Simple', count: simpleFeatures, color: 'bg-emerald-500' },
                        { label: 'Moderate', count: moderateComplexity, color: 'bg-amber-500' },
                        { label: 'Complex', count: complexFeatures, color: 'bg-fuchsia-500' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-3">
                          <span className="text-xs text-white/60 w-16">{item.label}</span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className={`h-full ${item.color} rounded-full transition-all`}
                              style={{ width: `${features.length > 0 ? (item.count / features.length) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/40 tabular-nums w-6 text-right">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Feature list */}
                <div className="mt-4 space-y-1.5">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
                      <Badge
                        variant={
                          feature.priority === 'critical' ? 'error' :
                          feature.priority === 'high' ? 'warning' : 'default'
                        }
                        className="text-xs"
                      >
                        {feature.priority}
                      </Badge>
                      <span className="text-white/70">{feature.name}</span>
                      <Badge variant="default" className="text-xs ml-auto">{feature.complexity}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Files Stats */}
        {files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Generated Content
              </CardTitle>
              <CardDescription>{files.length} files, {totalLines.toLocaleString()} total lines of code</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Files by agent */}
                <div>
                  <h5 className="text-xs text-white/50 mb-2">Files by Agent</h5>
                  <div className="space-y-2">
                    {Object.entries(filesByAgent).map(([agent, count]) => {
                      const meta = ROLE_META[agent] || { icon: FileText, label: agent, color: 'text-white/60' };
                      const Icon = meta.icon;
                      return (
                        <div key={agent} className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 ${meta.color}`} />
                          <span className="text-xs text-white/60 w-20">{meta.label}</span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-fuchsia-500 rounded-full"
                              style={{ width: `${(count / files.length) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/40 tabular-nums w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* File list */}
                <div>
                  <h5 className="text-xs text-white/50 mb-2">All Files</h5>
                  <div className="space-y-1">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1">
                        <FileText className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                        <span className="text-white/70 font-mono truncate flex-1">{file.path}</span>
                        <span className="text-white/40 tabular-nums">{(file.content?.split('\n').length || 0)} lines</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tech Stack */}
        {specs?.techStack && Object.keys(specs.techStack).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                Technology Stack
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(specs.techStack).map(([key, value]) => (
                  <div key={key} className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                    <span className="text-xs text-white/40 capitalize">{key}</span>
                    <p className="text-sm text-white/80 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
