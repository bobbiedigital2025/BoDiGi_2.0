/**
 * API Route: POST /api/interview
 * Plan Mode — a pre-build interview agent. Chats with the founder to draw
 * out the real requirements (problem, audience, features, integrations,
 * monetization) BEFORE a build burns. Two phases:
 *   chat       — one probing question at a time
 *   synthesize — condenses the conversation into a structured build brief
 * The brief becomes the `idea` input to the normal /api/generate pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { callAI, hasAIKey } from '@/lib/agents/ai-client';
import { PROVIDER_COMPARISONS, formatComparisonsForPrompt } from '@/lib/integrations-catalog';

const INTERVIEW_SYSTEM_PROMPT = `You are the BoDiGi 2.0 Plan Agent — a sharp, friendly product strategist who interviews founders BEFORE anything gets built, so the build team creates exactly the right app.

Your job: run a short, focused interview. Ask ONE question at a time. Never ask more than one question per message. Keep each message under 3 sentences.

Draw out, in roughly this order (skip anything the user already told you):
1. The core problem — who hurts, and how they cope with it today
2. Target audience — be specific: who are they, what age range, what technical skill level
3. The 2-4 features that would make them switch (must-haves, not nice-to-haves)
4. Tools/integrations they picture needing (payments, maps, email, AI chat, SMS, etc.)
5. How they hope to make money from it (if they know)
6. Apps they love the look/feel of (sets the design bar)

Style rules:
- React to their answers briefly ("that age range changes the design a lot") before asking the next question — interviews should feel like a conversation, not a form
- If an answer is vague ("everyone", "small businesses"), gently push for specifics ("what kind of small business — a bakery or a bookkeeping firm?")
- If they don't know something, offer 2-3 concrete options to pick from
- Suggest things they haven't thought of when it matters ("you'll probably want email receipts for that — want me to include it?")
- After 5-8 answered questions, or when the user says they're ready, tell them you have enough to plan the build and they can hit "Build my app"
- Never use jargon. The user may never have built software. Say "log in with Google" not "OAuth provider".
- ADVISOR ROLE: when the user mentions a need (payments, email, maps, AI, SMS, file uploads), give a quick recommendation from your provider comparison sheet — name the pick, one reason, and the cost in plain numbers ("free up to 3,000 emails a month"). If they ask "what about X?" or "which is cheapest?", compare the options briefly (2-3 sentences) using the sheet, then land on a recommendation for THEIR needs. Always mention free tiers — founders watch every dollar.

When the user says "build it", "that's enough", "just build it", or similar — do NOT ask more questions. Tell them to hit the Build My App button and the AI team takes it from there.`;

const SYNTHESIZE_SYSTEM_PROMPT = `You convert a founder interview transcript into a structured build brief for an AI app-building team.

Output plain text (no JSON, no markdown headers) in EXACTLY this format:

App idea: <one crisp sentence naming the app concept>
Problem: <who hurts and how they cope today>
Target audience: <specific description including age range and skill level>
Must-have features: <comma-separated list of the 2-4 v1 features that matter>
Tools and integrations: <comma-separated list, or "none specified">
Monetization: <their answer, or "freemium" if unspecified>
Design vibe: <apps/styles they cited, or "clean, modern, approachable" if unspecified>
Extra context: <anything else from the interview the build team should know, or "none">

Be faithful to the transcript. Do not invent requirements. Keep every line under 2 sentences.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.setupAgent);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many messages. Take a breath and try again in a moment.' },
      { status: 429 }
    );
  }

  if (!hasAIKey()) {
    return NextResponse.json(
      { error: 'Plan Agent is not configured yet — set OPENROUTER_API_KEY.' },
      { status: 503 }
    );
  }

  const { messages, phase } = await request.json();

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
  }

  const sanitized: ChatMessage[] = messages
    .slice(-24)
    .map((m: { role: string; content: string }) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: String(m.content || '').slice(0, 3000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''),
    }))
    .filter((m: ChatMessage) => m.content.trim().length > 0);

  if (sanitized.length === 0) {
    return NextResponse.json({ error: 'No valid messages provided' }, { status: 400 });
  }

  const transcript = sanitized.map((m) => `${m.role === 'user' ? 'Founder' : 'Plan Agent'}: ${m.content}`).join('\n');

  try {
    if (phase === 'synthesize') {
      const brief = await callAI(SYNTHESIZE_SYSTEM_PROMPT, `Interview transcript:\n${transcript}\n\nProduce the build brief.`);
      return NextResponse.json({ brief });
    }

    const reply = await callAI(
      `${INTERVIEW_SYSTEM_PROMPT}\n\nPROVIDER COMPARISON SHEET (consult this whenever recommending services or comparing pricing):\n\n${formatComparisonsForPrompt(PROVIDER_COMPARISONS)}`,
      `Interview so far:\n${transcript}\n\nPlan Agent's next message (one question only):`
    );
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Interview agent error:', err);
    return NextResponse.json(
      { error: 'The Plan Agent is having trouble right now — try again in a moment.' },
      { status: 502 }
    );
  }
}
