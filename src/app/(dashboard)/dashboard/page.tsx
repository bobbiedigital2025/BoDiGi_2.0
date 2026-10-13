'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Pencil, Check, X, Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import TrialBanner from '@/components/TrialBanner';

interface ProjectInfo {
  id: string;
  name: string;
  idea: string;
  status: string;
  progress: number;
  created_at: string;
}

// Customer-facing labels for project status — raw values ('planning',
// 'done'...) are pipeline jargon, not something a paying customer should read.
const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'error' | 'info' }> = {
  done: { label: 'Built', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  planning: { label: 'Planning', variant: 'info' },
  building: { label: 'Building…', variant: 'info' },
  testing: { label: 'Testing…', variant: 'info' },
  deploying: { label: 'Deploying…', variant: 'info' },
};

export default function DashboardListPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectsState, setProjectsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetch('/api/generate')
        .then((res) => {
          if (!res.ok) throw new Error('load failed');
          return res.json();
        })
        .then((data) => {
          setProjects(data.projects || []);
          setProjectsState('ready');
        })
        .catch(() => setProjectsState('error'));
    }
  }, [user]);

  const startRename = (e: React.MouseEvent, p: ProjectInfo) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name || '');
  };

  const submitRename = async (projectId: string) => {
    const name = editName.trim();
    if (name.length < 2 || renaming) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/generate/${projectId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name } : p)));
        setEditingId(null);
      }
    } catch {
      // leave the row as-is; user can retry
    } finally {
      setRenaming(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Global nav lives in the dashboard layout (AppNav) — brand, new-app, profile dropdown */}

      <div className="max-w-4xl mx-auto px-6 py-12">
        <TrialBanner />
        <h2 className="text-2xl font-bold mb-6">Your Projects</h2>
        {projectsState === 'loading' ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
          </div>
        ) : projectsState === 'error' ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-white/40 mb-4">Couldn&apos;t load your projects — check your connection and try again.</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-white/40 mb-4">No projects yet. Start by describing an app idea.</p>
              <Button variant="gradient" onClick={() => router.push('/')}>
                Create your first app
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <Card key={p.id} className="cursor-pointer hover:border-white/20 transition-all" onClick={() => router.push(`/dashboard/${p.id}`)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(p.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          placeholder="Name your app"
                          className="flex-1 min-w-0 bg-white/5 border border-white/20 rounded px-2 py-1 text-sm text-white outline-none focus:border-purple-400"
                        />
                        <button onClick={() => submitRename(p.id)} disabled={renaming || editName.trim().length < 2} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40" title="Save name">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-white/40 hover:text-white/70" title="Cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="font-medium text-sm flex items-center gap-2 group">
                        <span className="truncate">{p.name || 'Untitled app'}</span>
                        <button onClick={(e) => startRename(e, p)} className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-purple-300 transition-opacity" title="Rename app">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </h3>
                    )}
                    <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{p.idea}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={STATUS_LABELS[p.status]?.variant || 'info'}>
                        {STATUS_LABELS[p.status]?.label || 'In progress'}
                      </Badge>
                      {typeof p.progress === 'number' && (
                        <span className="text-xs text-white/30">{p.progress}%</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/30" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
