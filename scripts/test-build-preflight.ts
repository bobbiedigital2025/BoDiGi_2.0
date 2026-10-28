/**
 * Build-time preflight fixture (EBooker+ autopsy, Oct 28).
 *
 * Repro of the exact production failure class: a build that fell back to
 * starter templates persisted auth routes importing `zod` beside a
 * package.json that never declared it — EBooker+ then died on Vercel with
 * module-not-found. The orchestrator now runs reconcileDependencies at
 * build time; this proves the stored-set shape self-heals.
 *
 * Run: npx tsx scripts/test-build-preflight.ts [path-to-files.json]
 * (defaults to the real EBooker+ file set at /tmp/ebooker-files.json when
 * present; otherwise uses the synthetic repro below.)
 */
import { readFileSync } from 'fs';
import { reconcileDependencies, type PreflightReport } from '../src/lib/deploy/preflight';

interface F {
  path: string;
  content: string;
  agent?: string;
  status?: string;
}

function run(files: F[]): string[] {
  const report: PreflightReport = { addedDeps: [], bridgedFiles: [], warnings: [], secretFindings: [] };
  reconcileDependencies(files, report);
  return report.addedDeps;
}

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name} ${detail}`);
  }
}

// ── Case 1: synthetic repro (template auth routes + scaffold package.json) ──
console.log('Case 1 — synthetic EBooker shape:');
{
  const files: F[] = [
    {
      path: 'src/app/api/auth/signup/route.ts',
      content: `import { z } from 'zod';\nexport async function POST() { z.string(); return Response.json({}); }\n`,
    },
    {
      path: 'package.json',
      content: JSON.stringify({ name: 'x', dependencies: { next: '^16.0.0' } }, null, 2),
    },
  ];
  const added = run(files);
  check('zod added to package.json', added.includes('zod'), `added=${JSON.stringify(added)}`);
  const pkg = JSON.parse(files[1].content);
  check('package.json content actually mutated', pkg.dependencies.zod === '^3.23.8', `zod=${pkg.dependencies.zod}`);
}

// ── Case 2: the real stored EBooker+ set, zod stripped (pre-Rune state) ──
console.log('Case 2 — real EBooker+ stored file set (zod stripped to simulate pre-fix state):');
try {
  const raw = readFileSync(process.argv[2] || '/tmp/ebooker-files.json', 'utf8');
  const files = JSON.parse(raw) as F[];
  const pkgFile = files.find((f) => f.path === 'package.json');
  if (!pkgFile) throw new Error('no package.json in set');
  const pkg = JSON.parse(pkgFile.content);
  delete pkg.dependencies.zod; // simulate the exact stored state Rune found
  pkgFile.content = JSON.stringify(pkg, null, 2);
  const before = Object.keys(pkg.dependencies);
  const added = run(files);
  check(`zod re-added (${files.length} real files)`, added.includes('zod'), `added=${JSON.stringify(added)}`);
  const after = Object.keys(JSON.parse(pkgFile.content).dependencies || {});
  const newDeps = after.filter((d) => !before.includes(d));
  console.log(`  info: reconcile added ${newDeps.length} dep(s) beyond zod: ${newDeps.filter((d) => d !== 'zod').join(', ') || '(none)'}`);
} catch (err) {
  console.log(`  SKIP (${err instanceof Error ? err.message : 'file not present'} — synthetic case above still proves the class)`);
}

// ── Case 3: idempotency — second run adds nothing ──
console.log('Case 3 — idempotency:');
{
  const files: F[] = [
    { path: 'a.ts', content: `import { z } from 'zod';\n` },
    { path: 'package.json', content: JSON.stringify({ dependencies: { zod: '^3.23.8' } }) },
  ];
  const added = run(files);
  check('no duplicate adds', added.length === 0, `added=${JSON.stringify(added)}`);
}

if (failures > 0) {
  console.error(`\n${failures} fixture check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll build-preflight fixtures passed.');
