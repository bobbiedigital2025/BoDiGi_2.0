/**
 * HeyGen v3 render-completion webhook (inline callback mode).
 *
 * submitRender() passes callback_url = this route + callback_id = render_jobs.id.
 * HeyGen POSTs here on success or failure. Contract (developers.heygen.com,
 * verified Oct 28):
 *   - ACK 2xx within 10s → this route is THIN: flip status, ACK, heavy work after.
 *   - event_data.url is a PRE-SIGNED download URL with limited expiry —
 *     fetched promptly inside after(), never stored as permanent.
 *   - Duplicate delivery happens → the status flip is idempotent (the UPDATE
 *     only bites when status = 'rendering').
 */
import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

interface HeygenWebhookBody {
  callback_id?: string;
  event_type?: string;
  event_data?: {
    url?: string;
    video_id?: string;
    status?: string;
    error?: string | { message?: string; reason?: string } | null;
  };
}

export async function POST(req: Request) {
  let body: HeygenWebhookBody;
  try {
    body = (await req.json()) as HeygenWebhookBody;
  } catch {
    return NextResponse.json({ ok: true }); // malformed body: ACK and drop
  }

  const jobId = body.callback_id || '';
  const eventType = (body.event_type || '').toLowerCase();
  const url = body.event_data?.url || '';
  const videoId = body.event_data?.video_id || '';
  const errMsg =
    typeof body.event_data?.error === 'string'
      ? body.event_data?.error
      : body.event_data?.error?.message ||
        body.event_data?.error?.reason ||
        'render failed';

  if (!jobId) {
    // Not ours (no callback_id) — ACK so HeyGen stops retrying.
    return NextResponse.json({ ok: true });
  }

  const failed =
    eventType.includes('fail') || eventType.includes('error') ||
    (body.event_data?.status || '').toLowerCase() === 'failed';

  const supabase = createAdminClient();

  // Idempotent flip: only a job still in 'rendering' transitions. Duplicate
  // deliveries hit the same WHERE and no-op.
  if (failed) {
    await supabase
      .from('render_jobs')
      .update({ status: 'failed', error: errMsg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'rendering');
    return NextResponse.json({ ok: true });
  }

  const { data: job } = await supabase
    .from('render_jobs')
    .update({
      status: 'rendered',
      provider_job_id: videoId || null,
      rendered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'rendering')
    .select('id, user_id')
    .single();

  // ACK immediately — HeyGen must get its 2xx inside 10s.
  const res = NextResponse.json({ ok: true });

  if (job && url) {
    // Heavy work after the response: raw-download the pre-signed file into
    // private storage. The finishing pass (cuts/endcard/delivery) is the
    // watcher's seam — this route only banks the master file.
    after(async () => {
      try {
        const file = await fetch(url);
        if (!file.ok || !file.body) throw new Error(`download HTTP ${file.status}`);
        const buf = Buffer.from(await file.arrayBuffer());
        const path = `${job.user_id}/${job.id}/master.mp4`;
        const { error: upErr } = await supabase.storage
          .from('render-outputs')
          .upload(path, buf, { contentType: 'video/mp4', upsert: true });
        if (upErr) throw new Error(upErr.message);
        await supabase
          .from('render_jobs')
          .update({ output: { master: path }, updated_at: new Date().toISOString() })
          .eq('id', job.id);
      } catch (e) {
        // Download failed after ACK — honest-fail the job; one retry is the
        // watcher's call (attempts counter is on the row).
        await supabase
          .from('render_jobs')
          .update({
            status: 'failed',
            error: `post-webhook download: ${e instanceof Error ? e.message : String(e)}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
          .eq('status', 'rendered');
      }
    });
  }

  return res;
}
