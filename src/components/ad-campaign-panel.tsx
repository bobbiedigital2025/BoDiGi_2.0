'use client';

/**
 * AdCampaignPanel — Ad Studio v2 campaign mode (kinetic tier).
 *
 * One brief in → a full campaign out: master script, 3 hook variants
 * (A/B/C), per-platform posting copy, and a day-by-day posting plan.
 * Render + 6-cut delivery are the next build increment; this panel
 * takes a campaign from brief → scripted package.
 *
 * Pricing is STAGED: the tier flags live in ad-campaign.ts and stay
 * disabled until Bobbie's GO. The panel renders even when disabled
 * (founder preview) but generation is refused server-side.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Megaphone, CalendarDays, FileText } from 'lucide-react';

interface CampaignScene {
  scene: number;
  narration: string;
  caption: string;
  visual: string;
}

interface HookVariant {
  angle: string;
  scenes: CampaignScene[];
}

interface AdCampaignData {
  master: { length: number; angle: string; scenes: CampaignScene[]; hashtags: string[] };
  hooks: HookVariant[];
  postingCopy: Record<string, string>;
  postingPlan: Array<{ day: number; video: string; platform: string; time: string; note: string }>;
}

interface CampaignRow {
  id: number;
  tier: string;
  status: string;
  brief: string;
  campaign: AdCampaignData | null;
  error: string | null;
  created_at: string;
}

export function AdCampaignPanel({ projectId, appName }: { projectId: string; appName: string }) {
  // Rendered by the parent only when Bobbie's pricing GO flips the tier
  // flag — a visible coming-soon surface is a customer-facing change,
  // which is her call.
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/generate/${projectId}/ad/campaign`)
      .then((r) => r.json())
      .then((d) => { setCampaigns(d.campaigns || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [projectId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate/${projectId}/ad/campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, tier: 'kinetic' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Campaign generation failed');
      const refreshed = await fetch(`/api/generate/${projectId}/ad/campaign`).then((r) => r.json());
      setCampaigns(refreshed.campaigns || []);
      setBrief('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Campaign generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-cyan-400" />
          Campaign Studio
        </CardTitle>
        <CardDescription>
          One brief in — a full campaign out: master script, 3 hook variants, posting copy for every platform, and a day-by-day posting plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={`Describe the business this campaign is for — who it serves, what it does, what makes it different. e.g. "${appName} is a task manager for night-shift workers...`}
            className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Kinetic campaign: 6 videos (3 hooks × 2 formats) + copy + plan. Launching with founder pricing — generation opens at launch.
            </span>
            <Button onClick={generate} disabled={busy || brief.trim().length < 20} size="sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {busy ? 'Writing campaign...' : 'Generate campaign'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {loaded && campaigns.length > 0 && (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-md border border-border p-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="info">{c.tier}</Badge>
                  <Badge variant={c.status === 'delivered' ? 'success' : c.status === 'failed' ? 'error' : 'default'}>
                    {c.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>

                {c.campaign && (
                  <>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Master script — angle: {c.campaign.master.angle}
                      </p>
                      <div className="mt-1 space-y-1">
                        {c.campaign.master.scenes.map((s) => (
                          <p key={s.scene} className="text-sm">
                            <span className="text-cyan-400 font-medium">{s.caption}</span> — {s.narration}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Hook variants (A/B/C)</p>
                      <div className="mt-1 grid gap-2 md:grid-cols-3">
                        {c.campaign.hooks.map((h, i) => (
                          <div key={i} className="rounded border border-border/50 p-2">
                            <p className="text-xs font-medium text-violet-400">
                              {String.fromCharCode(65 + i)}: {h.angle}
                            </p>
                            {h.scenes.map((s, j) => (
                              <p key={j} className="text-xs mt-1 text-muted-foreground">{s.caption}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> Posting plan
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {c.campaign.postingPlan.map((p, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            Day {p.day} — video {p.video} on {p.platform} ({p.time}): {p.note}
                          </p>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {c.error && <p className="text-sm text-red-400">{c.error}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
