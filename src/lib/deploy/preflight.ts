/**
 * Deploy preflight — static reconciliation before a project leaves BoDiGi.
 *
 * SquishDough autopsy (Oct 13 2026): THREE sequential Vercel build failures
 * on one project, each a different missing piece the platform could have
 * caught before deploy:
 *   1. zod imported by generated code, never declared in package.json
 *   2. lucide-react imported, never declared
 *   3. app/ root tree imported @/components/ui/* — which only existed under
 *      src/components (the tsconfig we ship maps @/* to the ROOT, so the
 *      import was genuinely unresolvable; the src-assuming stub system
 *      couldn't see the gap)
 *
 * Preflight closes the whole class deterministically:
 *   - reconcileDependencies: every bare import must be declared in
 *     package.json — missing ones are added with pinned versions.
 *   - bridgeLocalModules: every @/ or relative import must resolve — if the
 *     file exists in the other tree (src/ vs bare), it is copied to the
 *     location the compiler actually looks at.
 *
 * Every fix produces a plain-English report line: the customer watches the
 * fix happen in their build log.
 */

export interface PreflightFile {
  path: string;
  content: string;
  agent?: string;
  status?: string;
}

export interface PreflightReport {
  addedDeps: string[];
  bridgedFiles: string[];
  warnings: string[];
  secretFindings: SecretFinding[];
}

/** One hardcoded-credential hit. Never stores the secret itself. */
export interface SecretFinding {
  path: string;
  pattern: string; // human label, e.g. 'stripe-live-secret-key'
  preview: string; // first 4 chars + '…' — never the full value
}

const IMPORT_RE = /import\s+(?:type\s+)?[^;'"\n]+?\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /import\s+['"]([^'"]+)['"]/g;
const REEXPORT_RE = /export\s+[^;'"\n]+?\s+from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

const CODE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http',
  'https', 'net', 'os', 'path', 'querystring', 'stream', 'url', 'util',
  'zlib', 'dns', 'tls', 'http2', 'perf_hooks', 'process', 'timers',
]);

/** Pinned versions for packages the agents reach for most. Fallback: latest. */
const KNOWN_VERSIONS: Record<string, string> = {
  next: '^16.0.0',
  react: '^19.0.0',
  'react-dom': '^19.0.0',
  zod: '^3.23.8',
  'lucide-react': '^0.454.0',
  stripe: '^16.0.0',
  '@supabase/supabase-js': '^2.45.0',
  '@supabase/ssr': '^0.5.0',
  'framer-motion': '^11.0.0',
  recharts: '^2.13.0',
  'date-fns': '^4.1.0',
  clsx: '^2.1.0',
  'class-variance-authority': '^0.7.0',
  'tailwind-merge': '^2.5.0',
  sonner: '^1.5.0',
  'next-themes': '^0.3.0',
  bcryptjs: '^2.4.3',
  resend: '^4.0.0',
  tailwindcss: '^3.4.0',
  postcss: '^8.4.0',
  autoprefixer: '^10.4.0',
};

const RADIX_PREFIX = '@radix-ui/';

/**
 * Secret-scan (#14 kernel, Oct 24 2026): generated code and exports are
 * scanned for hardcoded credentials before delivery — the same
 * deterministic family as dependency reconciliation and stub bridging.
 *
 * v1 is LOG-ONLY: findings go to the report and the preflight log lines;
 * delivery is not blocked until the false-positive rate is proven low in
 * production. Blocking arms as v2.
 *
 * Findings never contain the secret itself — pattern class + file path +
 * a 4-char redacted preview only (logs are customer-visible; keys never
 * reach logs or users).
 */
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'stripe-live-secret-key', re: /sk_live_[0-9a-zA-Z]{16,}/g },
  { label: 'stripe-test-secret-key', re: /sk_test_[0-9a-zA-Z]{16,}/g },
  { label: 'stripe-restricted-key', re: /rk_(?:live|test)_[0-9a-zA-Z]{16,}/g },
  { label: 'stripe-webhook-secret', re: /whsec_[0-9a-zA-Z]{16,}/g },
  { label: 'openrouter-api-key', re: /sk-or-v1-[0-9a-zA-Z-]{16,}/g },
  { label: 'supabase-secret-key', re: /sb_secret_[0-9a-zA-Z-]{16,}/g },
  { label: 'db-connection-string-with-password', re: /postgres(?:ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@/g },
  { label: 'generic-key-literal', re: /\b[A-Z_]*(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY|SERVICE_ROLE)[A-Z_]*\s*[:=]\s*['"][0-9A-Za-z+/_-]{32,}['"]/g },
];

/** Obvious placeholders a scan must not flag. */
const SECRET_PLACEHOLDER_RE = /(?:YOUR_|CHANGE ?ME|PLACEHOLDER|EXAMPLE|DUMMY|<[^>]*>|\bxxx\b)/i;

function collectSpecifiers(content: string, out: Set<string>): void {
  for (const re of [IMPORT_RE, SIDE_EFFECT_RE, REEXPORT_RE, DYNAMIC_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) out.add(m[1]);
  }
}

/** Bare specifier → npm package name ('next/headers' → 'next', '@scope/pkg/x' → '@scope/pkg'). */
function packageNameOf(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

/**
 * Every bare import in the file set must be declared in package.json.
 * Missing packages are added to dependencies (devDependencies for @types/*)
 * with a pinned version when we know one.
 */
export function reconcileDependencies(files: PreflightFile[], report: PreflightReport): void {
  const pkgFile = files.find((f) => f.path === 'package.json');
  if (!pkgFile) return; // the export scaffold guarantees one before this runs

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(pkgFile.content);
  } catch {
    report.warnings.push('Preflight could not read package.json — skipped dependency checks.');
    return;
  }
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};

  const specs = new Set<string>();
  for (const f of files) {
    if (CODE_EXT_RE.test(f.path)) collectSpecifiers(f.content, specs);
  }

  let changed = false;
  for (const spec of specs) {
    if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('#')) continue;
    const name = packageNameOf(spec.replace(/^node:/, ''));
    if (NODE_BUILTINS.has(name) || name.startsWith('node:')) continue;
    if (pkg.dependencies[name] || pkg.devDependencies[name]) continue;

    const version = name.startsWith(RADIX_PREFIX) ? '^1.1.0' : (KNOWN_VERSIONS[name] || 'latest');
    if (name.startsWith('@types/')) pkg.devDependencies[name] = version;
    else pkg.dependencies[name] = version;
    report.addedDeps.push(name);
    changed = true;
  }

  if (changed) {
    pkgFile.content = JSON.stringify(pkg, null, 2) + '\n';
  }
}

const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.mjs', '.json'];
const INDEX_EXTS = ['/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

/**
 * Resolve a local import the way the compiler does with our shipped
 * tsconfig ('@/*' → root-relative). Returns the resolved path prefix
 * (no extension), or null for bare specifiers.
 */
function resolveLocal(spec: string, fromPath: string, aliasRoot: string): string | null {
  if (spec.startsWith('@/')) return `${aliasRoot}${spec.slice(2)}`;
  if (spec.startsWith('.')) {
    const dir = fromPath.split('/').slice(0, -1);
    for (const part of spec.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') dir.pop();
      else dir.push(part);
    }
    return dir.join('/');
  }
  return null;
}

/**
 * Where does '@/' resolve for THIS file set? Read the project's own
 * tsconfig paths; default to the root mapping our scaffold ships
 * ('@/*' → './*'). A './src/*' mapping means 'src/'.
 */
export function detectAliasRoot(files: PreflightFile[]): string {
  const tsconfig = files.find((f) => f.path === 'tsconfig.json');
  if (!tsconfig) return '';
  try {
    const parsed = JSON.parse(tsconfig.content);
    const mapping = parsed?.compilerOptions?.paths?.['@/*']?.[0] as string | undefined;
    if (mapping && mapping.replace(/\\/g, '/').includes('src')) return 'src/';
  } catch {
    // unreadable tsconfig — fall through to the scaffold default
  }
  return '';
}

function resolveInSet(paths: Set<string>, noExt: string): string | null {
  for (const ext of RESOLVE_EXTS) {
    if (paths.has(noExt + ext)) return noExt + ext;
  }
  for (const idx of INDEX_EXTS) {
    if (paths.has(noExt + idx)) return noExt + idx;
  }
  return null;
}

/** 'components/ui/button' ↔ 'src/components/ui/button' */
function otherTree(pathNoExt: string): string | null {
  if (pathNoExt.startsWith('src/')) return pathNoExt.slice(4);
  return `src/${pathNoExt}`;
}

/**
 * Every local import must resolve against the file set. When the module
 * lives only in the other tree (src/ vs bare), copy it to the resolved
 * location — additive and safe, unlike folding trees wholesale.
 */
export function bridgeLocalModules(files: PreflightFile[], report: PreflightReport, aliasRoot = ''): void {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const needed = new Map<string, string>(); // resolvedNoExt → first importing path

  for (const f of files) {
    if (!CODE_EXT_RE.test(f.path)) continue;
    const specs = new Set<string>();
    collectSpecifiers(f.content, specs);
    for (const spec of specs) {
      const local = resolveLocal(spec, f.path, aliasRoot);
      if (!local) continue;
      if (!needed.has(local)) needed.set(local, f.path);
    }
  }

  const paths = () => new Set(byPath.keys());
  for (const [noExt, importer] of needed) {
    if (resolveInSet(paths(), noExt)) continue;
    const alt = otherTree(noExt);
    const altHit = alt ? resolveInSet(paths(), alt) : null;
    if (!altHit) continue; // genuinely missing — the stub system handles it

    const source = byPath.get(altHit)!;
    // Preserve the resolved extension style: copy verbatim to the matching
    // path in the needed tree (same suffix as the source file).
    const suffix = altHit.slice(alt!.length); // '', '.tsx', '/index.ts', ...
    const target = noExt + suffix;
    if (byPath.has(target)) continue;
    const copy: PreflightFile = { path: target, content: source.content, agent: source.agent, status: source.status };
    byPath.set(target, copy);
    files.push(copy);
    report.bridgedFiles.push(target);
    // Recurse: the bridged file may itself import from its old tree —
    // re-scan its specifiers against the new location.
    if (CODE_EXT_RE.test(target)) {
      const inner = new Set<string>();
      collectSpecifiers(source.content, inner);
      for (const spec of inner) {
        const local = resolveLocal(spec, target, aliasRoot);
        if (local && !needed.has(local)) needed.set(local, target);
      }
    }
  }

  if (report.bridgedFiles.length > 0) {
    report.warnings.push(
      `Bridged ${report.bridgedFiles.length} file(s) between src/ and root trees.`
    );
  }
}

/** Run all preflight checks in place; returns the plain-English report. */
export function runPreflight(files: PreflightFile[]): PreflightReport {
  const report: PreflightReport = { addedDeps: [], bridgedFiles: [], warnings: [], secretFindings: [] };
  scanSecrets(files, report);
  bridgeLocalModules(files, report, detectAliasRoot(files));
  reconcileDependencies(files, report);
  return report;
}

/**
 * Scan code and env-style files for hardcoded credentials. Specific
 * patterns run first; a generic-literal hit that overlaps a specific one
 * is skipped so each secret is reported once, under its strongest label.
 */
export function scanSecrets(files: PreflightFile[], report: PreflightReport): void {
  for (const f of files) {
    if (!f.content) continue;
    const scannable = CODE_EXT_RE.test(f.path) || /(^|\/)\.env/.test(f.path);
    if (!scannable) continue;
    const hits: Array<[number, number]> = [];
    for (const { label, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      for (let m = re.exec(f.content); m !== null; m = re.exec(f.content)) {
        const start = m.index;
        const end = start + m[0].length;
        if (hits.some(([s, e]) => start < e && end > s)) continue;
        const context = f.content.slice(Math.max(0, start - 60), end);
        if (SECRET_PLACEHOLDER_RE.test(context)) continue;
        hits.push([start, end]);
        report.secretFindings.push({ path: f.path, pattern: label, preview: m[0].slice(0, 4) + '…' });
      }
    }
  }
  if (report.secretFindings.length > 0) {
    report.warnings.push(`Found ${report.secretFindings.length} hardcoded secret pattern(s) — see secret findings.`);
  }
}

/** Plain-English lines for project_logs — the customer watches the fix happen. */
export function preflightLogLines(report: PreflightReport): string[] {
  const lines: string[] = [];
  if (report.addedDeps.length > 0) {
    lines.push(`Preflight: added ${report.addedDeps.length} missing package(s) to package.json (${report.addedDeps.join(', ')}) — without this the deploy would fail on missing modules.`);
  }
  if (report.bridgedFiles.length > 0) {
    lines.push(`Preflight: placed ${report.bridgedFiles.length} file(s) where the compiler looks for them (${report.bridgedFiles.slice(0, 4).join(', ')}${report.bridgedFiles.length > 4 ? ', …' : ''}).`);
  }
  if (report.secretFindings.length > 0) {
    const shown = report.secretFindings.slice(0, 3).map((s) => `${s.pattern} in ${s.path}`).join('; ');
    lines.push(`Preflight: found ${report.secretFindings.length} hardcoded secret pattern(s) (${shown}${report.secretFindings.length > 3 ? ', …' : ''}) — flagged for review. Real keys belong in environment variables, never in code.`);
  }
  if (lines.length === 0 && report.warnings.length === 0) {
    lines.push('Preflight: all imports and packages check out.');
  }
  return lines;
}
