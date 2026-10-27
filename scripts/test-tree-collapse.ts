/**
 * scripts/test-tree-collapse.ts — the split-tree collapse fixture suite.
 *
 * 26 assertions: synthetic cases (declaration, orphan moves, hard-stub drops,
 * branding safety, duplicate twins, import remapping) + SquishDough's REAL
 * production set (pass the JSON path as argv[2], pulled from project_files
 * deduped by longest content — save-race rows can be truncated).
 *
 * Run: npx tsx scripts/test-tree-collapse.ts /tmp/squishdough-set.json
 * (Group F is skipped — 19/19 — when no set is provided.)
 *
 * Recreated Oct 26 from the split-tree case study; the original suite ran
 * from scratch and was never committed. This one stays.
 */
import * as fs from 'fs';
import {
  collapseToSingleTree,
  resolveTreeRoot,
  isHardStub,
  PLATFORM_TREE_ROOT,
  type AppTreeRoot,
} from '../src/lib/agents/tree-root';
import type { GeneratedFile, AgentRole } from '../src/lib/agents/types';

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}
function f(path: string, content: string, agent: AgentRole = 'frontend'): GeneratedFile {
  return { path, content, agent, status: 'generated' };
}
const paths = (files: GeneratedFile[]) => files.map((x) => x.path);

console.log('Group A — declaration + clean no-op');
assert(PLATFORM_TREE_ROOT === 'app', 'platform default tree is root app/');
assert(resolveTreeRoot(undefined) === 'app', 'no declaration resolves to platform default');
assert(resolveTreeRoot({ appTreeRoot: 'src/app' }) === 'src/app' && resolveTreeRoot({ appTreeRoot: 'garbage' }) === 'app', 'src/app honored, garbage falls back to default');

{
  const clean = [f('app/page.tsx', 'export default function P(){return null}'), f('app/layout.tsx', 'export default function L(){return null}'), f('package.json', '{}', 'devops')];
  const r = collapseToSingleTree(clean, 'app');
  assert(r.moved.length === 0 && r.dropped.length === 0 && r.remapped.length === 0, 'clean single-tree set: no moves, drops, or remaps');
  assert(paths(r.files).sort().join() === paths(clean).sort().join(), 'clean set unchanged');
}

console.log('Group B — orphan moves');
{
  const r = collapseToSingleTree([f('src/app/page.tsx', 'REAL')], 'app');
  assert(paths(r.files).includes('app/page.tsx') && r.files.find((x) => x.path === 'app/page.tsx')?.content === 'REAL', 'orphan in src/app moves to declared app/ with content intact');
  assert(r.moved.length === 1 && r.moved[0].from === 'src/app/page.tsx' && r.moved[0].to === 'app/page.tsx', 'move is logged from/to');
}
{
  const r = collapseToSingleTree([f('src/app/games/board.tsx', 'GAME'), f('src/app/games/piece.tsx', 'PIECE')], 'app');
  assert(paths(r.files).includes('app/games/board.tsx') && paths(r.files).includes('app/games/piece.tsx'), 'whole subtree moves preserving relative structure');
}
{
  const r = collapseToSingleTree([f('app/page.tsx', 'REAL')], 'src/app');
  assert(paths(r.files).includes('src/app/page.tsx'), 'inverted declaration: root-app orphan moves into declared src/app');
}
{
  const r = collapseToSingleTree([f('src/app/page.tsx', 'X'), f('components/ui/button.tsx', 'BTN'), f('package.json', '{}', 'devops')], 'app');
  const nonApp = r.files.filter((x) => !x.path.startsWith('app/') && !x.path.startsWith('src/app/'));
  assert(nonApp.some((x) => x.path === 'components/ui/button.tsx') && nonApp.some((x) => x.path === 'package.json'), 'non-app files untouched by moves');
}

console.log('Group C — hard stub drops + branding safety');
assert(isHardStub({ path: 'src/app/page.tsx', content: '/* stub: referenced but never generated */' }), 'import-integrity marker is a hard stub anywhere');
assert(isHardStub({ path: 'app/page.tsx', content: 'export default function P(){return <p>Built with BoDiGi 2.0</p>}' }), 'small app-tree fingerprint file is a hard stub');
assert(!isHardStub({ path: 'components/footer.tsx', content: 'Built with BoDiGi 2.0' }), 'branding OUTSIDE an app tree is never a stub');
{
  const big = 'const pad = "'.padEnd(1600, 'x') + '";\n// Built with BoDiGi 2.0\nexport default big;';
  assert(!isHardStub({ path: 'app/components/footer.tsx', content: big }), 'substantial app-tree file quoting the fingerprint survives the size cap');
}
{
  const r = collapseToSingleTree([f('app/page.tsx', '/* stub: referenced but never generated */'), f('app/real.tsx', 'REAL')], 'app');
  assert(!paths(r.files).includes('app/page.tsx') && r.dropped.some((d) => d.path === 'app/page.tsx'), 'hard stub drops unconditionally, with a logged reason');
}

console.log('Group D — duplicate twins');
{
  const r = collapseToSingleTree([f('app/page.tsx', 'DECLARED REAL'), f('src/app/page.tsx', 'OTHER')], 'app');
  assert(r.files.find((x) => x.path === 'app/page.tsx')?.content === 'DECLARED REAL', 'declared twin wins over other-tree twin');
}
{
  const r = collapseToSingleTree([f('app/globals.css', '/* devops stub */', 'devops'), f('src/app/globals.css', '.real{color:#fff}')], 'app');
  assert(r.files.find((x) => x.path === 'app/globals.css')?.content === '.real{color:#fff}', 'soft stub loses even from the declared tree — the real twin moves in');
}
{
  const r = collapseToSingleTree([f('app/globals.css', '.real{color:#fff}'), f('src/app/globals.css', '.other{color:#000}')], 'app');
  assert(r.files.find((x) => x.path === 'app/globals.css')?.content === '.real{color:#fff}' && r.dropped.some((d) => d.path === 'src/app/globals.css'), 'both-real twins: declared wins, other drops with reason');
}
{
  const r = collapseToSingleTree([f('app/page.tsx', 'A'.repeat(2000)), f('src/app/page.tsx', 'B'.repeat(2000))], 'app');
  assert(r.files.length === 1 && r.files[0].content === 'A'.repeat(2000), 'substantial twins still resolve one-wins (no silent merge)');
}

console.log('Group E — import remapping');
{
  // The real stale pattern: from the post-move dir (app/games), the specifier
  // must RESOLVE into the collapsed tree — '../../src/app/games/piece' →
  // src/app/games/piece. (One '../' would resolve to app/src/app/... — a
  // nonsense path, never in the other tree, nothing to remap.)
  const r = collapseToSingleTree([f('src/app/games/board.tsx', `import { piece } from '../../src/app/games/piece';`), f('src/app/games/piece.ts', 'export const piece = 1;')], 'app');
  const board = r.files.find((x) => x.path === 'app/games/board.tsx');
  assert(board?.content.includes("'../games/piece'") || board?.content.includes('./piece'), 'stale relative specifier rewritten to the collapsed tree');
  assert(r.remapped.length >= 1 && r.remapped[0].path === 'app/games/board.tsx' && r.remapped[0].to === './piece', 'remap is logged per file (from + to)');
}
{
  const r = collapseToSingleTree([f('src/app/page.tsx', `import Button from '@/components/ui/button';`)], 'app');
  assert(r.files.find((x) => x.path === 'app/page.tsx')?.content.includes("@/components/ui/button"), 'alias specifiers that already resolve outside the trees are left alone');
}
{
  const r = collapseToSingleTree([f('src/app/layout.tsx', `import './globals.css';`), f('src/app/globals.css', '.skin{}')], 'app');
  const layout = r.files.find((x) => x.path === 'app/layout.tsx');
  assert(layout?.content.includes(`import './globals.css'`), 'same-dir side-effect import stays wired after the move');
}
{
  const r = collapseToSingleTree([f('src/app/page.tsx', `const mod = import('./heavy.js');`), f('src/app/heavy.js', 'export default 1;')], 'app');
  assert(r.files.find((x) => x.path === 'app/page.tsx')?.content.includes(`import('./heavy.js')`), 'dynamic import stays resolvable after the move');
}

const sqPath = process.argv[2];
if (sqPath && fs.existsSync(sqPath)) {
  console.log('Group F — SquishDough REAL production set');
  const raw = JSON.parse(fs.readFileSync(sqPath, 'utf8')) as Array<{ path: string; content: string; agent: string; status: string }>;
  const input: GeneratedFile[] = raw.map((x) => ({ path: x.path, content: x.content, agent: (x.agent || 'frontend') as AgentRole, status: 'generated' }));
  assert(input.length >= 30, `set pulled intact (${input.length} files)`);
  const expectedDrops = input.filter((x) => isHardStub(x)).length;
  const r = collapseToSingleTree(input, resolveTreeRoot(null));
  assert(r.files.length === input.length - expectedDrops, `exactly the hard stubs drop (${expectedDrops}: ${r.dropped.map((d) => d.path).join(', ')})`);
  const game = input.filter((x) => x.content.length > 10000)[0];
  if (game) {
    const survived = r.files.find((x) => x.path === game.path) ?? r.files.find((x) => x.content === game.content);
    assert(!!survived && survived.content.length === game.content.length, `the big real file survives intact (${game.path}, ${game.content.length}B)`);
  } else { assert(false, 'expected a >10KB real file in the set'); }
  const realSkin = input.find((x) => (x.path.endsWith('globals.css')) && x.content.length > 800);
  const stubSkin = input.find((x) => x.path.endsWith('globals.css') && x.content.includes('stub: referenced but never generated'));
  if (realSkin && stubSkin) {
    const finalSkin = r.files.filter((x) => x.path.endsWith('globals.css'));
    assert(finalSkin.some((x) => x.content === realSkin.content) && !finalSkin.some((x) => x.content === stubSkin.content), 'real skin beats the stub by fingerprint');
  } else { assert(false, `expected real+stub skins (real=${!!realSkin}, stub=${!!stubSkin})`); }
  assert(r.files.every((x) => !x.path.startsWith('src/app/')), 'zero files left in the non-declared tree');
  assert(new Set(r.files.map((x) => x.path)).size === r.files.length, 'no path collisions in the result');
  assert(r.files.every((x) => !x.content.includes('stub: referenced but never generated')), 'no stub content survives anywhere');
} else {
  console.log('Group F — SKIPPED (no SquishDough set provided; pass the JSON path as argv[2] for all 26)');
}

console.log(`----\nRESULT: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
