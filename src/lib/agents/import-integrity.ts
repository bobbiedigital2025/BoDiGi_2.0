/**
 * Import integrity — the deterministic safety net for generated code.
 *
 * Night Owl autopsy (Sept 29 2026): the frontend agent imported
 * `@/components/TaskCard` and `@/components/Countdown` without ever
 * writing those files. The build compiled, then Vercel's tsc rejected it.
 * Worse: `@/components/ui/*` is imported by our OWN default templates and
 * was never created by anything — every generated app carried the disease.
 *
 * This module scans the full file set, resolves every `@/...` and relative
 * import against it, and for anything missing injects a typed, compiling
 * stub — so every export is buildable by construction. Stubs are logged
 * loudly: they are evidence of an agent miss, not a quiet patch-over.
 */

export interface ImportIntegrityFile {
  path: string;
  content: string;
  agent?: string;
  status?: string;
}

const IMPORT_RE = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /import\s+['"]([^'"]+)['"]/g;

function candidates(resolvedNoExt: string): string[] {
  return [
    resolvedNoExt,
    `${resolvedNoExt}.tsx`,
    `${resolvedNoExt}.ts`,
    `${resolvedNoExt}.jsx`,
    `${resolvedNoExt}.js`,
    `${resolvedNoExt}.css`,
    `${resolvedNoExt}/index.tsx`,
    `${resolvedNoExt}/index.ts`,
  ];
}

function resolveSpec(spec: string, fromPath: string): string | null {
  if (spec.startsWith('@/')) return `src/${spec.slice(2)}`;
  if (spec.startsWith('.')) {
    const dir = fromPath.split('/').slice(0, -1);
    for (const part of spec.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') dir.pop();
      else dir.push(part);
    }
    return dir.join('/');
  }
  return null; // npm package — out of scope
}

/** Parse the imported bindings from an import clause: default + named. */
function parseBindings(clause: string): { defaultName: string | null; named: string[] } {
  clause = clause.trim();
  if (!clause || clause.startsWith('type ')) clause = clause.replace(/^type\s+/, '');
  let defaultName: string | null = null;
  const named: string[] = [];
  const braceMatch = clause.match(/\{([\s\S]*?)\}/);
  if (braceMatch) {
    for (const part of braceMatch[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && !name.startsWith('type ')) named.push(name);
    }
    clause = clause.replace(/\{[\s\S]*?\}/, '').replace(/,\s*$/, '').trim();
  }
  if (clause && !clause.startsWith('*')) {
    defaultName = clause.replace(/,\s*$/, '').trim() || null;
  }
  return { defaultName, named };
}

function stubFor(name: string): string {
  if (/^[A-Z]/.test(name)) {
    // Component-ish: render children in a div (button for Button-likes) so
    // pages still display something sane. Explicit any props — compiles under strict.
    const tag = /button/i.test(name) ? 'button' : 'div';
    return `export function ${name}(props: any) {\n  return <${tag} className={props?.className}>{props?.children}</${tag}>;\n}\n`;
  }
  return `export function ${name}(...args: any[]) {\n  return null;\n}\n`;
}

/**
 * Scan files for imports that don't resolve inside the set; inject stubs.
 * Mutates and returns the same array. `log` receives one line per injected
 * stub — these are agent misses and should stay visible in build logs.
 */
export function ensureImportIntegrity(
  files: ImportIntegrityFile[],
  log?: (msg: string) => void
): ImportIntegrityFile[] {
  const paths = () => new Set(files.map(f => f.path));

  // Missing stub files to create: target path -> { named:Set, default:boolean }
  const missing = new Map<string, { named: Set<string>; needsDefault: boolean; css: boolean }>();

  const consider = (spec: string, clause: string | null, fromPath: string) => {
    const base = resolveSpec(spec, fromPath);
    if (!base) return;
    const set = paths();
    if (candidates(base).some(c => set.has(c))) return;
    // Don't double-create; merge bindings if several files import the same module
    const entry = missing.get(base) || { named: new Set<string>(), needsDefault: false, css: false };
    if (/\.css$/.test(spec)) {
      entry.css = true;
    } else if (clause) {
      const { defaultName, named } = parseBindings(clause);
      if (defaultName) entry.needsDefault = true;
      for (const n of named) entry.named.add(n);
    }
    missing.set(base, entry);
  };

  for (const f of files) {
    if (!/\.(tsx?|jsx?)$/.test(f.path)) continue;
    for (const m of f.content.matchAll(IMPORT_RE)) consider(m[2], m[1], f.path);
    for (const m of f.content.matchAll(SIDE_EFFECT_RE)) consider(m[1], null, f.path);
  }

  for (const [base, entry] of missing) {
    if (entry.css) {
      files.push({ path: base.endsWith('.css') ? base : `${base}.css`, content: '/* stub: referenced but never generated */\n', agent: 'devops', status: 'generated' });
      log?.(`AGENT-MISS: injected empty stylesheet ${base}.css (an agent imported it but never wrote it)`);
      continue;
    }
    // Prefer .tsx — stubs may contain JSX
    const path = `${base}.tsx`;
    const parts: string[] = [
      `// AUTO-GENERATED STUB — an agent imported this module but never created it.`,
      `// Renders minimal markup so the build compiles; regenerate or hand-edit for real behavior.`,
      ``,
    ];
    for (const n of entry.named) parts.push(stubFor(n));
    if (entry.needsDefault) {
      const first = [...entry.named][0];
      if (first && /^[A-Z]/.test(first)) {
        parts.push(`export default ${first};\n`);
      } else {
        parts.push(`export default function Default(props: any) {\n  return <div className={props?.className}>{props?.children}</div>;\n}\n`);
      }
    }
    // No bindings parsed (namespace/empty import) — still need a file to resolve
    if (entry.named.size === 0 && !entry.needsDefault) {
      parts.push(`export default function Stub(props: any) {\n  return <div className={props?.className}>{props?.children}</div>;\n}\n`);
    }
    files.push({ path, content: parts.join('\n'), agent: 'devops', status: 'generated' });
    log?.(`AGENT-MISS: injected stub ${path} (an agent imported it but never wrote it)`);
  }

  return files;
}
