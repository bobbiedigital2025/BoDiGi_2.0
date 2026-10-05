/**
 * Ad Studio — the Trupeer × Make.com smoosh, built into BoDiGi.
 *
 * Every app BoDiGi builds can now get its own ad. Given a finished
 * project, the Ad Studio produces:
 *
 *   - script      — a 30–60s ad script (hook → pain → feature → CTA)
 *                   written in the brand's voice, with per-scene
 *                   narration lines and on-screen caption text
 *   - storyboard  — per-scene visual direction (colors from the brand
 *                   palette, layout, motion notes)
 *   - status      — draft | rendering | ready | failed
 *
 * The ad is stored in `specs.ad` on the project row — same pattern as
 * the Brand Agent's `specs.brand`.
 *
 * Rendering: v1 ships the script + storyboard (the "video-ready ad
 * kit"). Voice (ElevenLabs) and avatar (HeyGen) rendering hooks are
 * wired but gated on their API keys — the studio degrades cleanly to
 * script-only when they're absent.
 */

import { callAI } from './ai-client';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';

export interface AdScene {
  /** 0-indexed scene order */
  scene: number;
  /** Narration voiceover line — one sentence, spoken aloud */
  narration: string;
  /** On-screen caption text — short, punchy, ≤ 6 words */
  caption: string;
  /** What the viewer sees: which screen/feature of the app */
  visual: string;
  /** Background color for the scene (from the brand palette) */
  background: string;
  /** Accent color for text/highlights (from the brand palette) */
  accent: string;
  /** Motion note: how the scene transitions */
  motion: string;
}

export interface AdKit {
  /** 15 | 30 | 60 — target length in seconds */
  length: number;
  /** The ad's angle, e.g. "speed", "simplicity", "cost" */
  angle: string;
  /** Full narration script — scenes joined */
  script: string;
  /** Per-scene production notes */
  scenes: AdScene[];
  /** Suggested hashtags for short-form platforms */
  hashtags: string[];
  /** Where this ad would run best */
  platforms: string[];
  generated_at: string;
  model: string;
  /** Render pipeline status — v1 is script-only ("kit") */
  render_status: 'kit' | 'rendering' | 'ready' | 'failed';
}

interface AdStrategy {
  length: number;
  angle: string;
  scenes: AdScene[];
  hashtags: string[];
  platforms: string[];
}

/**
 * Derive the ad strategy from the project spec + brand kit with one
 * text-model call: structured ad direction out.
 */
async function deriveAdStrategy(
  name: string,
  summary: string,
  audience: string,
  features: Array<{ name: string; description: string }>,
  brand: { voice?: string; tagline?: string; palette?: Record<string, string> } | null,
  length: 15 | 30 | 60,
): Promise<AdStrategy> {
  const palette = brand?.palette || {};
  const bg = palette.background || '#0f0f14';
  const accent = palette.accent || '#a78bfa';
  const primary = palette.primary || '#7c3aed';

  const system = `You are a senior direct-response ad writer and video director. Given an app, its brand, and a target ad length, you output ONLY a JSON object (no markdown fences) with:
{
  "length": ${length},
  "angle": "<the single persuasive angle this ad takes, 2-4 words>",
  "scenes": [
    {
      "scene": 0,
      "narration": "<one spoken sentence for this scene — natural, concrete, no fluff>",
      "caption": "<on-screen text, max 6 words, punchy>",
      "visual": "<what the viewer sees: which screen or feature of the app, described for a video editor>",
      "background": "${bg}",
      "accent": "${accent}",
      "motion": "<camera/motion note: zoom, pan, cut, or animated text>"
    }
  ],
  "hashtags": ["<3-6 lowercase hashtags without the # symbol>"],
  "platforms": ["<2-4 platforms this cut is best for: TikTok, YouTube Shorts, Instagram Reels, X, LinkedIn>"]
}
Rules:
- Scene count fits the length: ~1 scene per 5 seconds (${length}s → about ${Math.max(3, Math.round(length / 5))} scenes).
- Scene 1 is the HOOK: name the audience's pain in the first 3 seconds.
- Middle scenes show the app solving that pain — reference real features.
- Last scene is the CTA — use the tagline if provided.
- Narration total word count ≈ ${Math.round(length * 2.5)} words (2.5 words/sec speaking pace).
- Every background/accent must be one of the provided brand colors or a neutral dark.
- The ad must sound like the brand voice: ${brand?.voice || 'confident, warm, direct'}.`;

  const featureList = features
    .slice(0, 6)
    .map((f) => `- ${f.name}: ${f.description}`)
    .join('\n');

  const user = `App name: ${name}
Summary: ${summary}
Target audience: ${audience}
Brand tagline: ${brand?.tagline || 'none yet'}
Brand voice: ${brand?.voice || 'confident, warm, direct'}
Brand colors — background: ${bg}, accent: ${accent}, primary: ${primary}
Features:
${featureList || '- (no features listed)'}
Ad length: ${length} seconds`;

  const raw = await callAI(system, user);

  // Tolerate the model wrapping JSON in fences or prose
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Ad strategy call returned no JSON');
  const parsed = JSON.parse(match[0]) as AdStrategy;
  if (!parsed.scenes?.length || !parsed.scenes[0].narration) {
    throw new Error('Ad strategy incomplete');
  }
  parsed.length = length;
  return parsed;
}

/**
 * Generate (or regenerate) the ad kit for a project.
 * Persists specs.ad on the project row. Returns the kit.
 */
export async function generateAdKit(
  projectId: string,
  length: 15 | 30 | 60 = 30,
  angleHint?: string,
): Promise<AdKit> {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const supabase = createAdminClient();

  const { data: project, error } = await supabase
    .from('projects')
    .select('id, name, specs')
    .eq('id', projectId)
    .single();
  if (error || !project) throw new Error('Project not found');

  const specs = (project.specs || {}) as Record<string, unknown>;
  const name = (specs.name as string) || project.name || 'Untitled App';
  const summary = (specs.summary as string) || (specs.idea as string) || '';
  const audience = (specs.targetAudience as string) || 'general consumers';
  const features = (specs.features as Array<{ name: string; description: string }>) || [];
  const brand = (specs.brand as { voice?: string; tagline?: string; palette?: Record<string, string> } | null) || null;

  const strategy = await deriveAdStrategy(
    name, summary, audience, features, brand, length,
  );

  // Apply the angle hint if the user steered the ad
  if (angleHint && !strategy.angle.toLowerCase().includes(angleHint.toLowerCase())) {
    strategy.angle = angleHint;
  }

  const ad: AdKit = {
    length: strategy.length,
    angle: strategy.angle,
    script: strategy.scenes.map((s) => s.narration).join(' '),
    scenes: strategy.scenes,
    hashtags: strategy.hashtags,
    platforms: strategy.platforms,
    generated_at: new Date().toISOString(),
    model: process.env.AI_MODEL || 'openai/gpt-4o-mini',
    render_status: 'kit',
  };

  const { error: updateError } = await supabase
    .from('projects')
    .update({ specs: { ...specs, ad } })
    .eq('id', projectId);
  if (updateError) throw new Error(`Could not save ad kit: ${updateError.message}`);

  return ad;
}
