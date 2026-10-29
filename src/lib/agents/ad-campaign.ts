/**
 * ad-campaign.ts — Ad Studio v2 campaign engine (kinetic tier).
 *
 * One campaign = one master script + 3 hook variants + per-platform
 * posting copy + a day-by-day posting plan. The customer gets 6 videos
 * (3 hooks × 2 formats) cut from one master render — the Oct 11 cost
 * trick, productized.
 *
 * Honest-claims rule (loop true-up): we deliver variants + a testing
 * PLAYBOOK. Never claim automated multivariate testing or performance
 * tracking — those need platform accounts we don't have.
 */

import { callAI } from './ai-client';

export interface CampaignScene {
  scene: number;
  narration: string;
  caption: string;
  visual: string;
  background: string;
  accent: string;
  motion: string;
}

export interface HookVariant {
  angle: string;            // 2-4 words: the persuasive angle of this opening
  scenes: CampaignScene[];  // opening 2-3 scenes that replace the master's opening
}

export interface PostingCopy {
  tiktok: string;
  instagram_reels: string;
  youtube_shorts: string;
  x: string;
  linkedin: string;
}

export interface PostingDay {
  day: number;
  video: string;            // 'A' | 'B' | 'C' — which hook variant
  platform: string;
  time: string;             // e.g. 'evening'
  note: string;
}

export interface AdCampaign {
  master: {
    length: number;
    angle: string;
    scenes: CampaignScene[];
    hashtags: string[];
  };
  hooks: HookVariant[];     // exactly 3 — A, B, C
  postingCopy: PostingCopy;
  postingPlan: PostingDay[];
}

/**
 * Tier configuration. Pricing + enabled flags are STAGED — nothing is
 * purchasable until Bobbie's GO flips `enabled` and sets the launch price.
 * (CEO approval gate: pricing changes are always her call.)
 */
export const CAMPAIGN_TIERS = {
  kinetic: {
    enabled: false,          // Bobbie's GO flips this
    priceCents: 999,          // spec rec: $9.99 — her call on launch
    label: 'Kinetic Campaign',
    description: '6 videos (3 hooks × 2 formats) + posting copy + plan. Kinetic typography + voice — no avatar.',
  },
  avatar: {
    enabled: false,          // ALSO wallet-gated: needs HeyGen top-up first
    priceCents: 1999,         // spec rec: $19.99 — her call on launch
    label: 'Avatar Campaign',
    description: 'One avatar master render, cut to 6 videos + posting copy + plan.',
  },
} as const;

export function campaignTierEnabled(tier: 'kinetic' | 'avatar'): boolean {
  return CAMPAIGN_TIERS[tier].enabled;
}

/**
 * Generate a full campaign from a business brief: master script in the
 * brand's voice, 3 distinct hook openings, per-platform copy, and a
 * spaced-a-day posting plan (algorithm picks the winner in ~48h — the
 * method RUNE used for the bodigi2 hook ads).
 */
export async function generateCampaign(
  brief: string,
  brand: { name?: string; voice?: string; tagline?: string; palette?: Record<string, string> } | null,
): Promise<AdCampaign> {
  const palette = brand?.palette || {};
  const bg = palette.background || '#0f0f14';
  const accent = palette.accent || '#a78bfa';

  const system = `You are a senior direct-response campaign director. Given a business brief, you output ONLY a JSON object (no markdown fences) with:
{
  "master": {
    "length": 30,
    "angle": "<the master ad's persuasive angle, 2-4 words>",
    "scenes": [
      {
        "scene": 0,
        "narration": "<one spoken sentence — natural, concrete, no fluff>",
        "caption": "<on-screen text, max 6 words, punchy>",
        "visual": "<what the viewer sees, described for a video editor>",
        "background": "${bg}",
        "accent": "${accent}",
        "motion": "<camera/motion note: zoom, pan, cut, or animated text>"
      }
    ],
    "hashtags": ["<3-6 lowercase hashtags without the # symbol>"]
  },
  "hooks": [
    {
      "angle": "<opening angle A, 2-4 words>",
      "scenes": [<2-3 opening scenes in the same scene shape, replacing the master's opening>]
    }
  ],
  "postingCopy": {
    "tiktok": "<caption + hashtags for TikTok>",
    "instagram_reels": "<caption for Instagram Reels>",
    "youtube_shorts": "<title + description for a YouTube Short>",
    "x": "<post text for X, under 280 chars>",
    "linkedin": "<post text for LinkedIn, professional register>"
  },
  "postingPlan": [
    { "day": 1, "video": "A", "platform": "<platform>", "time": "<best posting time>", "note": "<one-line instruction>" }
  ]
}
Rules:
- Master: ~1 scene per 5 seconds, 30 seconds total (about 6 scenes). Scene 1 is the HOOK: name the audience's pain in the first 3 seconds. Last scene is the CTA — use the tagline if provided.
- Narration total ≈ 75 words (2.5 words/sec speaking pace).
- EXACTLY 3 hooks, angles named A, B, C in order. Each hook is a genuinely DIFFERENT opening approach (e.g. pain-first, question-first, proof-first) — not rewordings of each other. Hook scenes must splice cleanly onto the master's middle.
- Posting plan: 6+ days, videos A/B/C spaced at least a day apart on the same platform, then rotate winners to other platforms. Include one line explaining that the algorithm usually shows a winner within 48 hours.
- The plan is a PLAYBOOK the customer follows — never claim we track or automate their ad performance.
- Every background/accent must be the provided brand colors or a neutral dark.
- Brand voice: ${brand?.voice || 'confident, warm, direct'}.`;

  const user = `Business brief: ${brief}
Business name: ${brand?.name || '(from the brief)'}
Brand tagline: ${brand?.tagline || 'none yet'}
Brand voice: ${brand?.voice || 'confident, warm, direct'}
Brand colors — background: ${bg}, accent: ${accent}`;

  const raw = await callAI(system, user);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Campaign generation returned no JSON');
  const parsed = JSON.parse(match[0]) as AdCampaign;

  if (!parsed.master?.scenes?.length || !parsed.master.scenes[0].narration) {
    throw new Error('Campaign master script incomplete');
  }
  if (!Array.isArray(parsed.hooks) || parsed.hooks.length !== 3) {
    throw new Error('Campaign must have exactly 3 hook variants');
  }
  for (const hook of parsed.hooks) {
    if (!hook.angle || !Array.isArray(hook.scenes) || !hook.scenes.length) {
      throw new Error('Campaign hook variant incomplete');
    }
  }
  if (!parsed.postingCopy?.tiktok || !Array.isArray(parsed.postingPlan) || parsed.postingPlan.length < 3) {
    throw new Error('Campaign posting copy or plan incomplete');
  }
  return parsed;
}
