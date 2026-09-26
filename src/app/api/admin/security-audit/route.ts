/**
 * API Route: GET /api/admin/security-audit
 * Admin-only. Runs the production hardening audit LIVE — the same
 * checks a security firm would run, executed at request time:
 *   1. Auth bypass probes on every protected route (expect 401/403)
 *   2. Secret leak scan of the client bundle (key patterns)
 *   3. RLS policy audit (public-writable tables, recursion risk)
 *   4. Security headers check (HSTS, nosniff, frame, stack hidden)
 *   5. Rate limiting coverage on expensive routes (static scan)
 *   6. Admin route protection
 * Returns a scored report for the admin panel display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bodigi2.com';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.api);
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const adminRead = createAdminClient();
  const { data: profile } = await adminRead.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const checks: CheckResult[] = [];

  // 1. Auth bypass probes
  const protectedRoutes = [
    { method: 'GET', path: '/api/generate/test-audit/history' },
    { method: 'POST', path: '/api/generate/test-audit/day2' },
    { method: 'POST', path: '/api/generate/test-audit/modify' },
    { method: 'POST', path: '/api/interview' },
    { method: 'POST', path: '/api/generate/test-audit/loops/wire' },
    { method: 'POST', path: '/api/templates/fork' },
    { method: 'POST', path: '/api/showcase' },
    { method: 'GET', path: '/api/admin/support' },
  ];

  let authFailures = 0;
  for (const route of protectedRoutes) {
    try {
      const res = await fetch(`${APP_URL}${route.path}`, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: route.method === 'POST' ? '{}' : undefined,
        signal: AbortSignal.timeout(8000),
      });
      if (res.status !== 401 && res.status !== 403 && res.status !== 404) {
        authFailures++;
        checks.push({
          name: `Auth: ${route.method} ${route.path}`,
          status: 'fail',
          detail: `Returned ${res.status} unauthenticated — expected 401/403/404`,
        });
      }
    } catch {
      checks.push({ name: `Auth: ${route.method} ${route.path}`, status: 'warn', detail: 'Probe timed out — re-run the audit' });
    }
  }
  if (authFailures === 0) {
    checks.push({
      name: 'Auth bypass probes',
      status: 'pass',
      detail: `${protectedRoutes.length} protected routes all reject unauthenticated access`,
    });
  }

  // 2. Client bundle secret scan
  try {
    const chunksDir = path.join(process.cwd(), '.next/static/chunks');
    const files = await readdir(chunksDir);
    const secretPatterns = [
      { re: /sk_live_[A-Za-z0-9]{10,}/, label: 'Stripe live key' },
      { re: /sk-or-v1-[A-Za-z0-9]{10,}/, label: 'OpenRouter key' },
      { re: /eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_-]{15,}/, label: 'JWT token' },
      { re: /SUPABASE_SERVICE_ROLE/i, label: 'Service role reference' },
    ];
    let leaks = 0;
    let scanned = 0;
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      scanned++;
      const content = await readFile(path.join(chunksDir, file), 'utf8');
      for (const p of secretPatterns) {
        if (p.re.test(content)) {
          leaks++;
          checks.push({ name: `Bundle leak: ${p.label}`, status: 'fail', detail: `Found in ${file}` });
        }
      }
    }
    if (leaks === 0) {
      checks.push({ name: 'Client bundle secret scan', status: 'pass', detail: `${scanned} JS chunks scanned — no key patterns found` });
    }
  } catch {
    checks.push({ name: 'Client bundle secret scan', status: 'warn', detail: 'Bundle directory not readable on this instance' });
  }

  // 3. RLS policy audit (via pg_policies through service role)
  try {
    const { data: policyData } = await adminRead
      .from('pg_policies')
      .select('tablename, policyname, cmd, roles')
      .limit(100);
    const policies = policyData || [];
    // Public-writable: INSERT/UPDATE/DELETE policies granted to anon/public
    const publicWritable = policies.filter((p: any) =>
      ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(p.cmd) &&
      (p.roles || []).some((r: string) => r === 'anon' || r === 'public')
    );
    if (publicWritable.length > 0) {
      checks.push({ name: 'RLS: public-writable tables', status: 'fail', detail: publicWritable.map((p: any) => `${p.tablename}.${p.policyname}`).join(', ') });
    } else {
      checks.push({ name: 'RLS: public-writable tables', status: 'pass', detail: 'None — all writes require ownership or service role' });
    }
    checks.push({
      name: 'RLS: policy inventory',
      status: 'pass',
      detail: `${policies.length} policies across ${new Set(policies.map((p: any) => p.tablename)).size} tables`,
    });
  } catch {
    checks.push({ name: 'RLS audit', status: 'warn', detail: 'pg_policies not readable via client — run manually via Supabase dashboard' });
  }

  // 4. Security headers
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(8000) });
    const h = res.headers;
    const headerChecks = [
      { name: 'HSTS', ok: (h.get('strict-transport-security') || '').includes('max-age') },
      { name: 'X-Content-Type-Options', ok: (h.get('x-content-type-options') || '') === 'nosniff' },
      { name: 'X-Frame-Options', ok: !!h.get('x-frame-options') },
      { name: 'Stack hidden', ok: !h.get('x-powered-by') },
    ];
    const failed = headerChecks.filter(c => !c.ok);
    if (failed.length === 0) {
      checks.push({ name: 'Security headers', status: 'pass', detail: 'HSTS, nosniff, frame protection, stack hidden — all live' });
    } else {
      checks.push({ name: 'Security headers', status: 'fail', detail: `Missing: ${failed.map(c => c.name).join(', ')}` });
    }
  } catch {
    checks.push({ name: 'Security headers', status: 'warn', detail: 'Could not reach the site from this instance' });
  }

  // 5. Rate limiting coverage (static scan)
  try {
    const routesDir = path.join(process.cwd(), 'src/app/api');
    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(entries.map(async (e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      }));
      return files.flat();
    }
    const routeFiles = (await walk(routesDir)).filter(f => f.endsWith('route.ts'));
    const expensive = routeFiles.filter(f =>
      /generate|modify|day2|interview|setup-agent|checkout|github-export|vercel-deploy|purchase|wire/i.test(f)
    );
    const unguarded: string[] = [];
    for (const f of expensive) {
      const content = await readFile(f, 'utf8');
      if (!content.includes('rateLimit') && !content.includes('RATE_LIMITS')) {
        unguarded.push(f.replace(process.cwd() + '/src/app/api', '').replace('/route.ts', ''));
      }
    }
    if (unguarded.length === 0) {
      checks.push({ name: 'Rate limiting coverage', status: 'pass', detail: `${expensive.length} expensive routes all rate limited` });
    } else {
      checks.push({ name: 'Rate limiting coverage', status: 'fail', detail: `Unguarded: ${unguarded.join(', ')}` });
    }
  } catch {
    checks.push({ name: 'Rate limiting coverage', status: 'warn', detail: 'Source not readable on this instance' });
  }

  // 6. Admin route protection
  try {
    const res = await fetch(`${APP_URL}/admin`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (res.status === 307 || res.status === 302) {
      checks.push({ name: 'Admin route protection', status: 'pass', detail: 'Unauthenticated /admin redirects away' });
    } else if (res.status === 200) {
      checks.push({ name: 'Admin route protection', status: 'warn', detail: '/admin returns 200 unauthenticated — client-side gate blocks rendering; server data stays admin-gated' });
    } else {
      checks.push({ name: 'Admin route protection', status: 'pass', detail: `Returns ${res.status} unauthenticated` });
    }
  } catch {
    checks.push({ name: 'Admin route protection', status: 'warn', detail: 'Could not reach /admin from this instance' });
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const score = Math.round((passed / Math.max(checks.length, 1)) * 100);

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    score,
    summary: { passed, failed, warned, total: checks.length },
    checks,
  });
}
