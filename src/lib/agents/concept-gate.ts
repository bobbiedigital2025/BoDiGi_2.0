/**
 * Concept Approval Gate — Bobbie's funnel catch (locked Oct 22, 2026).
 *
 * Her insight: the interview fed /api/generate SILENTLY — the founder never
 * approved the concept before the build burned. Her loop:
 *   idea → interview → team presents Concept Card → APPROVE or ITERATE
 *   → re-present → APPROVED → the build fires (server-enforced).
 *
 * One gate, two jobs (the weld is the point):
 *   1. APPROVAL  — nothing builds until the founder says yes.
 *   2. SAFETY    — the content classifier runs BEFORE the card is presented,
 *                  so adult/borderline content is caught pre-burn, at the
 *                  same seam instead of a second pass.
 *
 * Rules baked in (Oct 22 lock):
 *   - The gate never dead-ends: if the AI is down, the card falls back to a
 *     minimal card built from the brief text with zero AI calls.
 *   - Iterations carry forward unchanged elements explicitly — the founder
 *     keeps what they like and changes only what they name.
 *   - "If they don't care they'll approve the first offer" — zero friction for
 *     low-care founders, three saved rebuilds for picky ones.
 *   - Gate scope: standard idea path only. Template forks and admin bypass
 *     are exempt; the modify pass is classifier-welded but not gate-gated.
 */

import { callAI, hasAIKey } from './ai-client';

export type ConceptStatus =
  | 'drafting'    // card being drafted (transient — creation returns presented)
  | 'presented'   // card is on screen, awaiting approve/iterate
  | 'iterating'   // founder feedback being folded into the next card version
  | 'approved'    // founder said yes — build may fire
  | 'building'    // build launched, project linked
  | 'blocked'     // classifier: explicit adult content — no build, ever
  | 'flagged'     // classifier: borderline — card shown, build waits for admin clear
  | 'cancelled';  // founder abandoned the concept pre-build

export type ClassifierVerdict = 'pending' | 'clean' | 'borderline' | 'blocked';

/** The one-screen scannable Concept Card (RUNE shape notes: name, tagline,
 *  pitch, screens, must-haves, and the NOT-building list — the NOT list is
 *  what saves picky founders three rebuilds). */
export interface ConceptCard {
  name: string;
  tagline: string;
  pitch: string;
  /** 3-5 one-line screen descriptions, in walkthrough order */
  screens: string[];
  /** 2-4 v1 features that matter */
  mustHaves: string[];
  /** 2-3 things this build deliberately does NOT include */
  notBuilding: string[];
  /** design vibe in one line */
  look: string;
}

export interface ClassifierResult {
  verdict: ClassifierVerdict;
  reason: string;
}

export interface IterationRecord {
  feedback: string;
  card: ConceptCard;
  at: string;
}

// ---------------------------------------------------------------------------
// JSON extraction — model output is fenced or wrapped in prose; find the
// outermost object and parse defensively. Never throws (returns null).
// ---------------------------------------------------------------------------
function extractJSON(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
  return cleaned.length > 0 ? cleaned : fallback;
}

// ---------------------------------------------------------------------------
// Content classifier — runs BEFORE the card is presented. One gate, two jobs.
// Explicit adult content is blocked outright; borderline content is flagged
// for human (admin) review. Everything else is clean.
//
// Fail-open policy: if the classifier call errors (no key, network, bad
// output), we log loudly and treat the content as clean. The gate never
// dead-ends a real founder because a safety probe hiccuped; misses surface
// in the admin audit instead. (Same posture as secret-scan v1 — log, then
// tighten under RUNE's review.)
// ---------------------------------------------------------------------------
const CLASSIFIER_SYSTEM_PROMPT = `You are the BoDiGi content safety classifier. You review app ideas BEFORE an AI team builds them, so bad content never burns a build.

Return ONLY a JSON object: {"verdict": "clean" | "borderline" | "blocked", "reason": "one short sentence"}

Rules:
- "blocked" — the idea is explicit adult/pornographic content, sexual services, or content sexualizing minors (always blocked, no exceptions).
- "borderline" — sexually suggestive but not explicit, gambling platforms, weapons sales, drug marketplaces, or anything a reasonable human should double-check before an AI team builds it in public.
- "clean" — everything else, including ordinary business, social, health, finance, education, and community apps. When genuinely ambiguous, prefer "borderline" over "blocked" — a human reviews borderline; blocked has no appeal path.
- NEVER block ordinary apps. A dating app is clean. A fitness app is clean. A medical-info app is clean.
- The reason is one short plain sentence, customer-safe (it may be shown to the founder).`;

export async function classifyContent(text: string, userId?: string): Promise<ClassifierResult> {
  if (!hasAIKey()) {
    console.warn('[concept-gate] no AI key — classifier skipped (fail-open, logged)');
    return { verdict: 'clean', reason: 'Classifier unavailable — passed through (logged for audit).' };
  }
  try {
    // 'planning' = non-codegen role → cheap default model (mini). This is a
    // one-JSON-verdict text task; Sonnet here would be pure pre-revenue burn
    // (RUNE review flag, Oct 25). Same for card drafting/iteration below.
    const response = await callAI(CLASSIFIER_SYSTEM_PROMPT, `App idea to classify:\n\n${text}`, 'planning');
    const parsed = extractJSON(response);
    const verdict = parsed?.verdict;
    if (verdict === 'clean' || verdict === 'borderline' || verdict === 'blocked') {
      const reason = typeof parsed?.reason === 'string' ? parsed.reason.slice(0, 300) : '';
      return { verdict, reason };
    }
    console.error('[concept-gate] classifier returned unparseable output — fail-open:', response.slice(0, 200));
    return { verdict: 'clean', reason: 'Classifier output unreadable — passed through (logged for audit).' };
  } catch (err) {
    console.error('[concept-gate] classifier call failed — fail-open:', err);
    return { verdict: 'clean', reason: 'Classifier unavailable — passed through (logged for audit).' };
  }
}

// ---------------------------------------------------------------------------
// Concept Card drafting — Nova presents the card. AI-drafted when possible,
// minimal-card fallback from the brief text when not. The gate never
// dead-ends: a founder always gets a card they can approve.
// ---------------------------------------------------------------------------
const CARD_SYSTEM_PROMPT = `You are Nova, the planner of the BoDiGi AI build team. You turn a founder's idea into a one-screen Concept Card they can approve in one look.

Return ONLY a JSON object:
{"name": "app name (2-4 words, memorable, no quotes inside)", "tagline": "one line, under 12 words", "pitch": "2-3 sentences: what it is, who it's for, why they'll love it", "screens": ["screen 1 — one line each, 3-5 screens in walkthrough order", "..."], "mustHaves": ["the 2-4 v1 features that matter most"], "notBuilding": ["2-3 things this build deliberately does NOT include — be honest, this saves the founder rebuilds"], "look": "design vibe in one line"}

Rules:
- Plain language. The founder may have never built software. "log in with Google", not "OAuth".
- The NOT-building list is the trust move: name real exclusions (e.g. "mobile app store versions", "multi-language support"), not strawmen.
- Screens describe what the founder will SEE, not implementation.
- Stay inside the idea. Do not invent features the founder didn't ask for — mustHaves come from their idea.`;

const ITERATE_SYSTEM_PROMPT = `${CARD_SYSTEM_PROMPT}

ITERATION MODE — the founder reviewed the previous card and gave feedback. Rules for iterations:
- Carry forward EVERY element the feedback does not ask to change, exactly as it was. Same name unless they ask for a new one, same screens unless they name them, same NOT-list unless they dispute it.
- Change ONLY what the feedback asks. If the feedback is vague, make the smallest sensible change that honors it.
- The founder keeps what they like. Your job is to change what they name and touch nothing else.`;

/** Fallback card from brief text, zero AI. Parses the structured interview
 *  brief format when present; otherwise degrades to a plain honest card. */
export function fallbackCard(idea: string): ConceptCard {
  const grab = (label: string): string => {
    const m = idea.match(new RegExp(`${label}:\\s*(.+)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const appIdea = grab('App idea');
  const mustHaves = grab('Must-have features');
  const look = grab('Design vibe');
  const problem = grab('Problem');

  const nameSource = appIdea || idea;
  const name = nameSource
    .replace(/^(build|make|create|design)\s+(me\s+)?(an?|the)?\s*/i, '')
    .split(/[,.]/)[0]
    .split(/\s+/)
    .slice(0, 4)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Your App';

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    tagline: 'The concept, in your words',
    pitch: (appIdea || idea).slice(0, 350),
    screens: ['Home — the first thing your users see', 'Core flow — the main thing the app does', 'Your dashboard — results at a glance'],
    mustHaves: mustHaves
      ? mustHaves.split(/,\s*/).filter(Boolean).slice(0, 4)
      : ['The core feature you described'],
    notBuilding: ['Anything not named in your idea — tell us and we\'ll iterate', 'Mobile app store versions (web app first)'],
    look: look || 'Clean, modern, approachable',
  };
}

/** Draft the first Concept Card. Never throws — falls back to a minimal card. */
export async function draftConceptCard(idea: string): Promise<ConceptCard> {
  if (!hasAIKey()) return fallbackCard(idea);
  try {
    const response = await callAI(CARD_SYSTEM_PROMPT, `Founder's idea (may be a structured interview brief):\n\n${idea}`, 'planning');
    const parsed = extractJSON(response);
    if (!parsed || typeof parsed.name !== 'string' || typeof parsed.pitch !== 'string') {
      console.error('[concept-gate] card draft unparseable — using fallback card');
      return fallbackCard(idea);
    }
    const card: ConceptCard = {
      name: parsed.name.trim().slice(0, 60),
      tagline: typeof parsed.tagline === 'string' ? parsed.tagline.trim().slice(0, 120) : 'The concept, in your words',
      pitch: parsed.pitch.trim().slice(0, 600),
      screens: asStringArray(parsed.screens, ['Home', 'Core flow', 'Results']),
      mustHaves: asStringArray(parsed.mustHaves, ['The core feature you described']),
      notBuilding: asStringArray(parsed.notBuilding, ['Anything not named in your idea']),
      look: typeof parsed.look === 'string' && parsed.look.trim() ? parsed.look.trim().slice(0, 200) : 'Clean, modern, approachable',
    };
    return card;
  } catch (err) {
    console.error('[concept-gate] card draft failed — using fallback card:', err);
    return fallbackCard(idea);
  }
}

/** Iterate: fold founder feedback into the next card version, carrying
 *  forward everything they didn't ask to change. Never throws. */
export async function iterateConceptCard(idea: string, previousCard: ConceptCard, feedback: string): Promise<ConceptCard> {
  if (!hasAIKey()) {
    // Zero-AI iteration: keep the card, append the feedback to the pitch —
    // honest, ugly, but the founder's words are preserved for the build.
    return { ...previousCard, pitch: `${previousCard.pitch}\n\nFounder's changes: ${feedback.slice(0, 400)}` };
  }
  try {
    const userPrompt = `Founder's original idea:\n${idea}\n\nPrevious card (carry forward everything the feedback does not change):\n${JSON.stringify(previousCard, null, 2)}\n\nFounder's feedback:\n${feedback}`;
    const response = await callAI(ITERATE_SYSTEM_PROMPT, userPrompt, 'planning');
    const parsed = extractJSON(response);
    if (!parsed || typeof parsed.name !== 'string' || typeof parsed.pitch !== 'string') {
      console.error('[concept-gate] iteration draft unparseable — keeping previous card with feedback note');
      return { ...previousCard, pitch: `${previousCard.pitch}\n\nFounder's changes: ${feedback.slice(0, 400)}` };
    }
    const card: ConceptCard = {
      name: parsed.name.trim().slice(0, 60),
      tagline: typeof parsed.tagline === 'string' && parsed.tagline.trim() ? parsed.tagline.trim().slice(0, 120) : previousCard.tagline,
      pitch: parsed.pitch.trim().slice(0, 600),
      screens: asStringArray(parsed.screens, previousCard.screens),
      mustHaves: asStringArray(parsed.mustHaves, previousCard.mustHaves),
      notBuilding: asStringArray(parsed.notBuilding, previousCard.notBuilding),
      look: typeof parsed.look === 'string' && parsed.look.trim() ? parsed.look.trim().slice(0, 200) : previousCard.look,
    };
    return card;
  } catch (err) {
    console.error('[concept-gate] iteration failed — keeping previous card with feedback note:', err);
    return { ...previousCard, pitch: `${previousCard.pitch}\n\nFounder's changes: ${feedback.slice(0, 400)}` };
  }
}

/** Compose the build brief from the APPROVED card — this snapshot is the
 *  source of truth for the build. The approved card is what gets built,
 *  not the raw idea. */
export function buildBriefFromCard(card: ConceptCard, sourceIdea: string): string {
  return [
    `App idea: ${card.name} — ${card.tagline}`,
    `Problem: ${card.pitch}`,
    `Target audience: see original idea below`,
    `Must-have features: ${card.mustHaves.join(', ')}`,
    `Tools and integrations: as described in the original idea`,
    `Monetization: as described in the original idea, or freemium if unspecified`,
    `Design vibe: ${card.look}`,
    `Screens in scope: ${card.screens.join(' | ')}`,
    `Explicitly NOT building: ${card.notBuilding.join(', ')} — do not include these`,
    `Approved concept (version locked by the founder) — the card above is the spec.`,
    `Original idea/interview brief (CONTEXT ONLY — where it disagrees with the card, the card wins; the NOT-building list is final):`,
    sourceIdea,
  ].join('\n');
}
