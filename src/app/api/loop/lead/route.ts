/**
 * Engagement loop v2 — the Honest Verdict catcher.
 * POST /api/loop/lead  { name?, email, idea, ref?, website? (honeypot) }
 *
 * Flow: honeypot + rate limit → dedupe (same email+idea returns the
 * cached verdict, no AI re-burn) → insert the lead FIRST (the lead is
 * the gold — stored before the AI call) → one cheap-model verdict call
 * (Market / Money / Execution) → welcome email (E1) carrying the verdict.
 *
 * Migration 019 (loop_leads) required. Until it's pasted, this route
 * returns 503 "warming-up" and the page shows a friendly message.
 * Phase 2: a daily job should pick up leads with null verdicts (AI
 * failed at submit time) and re-run them.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, getClientId } from '@/lib/rate-limit';
import { callAI } from '@/lib/agents/ai-client';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

const IDEA_MIN = 20;
const IDEA_MAX = 2000;
// Each verdict burns real AI money — same tightness as the build endpoint.
const VERDICT_LIMIT = { limit: 5, windowSeconds: 3600 };

interface VerdictAgent {
  verdict: string;
  score: number;
}
interface LoopVerdict {
  market: VerdictAgent;
  money: VerdictAgent;
  execution: VerdictAgent;
  pivot: string;
  first_move: string;
}

function makeRefCode(): string {
  // No ambiguous chars (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const VERDICT_SYSTEM_PROMPT = `You are three blunt-but-kind business analysts giving an honest verdict on someone's business idea: Market (is there demand, who else is doing it), Money (how does this actually earn), and Execution (how hard is it to start, what's the first step).

Rules:
- Be honest, specific, and useful. No flattery, no generic filler. If the idea is weak, say why — then give the version that works.
- Plain language a regular person understands. Zero jargon.
- Scores are honest 1-10 (10 = excellent). Most real ideas land 3-7. Don't inflate.
- Respond with ONLY valid JSON, no markdown fences, exactly this shape:
{"market":{"verdict":"1-2 sentences","score":N},"money":{"verdict":"1-2 sentences","score":N},"execution":{"verdict":"1-2 sentences","score":N},"pivot":"one sentence - the adjustment that makes this idea stronger","first_move":"one concrete action they can take this week"}`;

function verdictEmailHtml(name: string | null, idea: string, verdict: LoopVerdict | null, refCode: string | null): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bodigi2.com';
  const firstName = name ? name.split(' ')[0] : 'there';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const refLink = refCode ? `${appUrl}/loop.html?ref=${refCode}` : `${appUrl}/loop.html`;

  const verdictBlock = verdict ? `
    <div style="margin:24px 0;">
      <div style="padding:14px 16px;background:#1a2233;border-left:3px solid #f0b429;border-radius:8px;margin-bottom:10px;">
        <div style="color:#f0b429;font-weight:700;font-size:13px;margin-bottom:4px;">MARKET — ${verdict.market.score}/10</div>
        <div style="color:#e8eaf0;font-size:14px;line-height:1.55;">${esc(verdict.market.verdict)}</div>
      </div>
      <div style="padding:14px 16px;background:#1a2233;border-left:3px solid #f0b429;border-radius:8px;margin-bottom:10px;">
        <div style="color:#f0b429;font-weight:700;font-size:13px;margin-bottom:4px;">MONEY — ${verdict.money.score}/10</div>
        <div style="color:#e8eaf0;font-size:14px;line-height:1.55;">${esc(verdict.money.verdict)}</div>
      </div>
      <div style="padding:14px 16px;background:#1a2233;border-left:3px solid #f0b429;border-radius:8px;">
        <div style="color:#f0b429;font-weight:700;font-size:13px;margin-bottom:4px;">EXECUTION — ${verdict.execution.score}/10</div>
        <div style="color:#e8eaf0;font-size:14px;line-height:1.55;">${esc(verdict.execution.verdict)}</div>
      </div>
    </div>
    <div style="padding:16px 18px;background:#231a08;border:1px solid #f0b42955;border-radius:10px;margin:24px 0;">
      <div style="color:#f0b429;font-weight:700;font-size:13px;margin-bottom:6px;">THE PIVOT</div>
      <div style="color:#e8eaf0;font-size:14px;line-height:1.55;margin-bottom:14px;">${esc(verdict.pivot)}</div>
      <div style="color:#f0b429;font-weight:700;font-size:13px;margin-bottom:6px;">YOUR FIRST MOVE THIS WEEK</div>
      <div style="color:#e8eaf0;font-size:14px;line-height:1.55;">${esc(verdict.first_move)}</div>
    </div>`
    : `
    <div style="padding:14px 16px;background:#1a2233;border-left:3px solid #f0b429;border-radius:8px;margin:24px 0;">
      <div style="color:#e8eaf0;font-size:14px;line-height:1.55;">Your full verdict is being written right now — it'll land in your inbox shortly. Your idea is saved, you're on the list.</div>
    </div>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:28px;">
    <h1 style="color:#fff;font-size:20px;margin:0;">BoDiGi 2.0</h1>
    <div style="color:#f0b429;font-size:13px;margin-top:4px;">The Honest Verdict</div>
  </div>
  <p style="color:#e8eaf0;font-size:15px;line-height:1.6;">Hi ${esc(firstName)},</p>
  <p style="color:#e8eaf0;font-size:15px;line-height:1.6;">You asked for the truth about this idea:</p>
  <div style="padding:14px 16px;background:#111a2e;border-radius:8px;color:#c8cede;font-size:14px;font-style:italic;line-height:1.55;margin:16px 0;">"${esc(idea.slice(0, 400))}${idea.length > 400 ? '…' : ''}"</div>
  ${verdictBlock}
  <p style="color:#e8eaf0;font-size:15px;line-height:1.6;"><b>Want it built?</b> Eleven AI agents will build the whole thing — app, docs, the works. Your first build is free:</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${appUrl}/signup" style="display:inline-block;background:linear-gradient(135deg,#f0b429,#d97706);color:#0a0e1a;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">Build my idea — free</a>
  </div>
  <p style="color:#8b93a7;font-size:13px;line-height:1.6;">New accounts get a 3-day Pro trial automatically — unlimited builds, code downloads, no lock-in. Your code, your hosting, your keys. Use code <b style="color:#f0b429;">FLASH10</b> for $10 off any paid plan.</p>
  <p style="color:#8b93a7;font-size:13px;line-height:1.6;">Know someone with a notes-app idea? Your invite link: <a href="${refLink}" style="color:#f0b429;">${refLink}</a></p>
  <p style="color:#525a6e;font-size:12px;text-align:center;margin-top:32px;">BoDiGi 2.0 — You bring the idea. AI builds the business.<br><a href="${appUrl}" style="color:#8b93a7;">bodigi2.com</a></p>
</div>
</body></html>`;
}

export async function POST(request: Request) {
  // Rate limit — verdicts cost real AI money
  const rl = rateLimit(getClientId(request), VERDICT_LIMIT);
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: 'rate-limited' }, { status: 429 });
  }

  let body: { name?: string; email?: string; idea?: string; ref?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-body' }, { status: 400 });
  }

  // Honeypot — bots fill hidden fields. Silent fake success, nothing stored.
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true, verdict: null, ref_code: null });
  }

  const email = (body.email || '').trim().toLowerCase();
  const idea = (body.idea || '').trim();
  const name = (body.name || '').trim() || null;
  const referredBy = (body.ref || '').trim().toUpperCase() || null;

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: 'invalid-email' }, { status: 400 });
  }
  if (idea.length < IDEA_MIN || idea.length > IDEA_MAX) {
    return NextResponse.json({ ok: false, error: 'invalid-idea' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Dedupe: same email + same idea returns the cached verdict (no AI re-burn)
  try {
    const existing = await supabase
      .from('loop_leads')
      .select('id, verdict, ref_code')
      .eq('email', email)
      .eq('idea_text', idea)
      .limit(1);
    if (existing.data && existing.data.length > 0) {
      return NextResponse.json({
        ok: true,
        verdict: existing.data[0].verdict,
        ref_code: existing.data[0].ref_code,
        cached: true,
      });
    }
  } catch (err) {
    // Most likely: table missing = migration 019 not pasted yet
    console.error('[loop/lead] dedupe check failed:', err);
    return NextResponse.json({ ok: false, error: 'warming-up' }, { status: 503 });
  }

  // Insert the lead FIRST — the lead is the gold; the verdict can be re-run
  const refCode = makeRefCode();
  let leadId: string;
  try {
    const inserted = await supabase
      .from('loop_leads')
      .insert({ email, name, idea_text: idea, source: 'loop', ref_code: refCode, referred_by: referredBy })
      .select('id')
      .single();
    if (!inserted.data) {
      throw new Error('insert returned no row');
    }
    leadId = inserted.data.id;
  } catch (err) {
    console.error('[loop/lead] insert failed:', err);
    return NextResponse.json({ ok: false, error: 'warming-up' }, { status: 503 });
  }

  // One cheap-model call for the verdict
  let verdict: LoopVerdict | null = null;
  try {
    const raw = await callAI(VERDICT_SYSTEM_PROMPT, `Business idea:\n"""${idea}"""`, undefined);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as LoopVerdict;
    if (
      !parsed.market?.verdict || !parsed.money?.verdict || !parsed.execution?.verdict ||
      !parsed.pivot || !parsed.first_move
    ) {
      throw new Error('verdict shape incomplete');
    }
    verdict = parsed;
    await supabase.from('loop_leads').update({ verdict }).eq('id', leadId);
  } catch (err) {
    // Lead is stored. Phase 2: daily job re-runs null-verdict leads.
    console.error('[loop/lead] verdict generation failed (lead stored):', err);
  }

  // Welcome email (E1) — always sends; carries the verdict when we have one
  try {
    await sendEmail({
      to: email,
      subject: verdict ? 'Your honest verdict is in' : 'Your idea is in — verdict coming',
      html: verdictEmailHtml(name, idea, verdict, refCode),
    });
  } catch (err) {
    console.error('[loop/lead] welcome email failed (lead stored):', err);
  }

  return NextResponse.json({ ok: true, verdict, ref_code: refCode });
}
