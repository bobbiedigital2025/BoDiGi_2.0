/**
 * Styling scaffold — the guarantee that a BoDiGi app ships with its design
 * actually WIRED, not just described in a prompt.
 *
 * Night Owl autopsy (Sept 29 2026, user report: "THE UI UX ISNT SOLID IT
 * SUX"): the generated pages used Tailwind classes, but the export had no
 * globals.css, no PostCSS config, and no tailwind dependency — every page
 * rendered as raw unstyled HTML. The design personalities only existed as
 * prompt words; nothing physical enforced them.
 *
 * This module fills the gap deterministically:
 *   1. globals.css carrying the app's design personality as real CSS
 *      (same stable seed as the codegen brief → same personality)
 *   2. postcss.config.mjs (Tailwind v4, matching the house pattern)
 *   3. tailwind deps in package.json
 *   4. layout.tsx imports globals.css
 *
 * It only fills gaps — files the agents wrote are never overwritten.
 */

import type { GeneratedFile } from './types';

interface PersonalitySkin {
  /** must match the personality name in design-briefs.ts order! */
  background: string;
  foreground: string;
  accent: string;
  fontStack: string;
  extraCss: string;
}

/**
 * Structured skins parallel to PERSONALITIES in design-briefs.ts —
 * SAME ORDER. The hash picks an index; both tables must agree on it.
 */
const SKINS: PersonalitySkin[] = [
  { // Neon Night
    background: '#0a0a0f', foreground: '#f5f3ff', accent: '#8b5cf6',
    fontStack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    extraCss: `body { background-image: radial-gradient(1000px 500px at 50% -10%, rgba(139,92,246,0.15), transparent 60%), radial-gradient(800px 400px at 80% 110%, rgba(236,72,153,0.12), transparent 60%); background-attachment: fixed; }`,
  },
  { // Editorial Serif
    background: '#faf8f5', foreground: '#1a1a1a', accent: '#166534',
    fontStack: 'Georgia, "Times New Roman", serif',
    extraCss: `h1, h2, h3 { letter-spacing: -0.02em; }`,
  },
  { // Soft Pastel
    background: '#fdfcff', foreground: '#334155', accent: '#a78bfa',
    fontStack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    extraCss: `body { background-image: radial-gradient(900px 500px at 10% -10%, rgba(237,233,254,0.8), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(255,228,214,0.7), transparent 60%); background-attachment: fixed; }`,
  },
  { // Brutalist
    background: '#ffffff', foreground: '#0a0a0a', accent: '#facc15',
    fontStack: '"Courier New", ui-monospace, monospace',
    extraCss: `h1, h2, h3 { text-transform: uppercase; letter-spacing: -0.03em; }`,
  },
  { // Warm Earth
    background: '#faf6f0', foreground: '#44403c', accent: '#c2410c',
    fontStack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    extraCss: `body { background-image: radial-gradient(900px 500px at 85% -10%, rgba(217,119,6,0.08), transparent 60%); background-attachment: fixed; }`,
  },
  { // Midnight Minimal
    background: '#09090b', foreground: '#e4e4e7', accent: '#10b981',
    fontStack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    extraCss: `::selection { background: #10b98133; }`,
  },
  { // Retro Terminal
    background: '#0c0f0a', foreground: '#4ade80', accent: '#fbbf24',
    fontStack: '"Courier New", ui-monospace, monospace',
    extraCss: `body::after { content: ''; position: fixed; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(74,222,128,0.03) 0 1px, transparent 1px 3px); }`,
  },
  { // Aurora Glass
    background: '#070b14', foreground: '#e2e8f0', accent: '#22d3ee',
    fontStack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    extraCss: `body { background-image: radial-gradient(1100px 550px at 50% -15%, rgba(34,211,238,0.12), transparent 55%), radial-gradient(900px 500px at 20% 115%, rgba(167,139,250,0.12), transparent 55%), radial-gradient(700px 400px at 85% 100%, rgba(251,113,133,0.08), transparent 55%); background-attachment: fixed; }`,
  },
];

/** Stable string hash — MUST match design-briefs.ts hashString. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function skinFor(seed: string): PersonalitySkin {
  return SKINS[hashString(seed) % SKINS.length];
}

function globalsCssFor(skin: PersonalitySkin): string {
  return `@import "tailwindcss";

:root {
  --background: ${skin.background};
  --foreground: ${skin.foreground};
  --accent: ${skin.accent};
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-accent: var(--accent);
}

html, body {
  background: var(--background);
  color: var(--foreground);
  min-height: 100vh;
}

body {
  font-family: ${skin.fontStack};
}

input, textarea, select {
  background: color-mix(in srgb, var(--foreground) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground) 15%, transparent);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: var(--foreground);
  font: inherit;
}

button { cursor: pointer; font: inherit; }

a { color: var(--accent); }

${skin.extraCss}
`;
}

const POSTCSS_CONFIG = `const config = {
  plugins: ["@tailwindcss/postcss"],
};
export default config;
`;

/**
 * Ensure the styling backbone exists in the file set. Mutates and returns
 * the array. Only creates missing files — agent-authored CSS is sacred.
 */
export function ensureStylingScaffold(
  seed: string,
  files: GeneratedFile[],
  log?: (msg: string) => void
): GeneratedFile[] {
  const has = (path: string) => files.some(f => f.path === path);
  const skin = skinFor(seed);

  // 1. package.json deps (the scaffold guarantee should have created one
  //    before we run; if not, skip dep patching rather than fabricate)
  const pkg = files.find(f => f.path === 'package.json');
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.content);
      parsed.dependencies = parsed.dependencies || {};
      parsed.devDependencies = parsed.devDependencies || {};
      let changed = false;
      if (!parsed.dependencies.tailwindcss && !parsed.devDependencies.tailwindcss) {
        parsed.dependencies.tailwindcss = '^4';
        changed = true;
      }
      if (!parsed.devDependencies['@tailwindcss/postcss'] && !parsed.dependencies['@tailwindcss/postcss']) {
        parsed.devDependencies['@tailwindcss/postcss'] = '^4';
        changed = true;
      }
      if (changed) {
        pkg.content = JSON.stringify(parsed, null, 2) + '\n';
        log?.('Styling scaffold: added tailwindcss + @tailwindcss/postcss to package.json');
      }
    } catch { log?.('Styling scaffold: package.json is malformed JSON — left untouched, build will surface it'); }
  }

  // 2. PostCSS config
  if (!has('postcss.config.mjs') && !has('postcss.config.js') && !has('postcss.config.cjs')) {
    files.push({ path: 'postcss.config.mjs', content: POSTCSS_CONFIG, agent: 'devops', status: 'generated' });
    log?.('Styling scaffold: added postcss.config.mjs (Tailwind v4)');
  }

  // 3. globals.css carrying the personality
  if (!has('src/app/globals.css')) {
    files.push({ path: 'src/app/globals.css', content: globalsCssFor(skin), agent: 'devops', status: 'generated' });
    log?.(`Styling scaffold: added globals.css with design personality skin`);
  }

  // 4. layout imports the stylesheet (only safe prepend — never rewrite).
  //    Accept any app-root layout (src/app or app, tsx/ts/jsx/js) — agents
  //    sometimes violate the src/ convention and an orphaned globals.css
  //    means an unstyled app. Require an actual import, not a comment.
  const layout = files.find(f => /(^|\/)app\/layout\.(tsx|ts|jsx|js)$/.test(f.path));
  if (layout && !/import\s+['"][^'"]*globals\.css['"]/.test(layout.content)) {
    const cssPath = layout.path.startsWith('src/') ? './globals.css' : './src/app/globals.css';
    layout.content = `import '${cssPath}';\n` + layout.content;
    log?.('Styling scaffold: wired globals.css into root layout');
  }

  return files;
}
