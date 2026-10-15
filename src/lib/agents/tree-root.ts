/**
 * Tree-root declaration + single-tree collapse.
 *
 * The disease (SquishDough autopsy, Oct 14-15 2026): codegen models write
 * BOTH app/ and src/app/ trees no matter what the prompt says (DB ground
 * truth: SquishDough 3src/7root, ChefDrop 21src/11root, GroomGo 4src/5root,
 * NightOwl 4src/1root). Next.js serves the ROOT app/ tree when both exist
 * and silently ignores src/app — so a build whose real code is split across
 * trees ships half-dead routes, and a stub page in the wrong tree can
 * shadow the customer's real homepage with their raw prompt as the h1.
 *
 * The cure has two halves:
 *   1. DECLARATION — spec.appTreeRoot, set at plan time, read by every seam
 *      (codegen prompts, scaffolds, styling, export, modify) through
 *      resolveTreeRoot(). Platform default is ROOT app/: it matches Next's
 *      precedence, the shipped tsconfig alias (@/* → ./*), and needs zero
 *      migration for root-app builds like SquishDough.
 *   2. COLLAPSE — before any scaffold/integrity pass runs, fold the file
 *      set into the declared tree: hard stubs (scaffold placeholders) are
 *      dropped unconditionally, orphan files from the other tree move into
 *      the declared tree, conflicts resolve stub-loses-then-declared-wins,
 *      and import specifiers that still point at the old tree are remapped.
 *      Runs BEFORE preflight + import-integrity so those passes repair any
 *      casualties of the move instead of bridging INTO a dead tree.
 *
 * Stub detection is content-based, not agent-tag-based: the Oct 14 restore
 * re-tagged files (both SquishDough twins say agent "rune"), and the killer
 * stubs carry unambiguous fingerprints — the scaffold's "Built with BoDiGi
 * 2.0" and import-integrity's "stub: referenced but never generated".
 * Danger: a resolving import is invisible to integrity checks when it
 * resolves TO a stub (SquishDough's layout imported the 43-byte stub
 * globals.css and every check passed while the app shipped unstyled).
 */

import type { GeneratedFile } from './types';

export type AppTreeRoot = 'app' | 'src/app';

/** Platform default tree: root app/. Next precedence + shipped tsconfig. */
export const PLATFORM_TREE_ROOT: AppTreeRoot = 'app';

/** Read the declaration off specs, falling back to the platform default. */
export function resolveTreeRoot(specs?: { appTreeRoot?: string | null } | null): AppTreeRoot {
  return specs?.appTreeRoot === 'src/app' ? 'src/app' : PLATFORM_TREE_ROOT;
}

/** Directory prefix for a tree root ('app' or 'src/app'). */
export function treeDir(root: AppTreeRoot): string {
  return root === 'src/app' ? 'src/app' : 'app';
}

function otherTreeDir(root: AppTreeRoot): string {
  return root === 'src/app' ? 'app' : 'src/app';
}

function isInTree(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + '/');
}

/**
 * Hard stub: a small file carrying a known scaffold fingerprint. These are
 * placeholders by construction — safe to drop unconditionally because the
 * scaffold + import-integrity passes re-create whatever is still needed,
 * at the declared path, with proper content.
 *
 * Two fingerprint classes, gated differently:
 *  - the import-integrity marker is stub-by-construction ANYWHERE it
 *    appears (no real file is ever written with that exact comment);
 *  - 'Built with BoDiGi 2.0' only marks a stub inside an app tree — a
 *    small components/footer.tsx quoting it is free-tier BRANDING, real
 *    content that must survive.
 * Both are size-capped so a real file that quotes a fingerprint inside a
 * substantial body is never mistaken for a stub.
 */
export function isHardStub(f: { path: string; content: string }): boolean {
  if (f.content.length > 1500) return false;
  if (f.content.includes('stub: referenced but never generated')) return true;
  const inAppTree = f.path.startsWith('app/') || f.path.startsWith('src/app/');
  return inAppTree && f.content.includes('Built with BoDiGi 2.0');
}

/**
 * Soft stub: scaffold-owned (devops) small file. Only a conflict tiebreak —
 * never grounds for dropping a file on its own (the design-personality
 * globals.css is devops-owned and must survive).
 */
function isSoftStub(f: { content: string; agent?: string }): boolean {
  return f.agent === 'devops' && f.content.length < 1500;
}

export interface CollapseResult {
  files: GeneratedFile[];
  moved: Array<{ from: string; to: string }>;
  dropped: Array<{ path: string; reason: string }>;
  remapped: Array<{ path: string; from: string; to: string }>;
}

const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

function resolveRelative(fromDir: string, spec: string): string {
  const parts = fromDir.split('/').filter(Boolean);
  for (const p of spec.split('/')) {
    if (p === '.' || p === '') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return parts.join('/');
}

function toRelativeSpec(fromDir: string, target: string): string {
  const from = fromDir.split('/').filter(Boolean);
  const to = target.split('/').filter(Boolean);
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  const rel = [...from.map(() => '..'), ...to].join('/');
  return rel.startsWith('..') ? rel : './' + rel;
}

/** Import-spec shapes: static, side-effect, re-export, dynamic. */
const SPEC_RES = [
  /(\bimport\s+(?:type\s+)?[^;'"\n]+?\s+from\s+)(['"])([^'"]+)\2/g,
  /(\bexport\s+[^;'"\n]+?\s+from\s+)(['"])([^'"]+)\2/g,
  /(\bimport\s*)(['"])([^'"]+)\2/g,
  /(\bimport\(\s*)(['"])([^'"]+)\2(\s*\))/g,
];

/**
 * Fold a (possibly dual-tree) file set into the declared tree.
 * Pure: returns a new array; the input is not mutated.
 */
export function collapseToSingleTree(input: GeneratedFile[], root: AppTreeRoot): CollapseResult {
  const declared = treeDir(root);
  const other = otherTreeDir(root);
  const aliasBase = root === 'app' ? '' : 'src/'; // tsconfig @/* target for this root

  const moved: CollapseResult['moved'] = [];
  const dropped: CollapseResult['dropped'] = [];
  const remapped: CollapseResult['remapped'] = [];

  // Phase 1 — hard stubs leave both trees unconditionally.
  const survivors: GeneratedFile[] = [];
  for (const f of input) {
    if (isHardStub(f)) {
      dropped.push({ path: f.path, reason: 'scaffold stub (fingerprint)' });
      continue;
    }
    survivors.push(f);
  }

  // Phase 2 — move other-tree files into the declared tree; on conflict the
  // soft stub loses, otherwise the declared twin wins and the loss is logged.
  const out: GeneratedFile[] = [];
  const byPath = new Map<string, GeneratedFile>();
  const keep = (f: GeneratedFile) => {
    // Duplicate-row canonicalization (save-seam hazard, proof build Oct 15:
    // project_files carried 2x rows for package.json, app/page.tsx, ...).
    // Identical content: drop the copy. Differing content: later row wins
    // (load order is append order), logged loudly — never silently.
    const existing = byPath.get(f.path);
    if (existing) {
      if (existing.content === f.content) {
        dropped.push({ path: f.path, reason: 'duplicate row, identical content (save-seam hazard)' });
        return;
      }
      dropped.push({ path: f.path, reason: 'duplicate path, differing content — kept later row (save-seam hazard)' });
      out[out.indexOf(existing)] = f;
      byPath.set(f.path, f);
      return;
    }
    byPath.set(f.path, f);
    out.push(f);
  };
  for (const f of survivors) {
    if (!isInTree(f.path, other)) {
      keep(f);
      continue;
    }
    const target = declared + f.path.slice(other.length);
    const twin = byPath.get(target);
    if (!twin) {
      const nf = { ...f, path: target };
      moved.push({ from: f.path, to: target });
      keep(nf);
    } else if (isSoftStub(twin) && !isSoftStub(f)) {
      const nf = { ...f, path: target };
      out[out.indexOf(twin)] = nf;
      byPath.set(target, nf);
      moved.push({ from: f.path, to: target });
      dropped.push({ path: twin.path, reason: 'declared twin was scaffold filler — real file took its place' });
    } else {
      dropped.push({ path: f.path, reason: `conflict — kept declared twin ${target}` });
    }
  }

  // Phase 3 — remap import specifiers in declared-tree files that still
  // point at the collapsed tree (stale by definition after the move).
  const isCode = (p: string) => /\.(tsx|ts|jsx|js|mjs|css)$/.test(p);
  for (const f of out) {
    if (!isCode(f.path) || !isInTree(f.path, declared)) continue;
    const fromDir = dirOf(f.path);
    let content = f.content;
    for (const re of SPEC_RES) {
      re.lastIndex = 0;
      content = content.replace(re, (match, pre: string, quote: string, spec: string, post?: string) => {
        let resolved: string | null = null;
        let makeSpec: ((target: string) => string) | null = null;
        if (spec.startsWith('.')) {
          const abs = resolveRelative(fromDir, spec);
          if (isInTree(abs, other)) resolved = abs;
          makeSpec = (target) => toRelativeSpec(fromDir, target);
        } else if (spec.startsWith('@/')) {
          const abs = aliasBase + spec.slice(2);
          if (isInTree(abs, other)) resolved = abs;
          makeSpec = (target) => '@/' + (root === 'app' ? target : target.replace(/^src\//, ''));
        }
        if (!resolved || !makeSpec) return match;
        const target = declared + resolved.slice(other.length);
        const nextSpec = makeSpec(target);
        if (nextSpec === spec) return match;
        remapped.push({ path: f.path, from: spec, to: nextSpec });
        return `${pre}${quote}${nextSpec}${quote}${post ?? ''}`;
      });
    }
    if (content !== f.content) {
      const idx = out.indexOf(f);
      out[idx] = { ...f, content };
    }
  }

  return { files: out, moved, dropped, remapped };
}
