'use client';

/**
 * AdStudioPanel — the Trupeer × Make smoosh, surfaced on the project
 * dashboard. Generates a 15/30/60-second ad script + storyboard in the
 * brand's voice, then (when HeyGen is configured) renders it as a
 * talking-avatar video — 16:9 or 9:16 vertical for shorts.
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clapperboard, Copy, Check, User, Volume2 } from 'lucide-react';

interface AdScene {
  scene: number;
  narration: string;
  caption: string;
  visual: string;
  background: string;
  accent: string;
  motion: string;
}

interface AdRender {
  provider?: string;
  video_id?: string;
  video_url?: string;
  dimension?: string;
  started_at?: string;
  completed_at?: string;
}

export interface AdKitData {
  length: number;
  angle: string;
  script: string;
  scenes: AdScene[];
  hashtags: string[];
  platforms: string[];
  generated_at: string;
  render_status: string;
  render?: AdRender;
}

interface HeygenAvatar {
  avatar_id: string;
  name: string;
  preview_url: string | null;
  supported_engines?: string[];
}

interface HeygenVoice {
  voice_id: string;
  name: string;
  language: string;
  preview_url?: string | null;
}

export function AdStudioPanel({
  projectId,
  appName,
  existingAd,
}: {
  projectId: string;
  appName: string;
  existingAd: AdKitData | null;
}) {
  const [ad, setAd] = useState<AdKitData | null>(existingAd);
  const [busy, setBusy] = useState(false);
  const [length, setLength] = useState<15 | 30 | 60>(30);
  const [angle, setAngle] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // HeyGen state
  const [heygenConfigured, setHeygenConfigured] = useState<boolean | null>(null);
  const [avatars, setAvatars] = useState<HeygenAvatar[]>([]);
  const [voices, setVoices] = useState<HeygenVoice[]>([]);
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [dimension, setDimension] = useState<'16:9' | '9:16'>('16:9');
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load avatar inventory once when an ad exists and HeyGen may be configured
  useEffect(() => {
    if (!ad) return;
    let cancelled = false;
    fetch(`/api/generate/${projectId}/ad/avatars`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) { setHeygenConfigured(false); return; }
        setHeygenConfigured(!!json.configured);
        setAvatars(json.avatars || []);
        setVoices(json.voices || []);
        // Default to Bobbie's newest avatar + her voice clone when present
        const bobbieAvatar = json.avatars?.find((a: HeygenAvatar) => a.avatar_id === '299c640197c34baab213ec824af9be0e');
        const bobbieVoice = json.voices?.find((v: HeygenVoice) => v.voice_id === '0e5ec9b420054bb2b5fddc630a69999c');
        if (bobbieAvatar) setAvatarId((prev) => prev || bobbieAvatar.avatar_id);
        else if (json.avatars?.[0]) setAvatarId((prev) => prev || json.avatars[0].avatar_id);
        if (bobbieVoice) setVoiceId((prev) => prev || bobbieVoice.voice_id);
        else if (json.voices?.[0]) setVoiceId((prev) => prev || json.voices[0].voice_id);
      })
      .catch(() => setHeygenConfigured(false));
    return () => { cancelled = true; };
  }, [projectId, !!ad]);

  // If a render is already in flight (render_status === 'rendering'), resume polling
  useEffect(() => {
    if (ad?.render_status === 'rendering' && ad.render?.video_id) {
      startPolling(ad.render.video_id);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.render_status, ad?.render?.video_id]);

  const startPolling = (videoId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setRendering(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/${projectId}/ad/render?video_id=${encodeURIComponent(videoId)}`);
        const json = await res.json();
        if (json.status === 'completed' && json.videoUrl) {
          if (pollRef.current) clearInterval(pollRef.current);
          setRendering(false);
          setAd((prev) => prev ? {
            ...prev,
            render_status: 'ready',
            render: { ...prev.render, video_url: json.videoUrl },
          } : prev);
        } else if (json.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setRendering(false);
          setRenderError(json.error || 'Render failed — check HeyGen credits');
          setAd((prev) => prev ? { ...prev, render_status: 'failed' } : prev);
        }
      } catch {
        // transient network error — keep polling, the interval will retry
      }
    }, 10000);
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length, angle: angle || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ad generation failed');
      setAd(json.ad as AdKitData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ad generation failed');
    } finally {
      setBusy(false);
    }
  };

  const renderVideo = async () => {
    setRenderError(null);
    if (!avatarId || !voiceId) {
      setRenderError('Pick an avatar and a voice first');
      return;
    }
    setRendering(true);
    try {
      const chosen = avatars.find((a) => a.avatar_id === avatarId);
      const res = await fetch(`/api/generate/${projectId}/ad/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId,
          voiceId,
          dimension,
          supportedEngines: chosen?.supported_engines,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Render submission failed');
      setAd((prev) => prev ? { ...prev, render_status: 'rendering' } : prev);
      startPolling(json.videoId);
    } catch (e) {
      setRendering(false);
      setRenderError(e instanceof Error ? e.message : 'Render submission failed');
    }
  };

  const copyScript = async () => {
    if (!ad) return;
    const text = [
      `${appName} — ${ad.length}s ad (${ad.angle})`,
      '',
      ...ad.scenes.map((s) =>
        `[Scene ${s.scene + 1}] ${s.caption}\n  VO: ${s.narration}\n  VISUAL: ${s.visual}\n  MOTION: ${s.motion}`,
      ),
      '',
      `Hashtags: ${ad.hashtags.map((h) => `#${h}`).join(' ')}`,
      `Platforms: ${ad.platforms.join(', ')}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-fuchsia-400" />
          Ad Studio
          {ad && <Badge variant="info" className="text-xs">{ad.length}s · {ad.angle}</Badge>}
        </CardTitle>
        <CardDescription>
          A ready-to-shoot ad for {appName} — script, storyboard, captions, and hashtags in your brand voice
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!ad && !busy && (
          <p className="text-sm text-white/50">
            Every app needs an ad. Generate a 15, 30, or 60-second ad kit for {appName} — hook, scenes, captions, hashtags.
          </p>
        )}

        {ad && (
          <div className="space-y-4">
            {/* Scene storyboard */}
            <div className="space-y-2">
              {ad.scenes.map((s) => (
                <div
                  key={s.scene}
                  className="rounded-xl border border-white/10 p-3"
                  style={{ background: s.background }}
                >
                  <span
                    className="text-xs font-bold tracking-wide uppercase"
                    style={{ color: s.accent }}
                  >
                    Scene {s.scene + 1} — {s.caption}
                  </span>
                  <p className="text-sm text-white/85 mt-1">{s.narration}</p>
                  <p className="text-[11px] text-white/40 mt-1">
                    Visual: {s.visual} · Motion: {s.motion}
                  </p>
                </div>
              ))}
            </div>

            {/* Hashtags + platforms */}
            <div className="flex flex-wrap gap-2">
              {ad.hashtags.map((h) => (
                <span key={h} className="text-xs text-fuchsia-300 bg-fuchsia-500/10 rounded-full px-2.5 py-1">
                  #{h}
                </span>
              ))}
              {ad.platforms.map((p) => (
                <span key={p} className="text-xs text-white/60 bg-white/5 rounded-full px-2.5 py-1">
                  {p}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyScript}>
                {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? 'Copied' : 'Copy production script'}
              </Button>
            </div>

            {/* ── Avatar render (HeyGen) ── */}
            {heygenConfigured && (
              <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-3 space-y-3">
                <div className="text-xs font-semibold text-fuchsia-300 uppercase tracking-wide">
                  Avatar video (HeyGen)
                </div>

                {ad.render?.video_url && ad.render_status === 'ready' ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <video
                      src={ad.render.video_url}
                      controls
                      className="w-full rounded-lg border border-white/10"
                    />
                    <a
                      href={ad.render.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-fuchsia-300 underline underline-offset-2"
                    >
                      Open video ↗ (HeyGen-hosted MP4)
                    </a>
                  </div>
                ) : rendering ? (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                    Rendering your avatar ad… (usually 1–3 minutes)
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] text-white/40 flex items-center gap-1"><User className="w-3 h-3" /> Avatar</span>
                        <select
                          value={avatarId}
                          onChange={(e) => setAvatarId(e.target.value)}
                          className="w-full mt-1 text-sm rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-white/85 focus:outline-none focus:border-fuchsia-400/50"
                        >
                          {avatars.map((a) => (
                            <option key={a.avatar_id} value={a.avatar_id}>{a.name}</option>
                          ))}
                        </select>
                        {(() => {
                          const chosen = avatars.find((a) => a.avatar_id === avatarId);
                          return chosen?.preview_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={chosen.preview_url} alt={chosen.name} className="mt-2 w-12 h-12 rounded-full border border-fuchsia-400/30 object-cover" />
                          ) : null;
                        })()}
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-white/40 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Voice</span>
                        <select
                          value={voiceId}
                          onChange={(e) => setVoiceId(e.target.value)}
                          className="w-full mt-1 text-sm rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-white/85 focus:outline-none focus:border-fuchsia-400/50"
                        >
                          {voices.map((v) => (
                            <option key={v.voice_id} value={v.voice_id}>{v.name} ({v.language})</option>
                          ))}
                        </select>
                        {(() => {
                          const chosen = voices.find((v) => v.voice_id === voiceId);
                          return chosen?.preview_url ? (
                            <button
                              type="button"
                              onClick={() => new Audio(chosen.preview_url!).play().catch(() => {})}
                              className="mt-2 text-xs text-fuchsia-300 hover:text-fuchsia-200 underline underline-offset-2"
                            >
                              ▶ preview voice
                            </button>
                          ) : null;
                        })()}
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40">Format:</span>
                      {(['16:9', '9:16'] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDimension(d)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            dimension === d
                              ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-300'
                              : 'border-white/10 text-white/50 hover:border-white/25'
                          }`}
                        >
                          {d === '16:9' ? '16:9 landscape' : '9:16 vertical (Shorts/TikTok)'}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" onClick={renderVideo}>
                      Render avatar video
                    </Button>
                  </>
                )}
                {renderError && <p className="text-sm text-red-400">{renderError}</p>}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

        {/* Controls */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">Length:</span>
            {([15, 30, 60] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLength(l)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  length === l
                    ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-300'
                    : 'border-white/10 text-white/50 hover:border-white/25'
                }`}
              >
                {l}s
              </button>
            ))}
          </div>
          <input
            type="text"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Angle (optional) — e.g. speed, price, ADHD-friendly"
            className="w-full text-sm rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/85 placeholder:text-white/30 focus:border-fuchsia-400/50 focus:outline-none"
          />
          <Button size="sm" disabled={busy} onClick={generate}>
            {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {busy ? 'Writing your ad…' : ad ? 'Regenerate ad' : 'Generate ad'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
