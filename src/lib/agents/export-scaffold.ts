/**
 * Export scaffold guarantee.
 *
 * The pipeline runs ensureScaffoldFiles() at build completion — but only
 * for builds finished after that guarantee existed (Sep 26). Projects built
 * earlier (e.g. Night Owl, Sep 27... actually pre-dating the guarantee)
 * can sit in project_files WITHOUT package.json/tsconfig/.gitignore, and
 * every export path (GitHub push, ZIP download) faithfully ships the
 * broken set: Vercel then fails with "No Next.js version detected".
 *
 * Export is the last line of defense: any project leaving BoDiGi must be
 * deployable, no matter when it was built. Add missing scaffold files here,
 * at export time, identical in content to the orchestrator's versions.
 */

import type { GeneratedFile } from './types';
import { ensureImportIntegrity } from './import-integrity';
import { ensureStylingScaffold } from './styling-scaffold';
import { runPreflight, preflightLogLines } from '../deploy/preflight';
import { collapseToSingleTree, resolveTreeRoot, treeDir } from './tree-root';

export function ensureExportScaffold(projectName: string, files: GeneratedFile[], seed?: string): GeneratedFile[] {
  // Single-tree guarantee FIRST, before anything else touches the set:
  // legacy projects carry both app/ and src/app/ trees, and Next serves
  // root app/ while IGNORING src/app — a split export ships half-dead
  // routes, and a stub page in the served tree shows the customer their
  // raw prompt as the homepage. Collapse to the declared tree (stub-loses,
  // orphan-move, import remap, dupe canonicalization), then scaffold.
  const treeRoot = resolveTreeRoot(null); // platform default 'app' — export has no specs in scope
  const appDir = treeDir(treeRoot);
  const collapse = collapseToSingleTree(files, treeRoot);
  for (const m of collapse.moved) console.warn(`Export tree collapse: moved ${m.from} → ${m.to}`);
  for (const d of collapse.dropped) console.warn(`Export tree collapse: dropped ${d.path} (${d.reason})`);
  for (const r of collapse.remapped) console.warn(`Export tree collapse: remapped import in ${r.path}: ${r.from} → ${r.to}`);
  const base = collapse.files;

  const has = (path: string) => base.some((f) => f.path === path);
  const added: GeneratedFile[] = [];
  const add = (path: string, content: string) => {
    added.push({ path, content, agent: 'devops', status: 'generated' });
  };

  if (!has('package.json')) {
    add('package.json', JSON.stringify({
      name: projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bodigi-app',
      version: '0.1.0',
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
      dependencies: {
        next: '^16.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        '@supabase/supabase-js': '^2.45.0',
        stripe: '^16.0.0',
      },
      devDependencies: {
        typescript: '^5.6.0',
        '@types/node': '^22.0.0',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
      },
    }, null, 2) + '\n');
  }

  if (!has('tsconfig.json')) {
    add('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }, null, 2) + '\n');
  }

  if (!has('.gitignore')) {
    add('.gitignore', ['node_modules', '.next', '.env*.local', '.vercel', '*.tsbuildinfo', 'next-env.d.ts', ''].join('\n'));
  }

  // Styling backbone: every export must actually RENDER its design
  // (globals.css + tailwind config + deps). Seed matches the codegen
  // design-brief seed so the CSS personality matches the prompt's.
  const all = [...base, ...added];

  // Root layout/page: Next requires a root layout; the import-integrity
  // pass can't see these (nothing imports them), so old builds missing
  // them exported unbuildable. Same guarantee as the orchestrator path.
  const appNameSafe = projectName.replace(/'/g, "");
  if (!all.some(f => f.path === 'src/app/layout.tsx') && !all.some(f => f.path === 'app/layout.tsx')) {
    all.push({ path: `${appDir}/layout.tsx`, content: `import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '${appNameSafe}',
  description: 'Built with BoDiGi 2.0',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`, agent: 'devops', status: 'generated' });
    console.warn('Export scaffold: added missing root layout.tsx');
  }
  if (!all.some(f => f.path === 'src/app/page.tsx') && !all.some(f => f.path === 'app/page.tsx')) {
    all.push({ path: `${appDir}/page.tsx`, content: `export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>${appNameSafe}</h1>
      <p>Built with BoDiGi 2.0</p>
    </main>
  );
}
`, agent: 'devops', status: 'generated' });
    console.warn('Export scaffold: added missing root page.tsx');
  }

  ensureStylingScaffold(seed || projectName, all, undefined, treeRoot);

  // Preflight: bridge cross-tree modules to where the compiler looks and
  // declare every imported package in package.json — BEFORE the stub pass,
  // so a file that exists in the other tree gets bridged, not stubbed
  // (SquishDough: zod/lucide-react undeclared; ui components across trees).
  const preflight = runPreflight(all);
  for (const line of preflightLogLines(preflight)) console.warn(`Export ${line}`);

  // Import integrity: any module imported but never written gets a typed stub,
  // so every export compiles no matter what the agents missed.
  ensureImportIntegrity(all);
  return all;
}
