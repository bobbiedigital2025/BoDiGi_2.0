/**
 * API Route: POST /api/heygen/callback
 *
 * HeyGen v3 inline render-completion webhook. Thin by design:
 *   1. look up the render job by callback_id (the row uuid)
 *   2. flip status forward, idempotently
 *   3. ACK 2xx within 10s — heavy work (raw download) runs in after()
 *
 * Docs constraints honored (developers.heygen.com/docs/webhooks):
 *   - event_data.url is a PRE-SIGNED download URL with limited expiry —
 *     fetch promptly, never store the URL as permanent
 *   - duplicate delivery happens — the idempotent flip makes it a no-op
 *   - callback_id echoes back for correlation (we set it = render_jobs.id)
 *
 * Public route (HeyGen has no auth header for us) — the unguessable row
 * uuid is the correlation secret; optional paranoia re-confirm lives in
 * the finishing worker, not here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const FORWARD: Record<string, string> = {
  queued: 'rendering',
  rendering: 'finishing',
  finishing: 'done',
};

export async function POST(request: NextRequest) {
  let body: {
    event_type?: string;
    callback_id?: string;
    event_data?: { video_id?: string; url?: string; error?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // malformed → ACK, never retry-storm
  }

  const jobId = body.callback_id;
  if (!jobId) return NextResponse.json({ ok: true }); // not ours → ACK

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('render_jobs')
    .select('id, status, provider_job_id, kind')
    .eq('id', jobId)
    .single();

  if (!job) return NextResponse.json({ ok: true }); // unknown id → ACK, no info leak

  const isFail = (body.event_type || '').includes('fail');
  const succeeded = (body.event_type || '').includes('success') || !!body.event_data?.url;

  if (isFail) {
    await admin
      .from('render_jobs')
      .update({
        status: 'failed',
        error: body.event_data?.error || `HeyGen reported: ${body.event_type}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['queued', 'rendering']); // idempotent: failed rows untouched
    return NextResponse.json({ ok: true });
  }

  if (!succeeded) return NextResponse.json({ ok: true }); // unknown event → ACK

  // Idempotent forward flip: rendering → finishing (raw download next)
  const { data: flipped } = await admin
    .from('render_jobs')
    .update({
      status: 'finishing',
      provider_job_id: body.event_data?.video_id || job.provider_job_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'rendering') // only once; duplicates no-op
    .select('id')
    .single();

  // Heavy work after the response: raw-download the pre-signed URL to storage.
  // The finishing worker (sandbox seam) picks the row up for post-production.
  if (flipped && body.event_data?.url) {
    after(async () => {
      try {
        const res = await fetch(body.event_data!.url!);
        if (!res.ok) throw new Error(`raw download failed: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const path = `renders/${jobId}/raw.mp4`;
        const { error } = await createAdminClient().storage
          .from('render-assets')
          .upload(path, buf, { contentType: 'video/mp4', upsert: true });
        if (error) throw new Error(`storage upload failed: ${error.message}`);
        await createAdminClient()
          .from('render_jobs')
          .update({ deliverables: { raw: path }, updated_at: new Date().toISOString() })
          .eq('id', jobId);
      } catch (e) {
        // Honest-fail: flag for a human, keep the row findable
        await createAdminClient()
          .from('render_jobs')
          .update({ error: e instanceof Error ? e.message : 'raw download failed', updated_at: new Date().toISOString() })
          .eq('id', jobId);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
