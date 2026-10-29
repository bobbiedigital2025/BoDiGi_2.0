/**
 * scripts/kinetic-render.ts — the kinetic photo-scene renderer (Ad Studio v2).
 *
 * Runs SANDBOX-SIDE (ffmpeg lives here, not on Vercel). The platform writes a
 * render_jobs row (kind='kinetic', status='queued') at checkout; this script
 * claims the job, renders the master + 9:16 cut, uploads to render-outputs,
 * and flips the row to 'rendered'. The HeyGen webhook route handles the
 * avatar twin — kinetic just skips the HeyGen hop.
 *
 * Photo-scene style (Bobbie's directive Oct 28): photos pan/zoom in and out
 * (Ken Burns), kinetic captions anchor to a DIFFERENT screen region per
 * scene, neon glow in the brand accent. No photo for a scene → neon grid
 * fallback background (the Oct 5 neon-composite look, productized).
 *
 * Usage: npx tsx scripts/kinetic-render.ts <jobId>   (single job)
 *        npx tsx scripts/kinetic-render.ts           (claim next queued)
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const run = promisify(execFile);

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

/** Caption anchor regions — rotated per scene so words never sit still. */
const REGIONS: Array<[number, number]> = [
  [0.08, 0.12], // top-left
  [0.5, 0.5],   // center
  [0.85, 0.8],  // bottom-right
  [0.08, 0.78], // bottom-left
  [0.82, 0.15], // top-right
];

export interface KineticScene {
  caption: string;
  narration?: string;
  durationSec: number;
  photoPath?: string; // local file for this scene
  accent?: string;    // hex without '#'
  background?: string;
}

export interface KineticPlan {
  scenes: KineticScene[];
  accent: string;     // default accent (hex, no '#')
  background: string; // deep background (hex, no '#')
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%');

/** Ken Burns + caption for one scene → a self-contained mp4 segment. */
async function renderScene(scene: KineticScene, i: number, plan: KineticPlan, outDir: string): Promise<string> {
  const dur = Math.max(2, Math.min(10, scene.durationSec || 5));
  const [rx, ry] = REGIONS[i % REGIONS.length];
  const accent = scene.accent || plan.accent;
  const bg = scene.background || plan.background;
  const seg = path.join(outDir, `scene-${i}.mp4`);
  const caption = esc((scene.caption || '').toUpperCase());

  // Text block: glow pass (accent, thick, low alpha) + sharp pass (white).
  // Position math keeps text inside frame at any region.
  const textBlock = (fontColor: string, borderColor: string, size: number, border: number) =>
    `drawtext=fontfile=${FONT}:text='${caption}':fontcolor=${fontColor}:fontsize=${size}:` +
    `borderw=${border}:bordercolor=${borderColor}:x='(w-text_w)*${rx}':y='(h-text_h)*${ry}':` +
    `shadowcolor=black@0.75:shadowx=4:shadowy=4`;

  if (scene.photoPath && fs.existsSync(scene.photoPath)) {
    // Ken Burns: slow zoom-in, centered, scaled to cover 1920x1080.
    const filters = [
      `scale=2400:-2`, // headroom for zoompan without upscaling artifacts
      `zoompan=z='min(zoom+0.0012,1.18)':d=${Math.round(dur * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080`,
      textBlock(`0x${accent}@0.35`, `0x${accent}@0.9`, 86, 10), // glow layer
      textBlock('white', 'white@0.9', 76, 0),           // sharp layer
    ].join(',');
    await run('ffmpeg', [
      '-loop', '1', '-i', scene.photoPath, '-t', String(dur),
      '-vf', filters, '-r', '25',
      '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-an', '-y', seg,
    ]);
  } else {
    // Neon grid fallback: brand background + glowing grid + caption.
    const filters = [
      `drawgrid=w=120:h=120:t=2:c=0x${accent}@0.25`,
      textBlock(`0x${accent}@0.35`, `0x${accent}@0.9`, 86, 10),
      textBlock('white', 'white@0.9', 76, 0),
    ].join(',');
    await run('ffmpeg', [
      '-f', 'lavfi', '-i', `color=c=0x${bg}:s=1920x1080:d=${dur}`,
      '-vf', filters, '-r', '25',
      '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-an', '-y', seg,
    ]);
  }
  return seg;
}

/** Concat scene segments → master (16:9) + crop the 9:16 vertical cut. */
export async function renderKinetic(plan: KineticPlan, outDir: string): Promise<{ master: string; vertical: string }> {
  fs.mkdirSync(outDir, { recursive: true });
  const segs: string[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    segs.push(await renderScene(plan.scenes[i], i, plan, outDir));
  }
  const list = path.join(outDir, 'segments.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
  const master = path.join(outDir, 'master-16x9.mp4');
  await run('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', master]);

  // 9:16 cut: center-crop to 608x1080 (keeps the caption regions readable).
  const vertical = path.join(outDir, 'cut-9x16.mp4');
  await run('ffmpeg', [
    '-i', master, '-vf', 'crop=608:1080:656:0,scale=1080:1920',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-y', vertical,
  ]);
  return { master, vertical };
}

/**
 * Claim + process the next queued kinetic job (sandbox-side watcher seam).
 * Uses the Supabase service key — bypasses RLS by design (the pipeline seat).
 * Flips queued → rendering (atomic claim), renders, uploads outputs to
 * render-outputs/{user_id}/{job_id}/, flips to 'rendered'. One automatic
 * retry is the watcher's policy (attempts counter on the row).
 */
async function claimAndRender(jobId?: string): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing SUPABASE_URL / service key in env');
  const db = createClient(url, key);

  let job: any;
  if (jobId) {
    const { data } = await db.from('render_jobs').select('*').eq('id', jobId).single();
    job = data;
  } else {
    // Atomic claim: oldest queued kinetic job, flip to rendering, take it.
    const { data: next } = await db
      .from('render_jobs').select('*').eq('kind', 'kinetic').eq('status', 'queued')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!next) { console.log('queue empty'); return; }
    const { data: claimed } = await db
      .from('render_jobs').update({ status: 'rendering', attempts: next.attempts + 1, updated_at: new Date().toISOString() })
      .eq('id', next.id).eq('status', 'queued').select('*').single();
    job = claimed;
  }
  if (!job) { console.log('no claim'); return; }
  console.log(`claimed ${job.id}`);

  try {
    const scenes: KineticScene[] = (job.hook_variants?.scenes || []).map((s: any) => ({
      caption: s.caption,
      narration: s.narration,
      durationSec: s.durationSec || 5,
      photoPath: s.photoPath,
    }));
    if (!scenes.length && job.script) {
      // Script-only fallback: one scene per sentence-ish chunk.
      for (const line of job.script.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 6)) {
        scenes.push({ caption: line.replace(/[.!?]+$/, ''), durationSec: 5 });
      }
    }
    if (!scenes.length) throw new Error('no scenes to render');
    const plan: KineticPlan = {
      scenes,
      accent: (job.brand?.accent || '00e5ff').replace('#', ''),
      background: (job.brand?.background || '0a0a14').replace('#', ''),
    };
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-'));
    const { master, vertical } = await renderKinetic(plan, workDir);

    const upload = async (local: string, name: string) => {
      const dest = `${job.user_id}/${job.id}/${name}`;
      const { error } = await db.storage.from('render-outputs')
        .upload(dest, fs.readFileSync(local), { contentType: 'video/mp4', upsert: true });
      if (error) throw new Error(error.message);
      return dest;
    };
    const masterPath = await upload(master, 'master-16x9.mp4');
    const verticalPath = await upload(vertical, 'cut-9x16.mp4');

    await db.from('render_jobs').update({
      status: 'rendered',
      output: { master: masterPath, vertical: verticalPath },
      rendered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    console.log(`rendered ${job.id} -> ${masterPath}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('render_jobs').update({
      status: 'failed', error: msg, updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'rendering');
    throw e;
  }
}

// ---- CLI: render a demo plan locally (no DB) when run with `demo` ----
//            claim+render with `claim [jobId]`
if (process.argv[2] === 'plan') {
  // Render from a JSON plan file (job-data e2e: psql-extracted hook_variants)
  const plan = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) as KineticPlan;
  renderKinetic(plan, path.join(os.tmpdir(), 'kinetic-e2e'))
    .then((r) => { console.log(r.master); console.log(r.vertical); console.log('PLAN-RENDER-OK'); })
    .catch((e) => { console.error('PLAN-RENDER-FAIL', e.message); process.exit(1); });
} else if (process.argv[2] === 'claim') {
  claimAndRender(process.argv[3]).then(() => console.log('CLAIM-OK')).catch((e) => {
    console.error('CLAIM-FAIL', e.message);
    process.exit(1);
  });
} else if (process.argv[2] === 'demo') {
  const demo: KineticPlan = {
    accent: '00e5ff',
    background: '0a0a14',
    scenes: [
      { caption: 'Your business. Your app.', durationSec: 4 },
      { caption: 'Built while you sleep', durationSec: 4 },
      { caption: 'Ads that sell it', durationSec: 4 },
    ],
  };
  renderKinetic(demo, path.join(os.tmpdir(), 'kinetic-demo'))
    .then((r) => {
      for (const f of [r.master, r.vertical]) {
        const st = fs.statSync(f);
        console.log(`${path.basename(f)}: ${(st.size / 1024).toFixed(0)} KB`);
      }
      console.log('DEMO-RENDER-OK');
    })
    .catch((e) => {
      console.error('DEMO-RENDER-FAIL', e.message);
      process.exit(1);
    });
}
