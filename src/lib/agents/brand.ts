/**
 * Brand Agent
 *
 * A business builder that ships no brand ships anonymous software.
 * Given a finished (or in-progress) project, the Brand Agent produces:
 *
 *   - logo        — AI-generated app logo (transparent-style mark on dark)
 *   - palette     — 5-color brand palette with roles, derived from the spec
 *   - voice       — one-line brand voice for the marketing kit
 *   - tagline     — a sharpened one-liner
 *
 * The kit is stored in `specs.brand` on the project row, and the logo PNG
 * is uploaded to the public `brand-assets` storage bucket so the showcase,
 * the dashboard, and the ZIP export can all use it.
 */

import { callAI, callImageAI } from './ai-client';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface BrandKit {
  logo_url: string;
  palette: BrandPalette;
  voice: string;
  tagline: string;
  generated_at: string;
  model: string;
}

const BUCKET = 'brand-assets';

interface BrandStrategy {
  logo_prompt: string;
  palette: BrandPalette;
  voice: string;
  tagline: string;
}

/**
 * Derive the brand strategy from the project spec with a cheap text model:
 * one call in, structured brand direction out.
 */
async function deriveStrategy(name: string, summary: string, audience: string): Promise<BrandStrategy> {
  const system = `You are a senior brand designer. Given an app, you output ONLY a JSON object (no markdown fences) with:
{
  "logo_prompt": "<a detailed image-generation prompt for a minimal modern app logo icon: describe the mark, style (flat vector), colors, and mood. Always: centered on a solid dark charcoal background, NO text, NO letters>",
  "palette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
  "voice": "<one line: how this brand sounds, e.g. 'warm, calm, quietly encouraging'>",
  "tagline": "<a sharp one-line tagline, max 8 words>"
}
The palette must fit the app's audience and mood; background should be dark (the apps are dark-themed).`;

  const user = `App name: ${name}\nSummary: ${summary}\nTarget audience: ${audience}`;
  const raw = await callAI(system, user);

  // Tolerate the model wrapping JSON in fences or prose
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Brand strategy call returned no JSON');
  const parsed = JSON.parse(match[0]) as BrandStrategy;
  if (!parsed.logo_prompt || !parsed.palette?.primary) {
    throw new Error('Brand strategy incomplete');
  }
  return parsed;
}

/** Upload the logo PNG to public storage; returns its public URL. */
async function uploadLogo(projectId: string, pngBase64: string): Promise<string> {
  const supabase = createAdminClient();

  // Ensure the bucket exists (public read — logos appear on the public showcase)
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png'],
    fileSizeLimit: 5 * 1024 * 1024,
  });
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`Could not create storage bucket: ${bucketError.message}`);
  }

  const bytes = Buffer.from(pngBase64, 'base64');
  const path = `${projectId}/logo.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(`Logo upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Bust caches on regenerate
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Generate (or regenerate) the full brand kit for a project.
 * Persists specs.brand on the project row. Returns the kit.
 */
export async function generateBrandKit(projectId: string): Promise<BrandKit> {
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

  // 1. Strategy (text) → 2. Logo (image) → 3. Upload → 4. Persist
  const strategy = await deriveStrategy(name, summary, audience);
  const pngBase64 = await callImageAI(strategy.logo_prompt);
  const logoUrl = await uploadLogo(projectId, pngBase64);

  const brand: BrandKit = {
    logo_url: logoUrl,
    palette: strategy.palette,
    voice: strategy.voice,
    tagline: strategy.tagline,
    generated_at: new Date().toISOString(),
    model: process.env.AI_IMAGE_MODEL || 'google/gemini-2.5-flash-image',
  };

  const { error: updateError } = await supabase
    .from('projects')
    .update({ specs: { ...specs, brand } })
    .eq('id', projectId);
  if (updateError) throw new Error(`Could not save brand kit: ${updateError.message}`);

  return brand;
}
