'use client';

/**
 * AdStudioPanel — the Trupeer × Make smoosh, surfaced on the project
 * dashboard. Generates a 15/30/60-second ad script + storyboard in the
 * brand's voice. Voice/avatar rendering hooks come when their API keys
 * land; the kit itself is complete and video-ready today.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clapperboard, Copy, Check } from 'lucide-react';

interface AdScene {
  scene: number;
  narration: string;
  caption: string;
  visual: string;
  background: string;
  accent: string;
  motion: string;
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
