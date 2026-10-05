/**
 * HeyGen API client for the Ad Studio — v3 only.
 *
 * v1/v2 endpoints are deprecated (retired Oct 31, 2026) and produce
 * worse output. This client speaks v3 exclusively:
 *
 *   1. listAvatars()  — GET /v3/avatars/looks (private + public looks)
 *   2. listVoices()   — GET /v3/voices
 *   3. submitRender() — POST /v3/videos (type: "avatar", async job)
 *   4. pollRender()   — GET /v3/videos/{video_id}
 *
 * Engine: requests Avatar V (highest fidelity) when the look supports
 * it, falling back to the default Avatar IV.
 */

const HEYGEN_BASE = 'https://api.heygen.com';

export interface HeygenAvatar {
  avatar_id: string;
  name: string;
  /** photo_avatar | studio_avatar | digital_twin */
  type: string;
  preview_url: string | null;
  /** Which engines this look accepts: avatar_iii / avatar_iv / avatar_v */
  supported_engines: string[];
  gender: string | null;
}

export interface HeygenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_url: string | null;
}

export function hasHeygenKey(): boolean {
  return !!process.env.HEYGEN_API_KEY;
}

async function heygenFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY not configured');
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: {
      'x-api-key': key,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (body.error as Record<string, unknown>) || body;
    const message =
      (err.message as string) ||
      (err.failure_message as string) ||
      JSON.stringify(body).slice(0, 200);
    throw new Error(`HeyGen API error (${res.status}): ${message}`);
  }
  return body;
}

/** List the account's avatar looks (private first, then public stock). */
export async function listAvatars(): Promise<HeygenAvatar[]> {
  const out: HeygenAvatar[] = [];
  const seen = new Set<string>();

  for (const ownership of ['private', 'public'] as const) {
    const body = (await heygenFetch(
      `/v3/avatars/looks?ownership=${ownership}&limit=50`,
    )) as { data?: Array<Record<string, unknown>> };
    for (const a of body.data || []) {
      const id = String(a.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        avatar_id: id,
        name: String(a.name || a.avatar_name || id),
        type: String(a.avatar_type || 'photo_avatar'),
        preview_url: (a.preview_image_url as string) || null,
        supported_engines: (a.supported_api_engines as string[]) || ['avatar_iv'],
        gender: (a.gender as string) || null,
      });
    }
    if (ownership === 'private' && out.length >= 20) break; // plenty
  }
  return out;
}

/** List the account's voices. */
export async function listVoices(): Promise<HeygenVoice[]> {
  const body = (await heygenFetch('/v3/voices?limit=100')) as {
    data?: Array<Record<string, unknown>>;
  };
  const voices = body.data || [];
  return voices.map((v) => ({
    voice_id: String(v.voice_id),
    name: String(v.name || v.voice_id),
    language: String(v.language || ''),
    gender: String(v.gender || ''),
    preview_url: (v.preview_audio_url as string) || null,
  }));
}

export interface SubmitRenderOpts {
  avatarId: string;
  voiceId: string;
  script: string;
  /** Brand background hex, e.g. "#0f0f14" */
  backgroundColor?: string;
  /** "16:9" landscape or "9:16" vertical (Shorts/TikTok) */
  aspectRatio: '16:9' | '9:16';
  /** Display title in the HeyGen dashboard */
  title: string;
  /** Engines the look supports (from listAvatars) — picks the best */
  supportedEngines?: string[];
}

/**
 * Submit an avatar video render. Returns the v3 video_id to poll.
 */
export async function submitRender(opts: SubmitRenderOpts): Promise<string> {
  // Avatar V is the highest-fidelity engine; request it when supported
  const engine =
    opts.supportedEngines?.includes('avatar_v')
      ? { type: 'avatar_v' }
      : opts.supportedEngines?.includes('avatar_iv')
        ? { type: 'avatar_iv' }
        : undefined;

  const body = (await heygenFetch('/v3/videos', {
    method: 'POST',
    body: JSON.stringify({
      type: 'avatar',
      avatar_id: opts.avatarId,
      script: opts.script,
      voice_id: opts.voiceId,
      title: opts.title,
      resolution: '1080p',
      aspect_ratio: opts.aspectRatio,
      ...(engine ? { engine } : {}),
      ...(opts.backgroundColor
        ? { background: { type: 'color', value: opts.backgroundColor } }
        : {}),
      // Caption sidecar (SRT) — video stays clean, we control display
      caption: { file_format: 'srt' },
    }),
  })) as { data?: { video_id?: string } };

  const videoId = body.data?.video_id;
  if (!videoId) throw new Error('HeyGen did not return a video_id');
  return videoId;
}

export interface RenderStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
  videoUrl: string | null;
  thumbnailUrl: string | null;
  subtitleUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
}

/** Poll a render once — callers decide how often. */
export async function pollRender(videoId: string): Promise<RenderStatus> {
  const body = (await heygenFetch(`/v3/videos/${encodeURIComponent(videoId)}`)) as {
    data?: Record<string, unknown>;
  };
  const d = body.data || {};
  const status = String(d.status || 'unknown');

  if (status === 'completed') {
    return {
      status: 'completed',
      videoUrl: (d.video_url as string) || null,
      thumbnailUrl: (d.thumbnail_url as string) || null,
      subtitleUrl: (d.subtitle_url as string) || null,
      durationSeconds: typeof d.duration === 'number' ? d.duration : null,
      error: null,
    };
  }
  if (status === 'failed') {
    return {
      status: 'failed',
      videoUrl: null,
      thumbnailUrl: null,
      subtitleUrl: null,
      durationSeconds: null,
      error:
        (d.failure_message as string) ||
        (d.failure_code as string) ||
        'HeyGen render failed (check wallet balance — avatar video is metered)',
    };
  }
  if (status === 'pending' || status === 'processing') {
    return {
      status,
      videoUrl: null,
      thumbnailUrl: null,
      subtitleUrl: null,
      durationSeconds: null,
      error: null,
    };
  }
  return {
    status: 'unknown',
    videoUrl: null,
    thumbnailUrl: null,
    subtitleUrl: null,
    durationSeconds: null,
    error: `Unexpected status: ${status}`,
  };
}
