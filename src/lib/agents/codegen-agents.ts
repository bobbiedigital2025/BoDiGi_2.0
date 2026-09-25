/**
 * AppForge Code Generation Agents
 * 
 * Three agents that run in parallel after the architect finishes:
 * 1. Database agent — generates SQL schema, migrations, seed data
 * 2. Backend agent — generates API routes, server actions, business logic
 * 3. Frontend agent — generates pages, components, layouts
 * 
 * Each agent takes the architecture doc and specs as input,
 * and outputs a set of GeneratedFile objects.
 */

import type { ProjectSpecs, ArchitectureDoc, GeneratedFile, AgentRole } from './types';
import { hasAIKey, callAI } from './ai-client';
import { hasLettaKey, callLettaAgent } from './letta-client';

// ─── Database Agent ────────────────────────────────────────────────

export interface DatabaseAgentInput {
  architecture: ArchitectureDoc;
  specs: ProjectSpecs;
}

export interface DatabaseAgentOutput {
  files: GeneratedFile[];
}

export const DATABASE_AGENT_SYSTEM_PROMPT = `You are a senior database architect with deep expertise in PostgreSQL and Supabase. You design schemas that are secure by default, performant at scale, and perfectly matched to the application's actual data needs.

RULES:
- Generate schema.sql with: CREATE TABLE statements with proper constraints (NOT NULL, CHECK, UNIQUE), primary/foreign keys with ON DELETE behavior, indexes on columns used in WHERE/JOIN/ORDER BY, Row Level Security policies on every table (users can only read/write their own data, admins can read all), and updated_at triggers.
- Generate seed.sql with realistic demo data that matches the app's domain — not "test user 1" but plausible names, emails, and content that would make a demo look real.
- Table names must come from the architecture's data models. Field types must match the architecture spec exactly.
- Add composite indexes for common query patterns (e.g. user_id + status, user_id + created_at).
- Include a comments column/table only if the app actually needs it — don't pad the schema.
- Use UUID primary keys with uuid_generate_v4() or gen_random_uuid().
- Keep SQL compact — no comments between statements, minimal whitespace.

Respond ONLY in valid JSON: {"files":[{"path":"db/schema.sql","content":"...","agent":"database","status":"generated"},{"path":"db/seed.sql","content":"...","agent":"database","status":"generated"}]}`;

export function generateDefaultDatabaseFiles(input: DatabaseAgentInput): DatabaseAgentOutput {
  // Build schema from the architecture's actual data models, not hardcoded tables
  const models = input.architecture?.dataModels || [];
  const appName = (input.specs?.summary || 'App').split('.')[0].slice(0, 50);

  const tables: string[] = [];
  const idx: string[] = [];
  const rls: string[] = [];
  const seeds: string[] = [];

  // Core users table
  tables.push(`CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  rls.push(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON users FOR SELECT USING (auth.uid() = id);`);

  // Generate tables from the architecture's data models
  for (const m of models) {
    if (m.name === 'users') continue;
    const cols = m.fields.filter(f => f.name !== 'id').map(f => {
      let t = 'TEXT';
      if (f.type === 'uuid') t = 'UUID';
      else if (['integer', 'int', 'number'].includes(f.type)) t = 'INTEGER';
      else if (['float', 'decimal', 'numeric'].includes(f.type)) t = 'NUMERIC';
      else if (f.type === 'boolean') t = 'BOOLEAN DEFAULT false';
      else if (['timestamp', 'datetime', 'timestamptz'].includes(f.type)) t = 'TIMESTAMPTZ DEFAULT NOW()';
      else if (f.type === 'date') t = 'DATE';
      else if (['json', 'jsonb'].includes(f.type)) t = 'JSONB';
      else if (f.type.startsWith('enum')) {
        const vals = f.type.match(/\(([^)]+)\)/)?.[1] || '';
        t = `TEXT CHECK (${f.name} IN (${vals.split(',').map(v => `'${v.trim()}'`).join(',')}))`;
      }
      const req = f.required ? ' NOT NULL' : '';
      const ref = f.references ? ` REFERENCES ${f.references}` : '';
      return `  ${f.name} ${t}${req}${ref}`;
    });
    tables.push(`CREATE TABLE IF NOT EXISTS ${m.name} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
${cols.join(',\n')},
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
    const hasUserId = m.fields.some(f => f.name === 'user_id');
    if (hasUserId) {
      idx.push(`CREATE INDEX IF NOT EXISTS idx_${m.name}_user_id ON ${m.name}(user_id);`);
      rls.push(`ALTER TABLE ${m.name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ${m.name}" ON ${m.name} FOR ALL USING (auth.uid() = user_id);`);
    } else {
      rls.push(`ALTER TABLE ${m.name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read ${m.name}" ON ${m.name} FOR SELECT USING (auth.role() = 'authenticated');`);
    }
    // Seed with plausible data
    const seedCols = m.fields.filter(f => !['id', 'created_at'].includes(f.name)).map(f => f.name);
    if (seedCols.length > 0 && m.name !== 'users') {
      const vals = seedCols.map(c => {
        if (c === 'user_id') return `'00000000-0000-0000-0000-000000000001'`;
        if (c.includes('email')) return `'demo@example.com'`;
        if (c.includes('name') || c.includes('title')) return `'Sample ${m.name}'`;
        if (c.includes('status')) return `'active'`;
        if (c.includes('price') || c.includes('amount')) return '29.99';
        if (c.includes('description') || c.includes('content')) return `'Demo content for ${m.name}'`;
        return `'demo'`;
      });
      seeds.push(`INSERT INTO ${m.name} (${seedCols.join(', ')}) VALUES (${vals.join(', ')});`);
    }
  }

  const schemaSQL = `-- ${appName} — Database Schema
-- Generated from architecture specification

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

${tables.join('\n\n')}

-- Indexes
${idx.join('\n')}

-- Row Level Security
${rls.join('\n\n')}
`;

  const seedSQL = `-- Demo seed data
${seeds.join('\n')}
`;

  return {
    files: [
      { path: 'db/schema.sql', content: schemaSQL, agent: 'database', status: 'generated' },
      { path: 'db/seed.sql', content: seedSQL, agent: 'database', status: 'generated' },
    ],
  };
}


// ─── Backend Agent ─────────────────────────────────────────────────

export interface BackendAgentInput {
  architecture: ArchitectureDoc;
  specs: ProjectSpecs;
}

export interface BackendAgentOutput {
  files: GeneratedFile[];
}

export const BACKEND_AGENT_SYSTEM_PROMPT = `You are a senior backend engineer specializing in Next.js App Router API design. You write secure, validated, production-ready API routes that follow REST conventions and handle errors gracefully.

RULES:
- Generate the API routes specified in the architecture's apiEndpoints list. If no endpoints are listed, generate auth (signup + login) and one primary CRUD resource.
- Every route must have: Zod schema validation on the request body, proper HTTP status codes (201 for create, 400 for validation, 401 for auth, 404 for not found, 500 for server), and structured JSON error responses with a clear "error" field.
- Use Supabase client patterns (not raw SQL). Auth routes use supabase.auth.signUp/signInWithPassword.
- CRUD routes verify authentication via supabase.auth.getUser() and filter queries by user_id.
- Rate-limit expensive operations (AI calls, bulk inserts) with a comment noting where to add rate limiting.
- Keep each file under 50 lines — compact, no unnecessary comments, no TODO placeholders. If something can't be completed, simplify the route rather than leaving a TODO.
- TypeScript strict: no any types unless truly unavoidable.

Respond ONLY in valid JSON: {"files":[{"path":"src/app/api/...","content":"...","agent":"backend","status":"generated"}]}`;

export function generateDefaultBackendFiles(input: BackendAgentInput): BackendAgentOutput {
  // Architecture API endpoints inform the routes (used when AI is wired in)

  const authSignup = `import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = signupSchema.parse(body);

    // TODO: Replace with Supabase auth call
    // const { data, error } = await supabase.auth.signUp({ email, password })
    
    return NextResponse.json({
      message: 'Account created. Check your email for verification.',
      email,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
`;

  const authLogin = `import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    // TODO: Replace with Supabase auth call
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    return NextResponse.json({
      message: 'Logged in successfully',
      user: { email },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  }
}
`;

  const projectsList = `import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // TODO: Get user from session
  // TODO: Fetch projects from Supabase where user_id = session.user.id
  
  return NextResponse.json({
    projects: [
      { id: 'demo-1', name: 'Demo Project', status: 'active' }
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.name || body.name.length < 1) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    // TODO: Insert into Supabase
    return NextResponse.json({
      message: 'Project created',
      project: { id: 'new-' + Date.now(), ...body },
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
`;

  const billingWebhook = `import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//   apiVersion: '2024-06-20',
// });

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  try {
    // const event = stripe.webhooks.constructEvent(
    //   payload,
    //   signature,
    //   process.env.STRIPE_WEBHOOK_SECRET!
    // );

    // Handle event types:
    // - checkout.session.completed
    // - customer.subscription.updated
    // - customer.subscription.deleted
    // - invoice.payment_succeeded
    // - invoice.payment_failed

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }
}
`;

  return {
    files: [
      { path: 'src/app/api/auth/signup/route.ts', content: authSignup, agent: 'backend', status: 'generated' },
      { path: 'src/app/api/auth/login/route.ts', content: authLogin, agent: 'backend', status: 'generated' },
      { path: 'src/app/api/projects/route.ts', content: projectsList, agent: 'backend', status: 'generated' },
      { path: 'src/app/api/billing/webhook/route.ts', content: billingWebhook, agent: 'backend', status: 'generated' },
    ],
  };
}

// ─── Frontend Agent ─────────────────────────────────────────────────

export interface FrontendAgentInput {
  architecture: ArchitectureDoc;
  specs: ProjectSpecs;
}

export interface FrontendAgentOutput {
  files: GeneratedFile[];
}

export const FRONTEND_AGENT_SYSTEM_PROMPT = `You are a senior frontend architect specializing in Next.js 15 App Router and modern React patterns. You build pages that are beautiful, responsive, accessible, and deeply specific to the application's purpose.

RULES:
- Generate the pages specified in the architecture's pageRoutes list. If no routes are listed, generate: a landing page, an auth page (login+signup combined), and a main app page specific to the app's purpose.
- EVERY page must be visually distinct and app-specific. A quote generator should have quote forms and client cards. A task manager should have kanban boards or list views. A learning platform should have course cards and progress bars. NEVER generate a generic dashboard for every app.
- Use the app's actual name, features, and data models from the spec to populate realistic UI content — not "Item 1, Item 2" but plausible entries that make the demo feel real.
- Design: dark theme (bg-black), Tailwind CSS, shadcn/ui patterns, rounded-xl cards, subtle borders (border-white/10), gradient accents (from-violet-500 to-fuchsia-500), proper spacing (p-6, gap-4).
- Responsive: mobile-first, works on phone screens. Use grid-cols-1 md:grid-cols-2 lg:grid-cols-3 patterns.
- Accessible: proper semantic HTML, aria-labels on interactive elements, focus states, sufficient color contrast.
- Interactive: useState for form state, loading states on buttons, error badges, success feedback. Not just static markup.
- TypeScript strict, 'use client' where needed, proper imports.

Respond ONLY in valid JSON: {"files":[{"path":"src/app/.../page.tsx","content":"...","agent":"frontend","status":"generated"}]}`;

export function generateDefaultFrontendFiles(input: FrontendAgentInput): FrontendAgentOutput {
  const loginPage = `'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Badge variant="error">{error}</Badge>}
            <div>
              <label className="text-sm text-white/60 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                required
              />
            </div>
            <div>
              <label className="text-sm text-white/60 mb-1 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                required
              />
            </div>
            <Button variant="gradient" className="w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <p className="text-sm text-white/40 text-center">
              Don't have an account?{' '}
              <a href="/signup" className="text-fuchsia-400 hover:underline">Sign up</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`;

  const signupPage = `'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Signup failed');
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Start building today</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Badge variant="error">{error}</Badge>}
            <div>
              <label className="text-sm text-white/60 mb-1 block">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
              />
            </div>
            <div>
              <label className="text-sm text-white/60 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                required
              />
            </div>
            <div>
              <label className="text-sm text-white/60 mb-1 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                required
                minLength={8}
              />
            </div>
            <Button variant="gradient" className="w-full" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
            <p className="text-sm text-white/40 text-center">
              Already have an account?{' '}
              <a href="/login" className="text-fuchsia-400 hover:underline">Sign in</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`;

  const adminPage = `'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function AdminPage() {
  const stats = [
    { label: 'Total Users', value: 1247, change: '+12%' },
    { label: 'Active Projects', value: 342, change: '+8%' },
    { label: 'Revenue (MRR)', value: '$8,420', change: '+23%' },
    { label: 'API Calls (24h)', value: '1.2M', change: '+5%' },
  ];

  const users = [
    { email: 'admin@appforge.dev', role: 'admin', status: 'active' },
    { email: 'user@appforge.dev', role: 'user', status: 'active' },
    { email: 'test@appforge.dev', role: 'user', status: 'suspended' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <h1 className="font-semibold text-lg">Admin Panel</h1>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <p className="text-sm text-white/40 mb-1">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stat.value}</span>
                  <Badge variant="success" className="text-xs">{stat.change}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* User management */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Manage user accounts and roles</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-left text-sm text-white/40">
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3 text-sm">{user.email}</td>
                    <td className="py-3">
                      <Badge variant={user.role === 'admin' ? 'warning' : 'default'} className="text-xs">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Badge variant={user.status === 'active' ? 'success' : 'error'} className="text-xs">
                        {user.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <button className="text-xs text-fuchsia-400 hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* System health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white/60">API Uptime (30d)</span>
                <span className="text-emerald-400">99.98%</span>
              </div>
              <Progress value={99.98} />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white/60">Database Health</span>
                <span className="text-emerald-400">Healthy</span>
              </div>
              <Progress value={100} />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white/60">Error Rate (24h)</span>
                <span className="text-amber-400">0.02%</span>
              </div>
              <Progress value={99.98} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`;

  return {
    files: [
      { path: 'src/app/(auth)/login/page.tsx', content: loginPage, agent: 'frontend', status: 'generated' },
      { path: 'src/app/(auth)/signup/page.tsx', content: signupPage, agent: 'frontend', status: 'generated' },
      { path: 'src/app/(dashboard)/admin/page.tsx', content: adminPage, agent: 'frontend', status: 'generated' },
    ],
  };
}

// ─── AI-wired runners (call real AI, fall back to defaults) ──────────

type LogFn = (level: 'warn', msg: string) => void;

function extractFiles(response: string, agent: AgentRole): GeneratedFile[] {
  // Strip markdown code fences (```json ... ```) that models often wrap around JSON
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let parsed: { files?: unknown[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      parsed = JSON.parse(m[0]);
    } else {
      throw new Error('Agent returned invalid JSON');
    }
  }
  const files = parsed.files;
  if (!Array.isArray(files)) throw new Error('Agent response missing files array');
  return files.map((f: unknown) => {
    const file = f as Record<string, unknown>;
    return {
      path: String(file.path || 'unknown'),
      content: String(file.content || ''),
      agent,
      status: 'generated' as const,
    };
  });
}

export function buildDatabasePrompt(input: DatabaseAgentInput): string {
  const { architecture, specs } = input;
  const models = architecture.dataModels
    .map(m => `${m.name}(${m.fields.map(f => f.name + ':' + f.type).join(', ')})`)
    .join(', ');
  return `Project: ${specs.summary}
Tech stack: ${specs.techStack.database}
Data models from architecture: ${models}

Generate the complete SQL schema. Include CREATE TABLE statements, constraints, indexes, RLS policies, and seed data. Return JSON with a "files" array where each file has "path", "content", "agent":"database", "status":"generated". Keep it compact — 2-3 files maximum (schema.sql, seed.sql).`;
}

export async function runDatabaseAgent(
  input: DatabaseAgentInput,
  log: LogFn
): Promise<DatabaseAgentOutput> {
  // Primary path: persistent Letta agent (learns across projects)
  if (hasLettaKey()) {
    try {
      const raw = await callLettaAgent('database', buildDatabasePrompt(input));
      const result = { files: extractFiles(raw, 'database') };
      if (result.files.length > 0) return result;
      log('warn', 'Letta database agent returned no files, falling back');
    } catch (err) {
      log('warn', `Letta database agent failed (${err instanceof Error ? err.message : 'unknown'}), falling back`);
    }
  }
  // Secondary path: Telnyx inference
  if (hasAIKey()) {
    try {
      const raw = await callAI(DATABASE_AGENT_SYSTEM_PROMPT, buildDatabasePrompt(input));
      return { files: extractFiles(raw, 'database') };
    } catch (err) {
      log('warn', `AI call failed, using default database files: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return generateDefaultDatabaseFiles(input);
}

export function buildBackendPrompt(input: BackendAgentInput): string {
  const { architecture, specs } = input;
  const endpoints = architecture.apiEndpoints
    .map(e => `${e.method} ${e.path} — ${e.description}`)
    .join(', ');
  return `Project: ${specs.summary}
Tech stack: ${specs.techStack.backend}
API endpoints from architecture: ${endpoints}

Generate Next.js 15 App Router API route handlers for every endpoint. Include Zod validation, auth checks, and error handling. Return JSON with a "files" array where each file has "path", "content", "agent":"backend", "status":"generated". Keep it compact — 4-6 files maximum.`;
}

export async function runBackendAgent(
  input: BackendAgentInput,
  log: LogFn
): Promise<BackendAgentOutput> {
  // Primary path: persistent Letta agent (learns across projects)
  if (hasLettaKey()) {
    try {
      const raw = await callLettaAgent('backend', buildBackendPrompt(input));
      const result = { files: extractFiles(raw, 'backend') };
      if (result.files.length > 0) return result;
      log('warn', 'Letta backend agent returned no files, falling back');
    } catch (err) {
      log('warn', `Letta backend agent failed (${err instanceof Error ? err.message : 'unknown'}), falling back`);
    }
  }
  // Secondary path: Telnyx inference
  if (hasAIKey()) {
    try {
      const raw = await callAI(BACKEND_AGENT_SYSTEM_PROMPT, buildBackendPrompt(input));
      return { files: extractFiles(raw, 'backend') };
    } catch (err) {
      log('warn', `AI call failed, using default backend files: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return generateDefaultBackendFiles(input);
}

export function buildFrontendPrompt(input: FrontendAgentInput): string {
  const { architecture, specs } = input;
  const routes = architecture.pageRoutes
    .map(r => `${r.path} — ${r.name} (${r.role})`)
    .join(', ');
  return `Project: ${specs.summary}
Tech stack: ${specs.techStack.frontend}
Page routes from architecture: ${routes}

Generate React page components for every route. Use Next.js 15 App Router, TypeScript, Tailwind CSS, and shadcn/ui patterns. Return JSON with a "files" array where each file has "path", "content", "agent":"frontend", "status":"generated". Keep it compact — 3-5 files maximum.`;
}

export async function runFrontendAgent(
  input: FrontendAgentInput,
  log: LogFn
): Promise<FrontendAgentOutput> {
  // Primary path: persistent Letta agent (learns across projects)
  if (hasLettaKey()) {
    try {
      const raw = await callLettaAgent('frontend', buildFrontendPrompt(input));
      const result = { files: extractFiles(raw, 'frontend') };
      if (result.files.length > 0) return result;
      log('warn', 'Letta frontend agent returned no files, falling back');
    } catch (err) {
      log('warn', `Letta frontend agent failed (${err instanceof Error ? err.message : 'unknown'}), falling back`);
    }
  }
  // Secondary path: Telnyx inference
  if (hasAIKey()) {
    try {
      const raw = await callAI(FRONTEND_AGENT_SYSTEM_PROMPT, buildFrontendPrompt(input));
      return { files: extractFiles(raw, 'frontend') };
    } catch (err) {
      log('warn', `AI call failed, using default frontend files: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return generateDefaultFrontendFiles(input);
}
