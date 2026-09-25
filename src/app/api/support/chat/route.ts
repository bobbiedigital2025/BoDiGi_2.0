/**
 * API Route: POST /api/support/chat
 *
 * AI support chat. The agent is fed the user's actual project docs
 * (README, Launch Guide, Build Report) so it knows their build front-to-back.
 * It can answer questions, guide the user, propose fixes via the existing
 * gated modify endpoint (never touching the app directly), and escalate
 * to a human by filing a support ticket (admin sees it in the inbox).
 *
 * Auth required. Rate limited. Falls back to a helpful static reply
 * when no AI key is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createClient } from '@supabase/supabase-js';
import { callAI, hasAIKey } from '@/lib/agents/ai-client';
import { getProjectAnywhere } from '@/lib/agents/pipeline';
import { rateLimit, getClientId } from '@/lib/rate-limit';

const SUPPORT_SYSTEM_PROMPT = `You are the BoDiGi 2.0 support agent. You know this platform front-to-back:

HOW THE PLATFORM WORKS:
- A user describes an app idea; 9 AI agents (PM, Architect, Database, Backend, Frontend, Testing, Compliance, DevOps, Orchestrator) build the complete app: frontend, backend, database schema, API routes, tests, docs.
- The result appears as a live preview at /preview/[projectId] with three tabs: App, Docs, Build Report.
- Docs tab holds README, Investor Pitch, Reality Check, Launch Guide, and (Pro tier) a Marketing Kit.
- Downloading source code: ZIP download on Starter+; GitHub export and live Vercel deploy on Pro+.
- Deploying: users export the code (ZIP or GitHub), import to Vercel, and add environment variables. The Launch Guide doc in their build lists every API key they need and where to get it. The /setup page also walks through getting keys (Telnyx for AI, Supabase for database/auth, Stripe for payments, GitHub, Vercel).
- Tiers: Free (1 build/mo, 7-day preview), Starter (5 builds/mo, 30-day preview, ZIP export), Pro (unlimited builds, GitHub export, live Vercel deploy, marketing kit, modifications), Enterprise (same as Pro + phone support). Admins bypass all gates.
- Modification Pass: Pro+ users can chat-to-edit their app; changes go through the modify pipeline which is gated and safe.

YOUR JOB:
1. Answer questions clearly and kindly, in plain language. Use the user's actual project docs (provided below) when relevant.
2. If the user describes a bug or mistake in their generated app, first try to guide them to fix it themselves (most issues are environment variables or deployment steps).
3. If a real code fix is needed and the user is on a tier that allows modifications (Pro/Enterprise/admin), tell them exactly what to type into the Modification Pass panel — the modify pipeline applies changes safely. NEVER claim you changed their app yourself.
4. If you cannot resolve the issue, say so honestly and offer to escalate to the human support team. When escalating, end your reply with the exact line: ESCALATE: true

RULES:
- Never invent features, prices, or policies.
- Never ask for or repeat API keys or passwords.
- Keep replies under 250 words unless walking through steps.`;

export async function POST(request: NextRequest) {
  try {
    // Auth
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to use support chat.' }, { status: 401 });
    }

    // Rate limit — generous but bounded (20 msgs / 5 min)
    const rl = rateLimit(getClientId(request, user.id), { limit: 20, windowSeconds: 300 });
    if (!rl.success) {
      return NextResponse.json(
        { error: 'You are sending messages very fast. Give it a moment and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const messages: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.messages)
      ? body.messages.slice(-12).map((m: { role: string; content: string }) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || '').slice(0, 4000),
        }))
      : [];
    const projectId: string | undefined = body.projectId;

    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Nothing to send.' }, { status: 400 });
    }

    // Build context: the user's project docs so the AI knows their build
    let projectContext = 'No specific project selected.';
    if (projectId) {
      const project = await getProjectAnywhere(projectId);
      if (project && project.userId === user.id) {
        const s = project.state;
        const docs = project.files
          .filter((f) => ['README.md', 'LAUNCH_GUIDE.md', 'REALITY_CHECK.md'].includes(f.path))
          .map((f) => `--- ${f.path} (excerpt) ---\n${f.content.slice(0, 4000)}`)
          .join('\n\n');
        projectContext = `Project: ${s.name}\nIdea: ${s.idea}\nStatus: ${s.status}\n\n${docs}`;
      } else {
        projectContext = 'The selected project belongs to another account or could not be found.';
      }
    }

    // No AI key — static fallback that still helps
    if (!hasAIKey()) {
      return NextResponse.json({
        reply: "I can't connect to the AI service right now. Meanwhile: most issues are covered in your project's Launch Guide doc (Docs tab) — it lists every API key your app needs and where to get each one. The /setup page also has step-by-step key guides. If you're still stuck, say \"escalate\" and I'll file a ticket for the human support team.",
        escalated: false,
      });
    }

    // Use the shared AI client (OpenRouter preferred, Telnyx fallback)
    const systemWithContext = `${SUPPORT_SYSTEM_PROMPT}\n\nUSER'S PROJECT CONTEXT:\n${projectContext}`;
    const userContent = messages
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');
    let reply = await callAI(systemWithContext, userContent);

    // Escalation: AI decided it can't fix it → file a ticket
    let escalated = false;
    if (/ESCALATE:\s*true/i.test(reply)) {
      reply = reply.replace(/ESCALATE:\s*true/i, '').trim();
      escalated = await fileTicket(user.id, user.email || '', projectId, messages, reply);
      if (escalated) {
        reply += "\n\n🎫 I've filed a support ticket for you — the human team will follow up by email.";
      }
    }

    return NextResponse.json({ reply, escalated });
  } catch (error) {
    console.error('Support chat error:', error);
    return NextResponse.json(
      { error: 'Support chat hit an error. Try again in a moment — or say "escalate" and I\'ll open a ticket for the human team.' },
      { status: 500 }
    );
  }
}

/** File a support ticket from the chat conversation. */
async function fileTicket(
  userId: string,
  userEmail: string,
  projectId: string | undefined,
  messages: { role: string; content: string }[],
  aiSummary: string
): Promise<boolean> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const firstUser = messages.find((m) => m.role === 'user');
  const subject = (firstUser?.content || 'Support request').slice(0, 120);
  const conversation = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Support AI'}: ${m.content}`)
    .join('\n\n')
    .slice(0, 8000);

  let projectName: string | null = null;
  if (projectId) {
    const project = await getProjectAnywhere(projectId);
    projectName = project?.state.name || null;
  }

  const { error } = await admin.from('support_tickets').insert({
    user_id: userId,
    user_email: userEmail,
    project_id: projectId || null,
    project_name: projectName,
    subject,
    body: conversation,
    ai_summary: aiSummary.slice(0, 2000),
    ai_tried: 'AI support chat attempted resolution; escalated to human.',
    status: 'open',
    priority: 'normal',
  });

  return !error;
}
