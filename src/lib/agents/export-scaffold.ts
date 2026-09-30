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

export function ensureExportScaffold(projectName: string, files: GeneratedFile[], seed?: string): GeneratedFile[] {
  const has = (path: string) => files.some((f) => f.path === path);
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
  const all = [...files, ...added];
  ensureStylingScaffold(seed || projectName, all);

  // Import integrity: any module imported but never written gets a typed stub,
  // so every export compiles no matter what the agents missed.
  ensureImportIntegrity(all);
  return all;
}
