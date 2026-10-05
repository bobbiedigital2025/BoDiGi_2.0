/**
 * HeyGen API client for the Ad Studio.
 *
 * Renders an ad kit's narration script as a talking-avatar video:
 *
 *   1. listAvatars()   — the user's HeyGen avatar + voice inventory
 *   2. submitRender()  — POST /v2/video_generate (async job)
 *   3. pollRender()    — GET /v1/video_status.get until completed/failed
 *
 * HeyGen v2 flow: create the job, get a video_id back, poll the status
 * endpoint until status === "completed", then download from
 * video_url. Free-tier keys can list streaming avatars but video
 * generation requires credits — the caller surfaces that honestly.
 */

const HEYGEN_BASE = 'https://api.heygen.com';

export interface HeygenAvatar {
  avatar_id: string;
  /** Human label, e.g. "Anna — Professional" */
  name: string;
  /** "v2" photo avatar, "talking_photo", etc. */
  type: string;
  preview_url: string | null;
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

async function heygenFetch(path: string, init?: RequestInit): Promise<unknown> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY not configured');
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: {
      'X-Api-Key': key,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (body.error as string) ||
      (typeof body.message === 'string' ? body.message : JSON.stringify(body).slice(0, 200));
    throw new Error(`HeyGen API error (${res.status}): ${message}`);
  }
  return body;
}

/** List the account's streaming avatars (photo avatars usable for video). */
export async function listAvatars(): Promise<HeygenAvatar[]> {
  const body = (await heygenFetch('/v2/avatars?limit=50')) as {
    data?: { avatars?: Array<Record<string, unknown>> };
  };
  const avatars = body.data?.avatars || [];
  return avatars.map((a) => ({
    avatar_id: String(a.avatar_id),
    name: String(a.avatar_name || a.avatar_id),
    type: String(a.type || 'v2'),
    preview_url: (a.preview_image_url as string) || (a.preview_video_url as string) || null,
    gender: (a.gender as string) || null,
  }));
}

/** List the account's voices. */
export async function listVoices(): Promise<HeygenVoice[]> {
  const body = (await heygenFetch('/v2/voices?limit=100')) as {
    data?: { voices?: Array<Record<string, unknown>> };
  };
  const voices = body.data?.voices || [];
  return voices.map((v) => ({
    voice_id: String(v.voice_id),
    name: String(v.name || v.voice_id),
    language: String(v.language || ''),
    gender: String(v.gender || ''),
    preview_url: (v.preview_audio as string) || null,
  }));
}

/**
 * Submit an avatar video render. Returns the HeyGen video_id to poll.
 *
 * dimension: "1280x720" (16:9) or "720x1280" (9:16 vertical for shorts).
 */
export async function submitRender(opts: {
  avatarId: string;
  voiceId: string;
  script: string;
  backgroundUrl?: string;
  dimension?: '1280x720' | '720x1280';
}): Promise<string> {
  const body = (await heygenFetch('/v2/video_generate', {
    method: 'POST',
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: opts.avatarId,
            avatar_style: 'circle',
          },
          voice: {
            type: 'text',
            input_text: opts.script,
            voice_id: opts.voiceId,
          },
          background:
            opts.backgroundUrl && /^https?:\/\//.test(opts.backgroundUrl)
              ? { type: 'image', url: opts.backgroundUrl }
              : { type: 'color', value: '#0f0f14' },
        },
      ],
      dimension: opts.dimension || '1280x720',
    }),
  })) as { data?: { video_id?: string } };
  const videoId = body.data?.video_id;
  if (!videoId) throw new Error('HeyGen did not return a video_id');
  return videoId;
}

export interface RenderStatus {
  status: 'processing' | 'completed' | 'failed' | 'waiting' | 'unknown';
  videoUrl: string | null;
  error: string | null;
}

/** Poll a render once — callers decide how often. */
export async function pollRender(videoId: string): Promise<RenderStatus> {
  const body = (await heygenFetch(`/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`)) as {
    data?: { status?: string; video_url?: string; error?: unknown };
  };
  const status = body.data?.status;
  if (status === 'completed') {
    return { status: 'completed', videoUrl: body.data?.video_url || null, error: null };
  }
  if (status === 'failed') {
    return {
      status: 'failed',
      videoUrl: null,
      error:
        typeof body.data?.error === 'string'
          ? body.data.error
          : 'HeyGen render failed (check credits — avatar video needs a paid tier or credits)',
    };
  }
  return { status: status === 'processing' ? 'processing' : 'unknown', videoUrl: null, error: null };
}
