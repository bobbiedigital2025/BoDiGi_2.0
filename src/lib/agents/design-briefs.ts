/**
 * Design briefs — the cure for "every BoDiGi app looks the same."
 *
 * Each app gets one design personality, chosen by a stable hash of its
 * idea+name (same app → same personality every rebuild, different apps →
 * different worlds). The brief is injected into the frontend codegen prompt
 * as binding direction: colors, surfaces, type feel, and signature details.
 */

interface DesignPersonality {
  name: string;
  direction: string;
}

const PERSONALITIES: DesignPersonality[] = [
  {
    name: 'Neon Night',
    direction: `Deep black background (#0a0a0f), neon accent gradient (electric violet #8b5cf6 → hot pink #ec4899), glassy panels (bg-white/5, border-white/10, backdrop-blur), glowing primary buttons (shadow-lg shadow-fuchsia-500/25). Feels like a futuristic console.`,
  },
  {
    name: 'Editorial Serif',
    direction: `Warm paper background (#faf8f5), ink text (#1a1a1a), serif display headings (font-serif, tracking-tight), hairline dividers (border-neutral-200), generous whitespace (py-16 sections), a single restrained accent (deep forest #166534 or oxblood #7f1d1d). Feels like a printed journal.`,
  },
  {
    name: 'Soft Pastel',
    direction: `Light background (#fdfcff), pastel accent washes (lavender #ede9fe, peach #ffe4d6, mint #d1fae5), rounded-3xl cards with soft shadows (shadow-xl shadow-purple-100), dark slate text (#334155), playful pill badges. Feels friendly and calm.`,
  },
  {
    name: 'Brutalist',
    direction: `Stark white background, thick black borders (border-2 border-black), hard shadows (shadow-[4px_4px_0_#000]), monospace accents (font-mono), uppercase micro-labels, zero gradients, one loud highlight color (safety yellow #facc15 or cyan #06b6d4). Feels bold and unapologetic.`,
  },
  {
    name: 'Warm Earth',
    direction: `Warm cream background (#faf6f0), terracotta and amber accents (#c2410c, #d97706), textured-feeling cards (bg-white border border-orange-100 rounded-2xl), cozy illustrations-in-words (emoji allowed sparingly), soft brown text (#44403c). Feels handmade and warm.`,
  },
  {
    name: 'Midnight Minimal',
    direction: `Near-black background (#09090b), zinc text hierarchy (text-zinc-200 / text-zinc-500), ONE signature accent used sparingly (emerald #10b981 OR amber #f59e0b — pick one), thin borders (border-zinc-800), lots of empty space, no gradients. Feels like a precision instrument.`,
  },
  {
    name: 'Retro Terminal',
    direction: `Dark background (#0c0f0a), phosphor green primary (#4ade80) with amber secondary (#fbbf24), monospace everything (font-mono), scanline-thin dividers (border-green-900/40), terminal-style panels (border border-green-800/50 rounded-none), blinking-cursor details where fitting. Feels like a beloved dev machine.`,
  },
  {
    name: 'Aurora Glass',
    direction: `Deep navy background (#070b14), aurora gradient accents (cyan #22d3ee → violet #a78bfa → rose #fb7185) used in glows and key highlights, frosted glass cards (bg-slate-900/60 backdrop-blur-xl border border-white/10), subtle radial light from the top. Feels like the northern lights.`,
  },
];

/** Stable string hash → personality index. Same app always gets the same world. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns the design direction block for the frontend codegen prompt.
 * Seed should be stable per app (name + idea).
 */
export function designBriefFor(seed: string): string {
  const p = PERSONALITIES[hashString(seed) % PERSONALITIES.length];
  return `DESIGN DIRECTION — "${p.name}" (binding, follow it exactly):
${p.direction}
Every BoDiGi-built app has its OWN visual identity — this app's identity is "${p.name}". Do NOT default to the BoDiGi platform look (black + violet/fuchsia gradients) unless that IS the direction above. Apply the direction to backgrounds, cards, buttons, badges, and typography consistently across every page.`;
}
