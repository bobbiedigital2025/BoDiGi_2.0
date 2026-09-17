'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, LogOut, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';

interface ProjectInfo {
  id: string;
  name: string;
  idea: string;
  status: string;
  progress: number;
  created_at: string;
}

export default function DashboardListPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetch('/api/generate')
        .then((res) => res.json())
        .then((data) => setProjects(data.projects || []))
        .catch(() => {});
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <h1 className="font-semibold">BoDiGi 2.0 Dashboard</h1>
          {user && (
            <span className="text-sm text-white/40 ml-2">{user.email}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/setup')}>
            <BookOpen className="w-3 h-3" /> Setup Guide
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
            Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/pricing')}>
            Upgrade
          </Button>
          <Button variant="gradient" size="sm" onClick={() => router.push('/')}>
            New Project <ArrowRight className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-3 h-3" /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold mb-6">Your Projects</h2>
        {projects.length === 0 ? (
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
                  <div>
                    <h3 className="font-medium text-sm">{p.name || p.id}</h3>
                    <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{p.idea}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={p.status === 'completed' ? 'success' : 'info'}>
                        {p.status || 'In progress'}
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
