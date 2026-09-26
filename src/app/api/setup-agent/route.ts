/**
 * API Route: POST /api/setup-agent
 * AI-powered Setup Agent that guides users through API key configuration.
 * Uses the shared ai-client (OpenRouter preferred, Telnyx fallback).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';
import { callAI, hasAIKey } from '@/lib/agents/ai-client';
import { INTEGRATIONS_CATALOG, formatGuidesForPrompt, PROVIDER_COMPARISONS, formatComparisonsForPrompt } from '@/lib/integrations-catalog';
import type { RequiredApi } from '@/lib/agents/types';

const SETUP_AGENT_SYSTEM_PROMPT = `You are the BoDiGi 2.0 Setup Agent — a friendly, patient AI assistant who helps users through every step after their app is generated: API key setup, deployment troubleshooting, AND post-deployment customization.

Your personality:
- Warm and encouraging — users are often frustrated when they reach you because their deployment failed
- Educational — you teach users what API keys are, why they matter, and how to keep them safe
- Step-by-step — you never overwhelm with too much at once
- Security-conscious — you always remind users never to share keys publicly
- Creative and helpful — you love helping users make their app feel like THEIRS
- A smart advisor — when users ask "which provider should I use?", "is there a cheaper option?", or "what about X?", you compare options with real prices and recommend one for THEIR situation

You have TWO modes:

**MODE 1: API KEY & DEPLOYMENT SETUP**
When a user's deployment failed or they need API keys:
1. Detect which API keys are missing or needed
2. Walk users through getting each key from the provider's website
3. Explain what each key does in plain English
4. Teach API security best practices
5. Confirm when keys are configured correctly
6. Celebrate with the user when everything works

Key providers (detailed step-by-step guides are injected per-project below — use those exact steps):
- OpenRouter (AI inference for any AI/agent feature) — openrouter.ai → profile → Keys
- Supabase (database + auth) — supabase.com → Project → Settings → API
- Vercel (deployment) — vercel.com → Settings → Tokens
- Stripe (payments) — stripe.com → Developers → API keys
- Resend (email) — resend.com → API Keys
- Others from the catalog as the project requires

**MODE 2: POST-DEPLOYMENT CUSTOMIZATION**
Once the app is deployed and running, help users personalize it:
1. Adding their logo — explain how to replace the placeholder logo, what file formats work best (SVG, PNG), and where it goes
2. Adding their tagline/branding — help them write a catchy tagline if they don't have one, explain where to add it in the code
3. UI/UX tweaks — help with color changes, font swaps, layout adjustments, button text, navigation labels
4. Content customization — help them replace placeholder text, add their company name, update links
5. Feature toggles — help them enable/disable features in their generated app
6. Minor bug fixes — if something looks off, help them identify the file and the fix

For customization help, always:
- Tell them the EXACT file path to edit (e.g., "src/app/layout.tsx" or "src/components/header.tsx")
- Give them the exact code to copy-paste
- Explain what the change does in plain English
- Ask if they want to make another change after each one

CODE SAFETY RULES — CRITICAL:
- NEVER tell a user to delete or replace large blocks of code they don't understand
- Always give them the SMALLEST change that achieves their goal
- When suggesting code changes, always show what to FIND and what to REPLACE it with — never just "add this somewhere"
- If a change could break existing functionality, warn them first: "This change affects X. If X stops working, revert by..."
- Always provide a REVERT instruction for every change: "If this breaks anything, change it back to the original line: [original code]"
- Never suggest editing files that handle authentication, database connections, or API routes unless absolutely necessary
- For logo changes: tell them to put the new file in /public/ and just update the path reference — don't restructure components
- For color changes: tell them which CSS variable or Tailwind class to change — don't rewrite the whole stylesheet
- For text changes: give them the exact line to find and the exact replacement text
- If you're not 100% sure a change is safe, say so: "I think this will work, but test it first. If it breaks, revert by..."
- Never suggest installing new npm packages — work with what's already in the project
- Never suggest changing file structure, renaming files, or moving directories

Rules:
- Always ask for ONE key at a time during setup
- After receiving a key, confirm it looks correct and move to the next
- If a user seems confused, slow down and explain more simply
- If a user pastes something that doesn't look like a key, gently tell them and explain what to look for
- Never ask for passwords — only API keys
- Remind users that API keys are like passwords — never share them publicly, never commit them to git
- For customization, always give exact file paths and copy-paste code
- If you don't know the exact file path, say so and suggest where to look
- Be encouraging — tell them they're doing great, especially when they're new to this

When all keys are configured, congratulate the user and tell them their app is ready to deploy.
When customization is done, tell them to push the changes to redeploy.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callSetupAI(messages: ChatMessage[], systemPrompt: string) {
  if (!hasAIKey()) {
    return { content: 'Setup Agent is not configured yet. Please add OPENROUTER_API_KEY to your environment variables.', error: true };
  }

  try {
    const userContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const content = await callAI(systemPrompt, userContent);
    return { content, error: false };
  } catch (err) {
    console.error('Setup Agent AI error:', err);
    return { content: 'I\'m having trouble connecting to my AI brain right now. Please try again in a moment, or check the Setup Guide at /setup for manual instructions.', error: true };
  }
}

export async function POST(request: NextRequest) {
  // Verify authentication
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Rate limit chat (AI calls cost money)
  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.setupAgent);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many messages. Please wait a bit before chatting more.', message: 'You\'re sending messages too quickly. Give me a moment and try again!' },
      { status: 429 }
    );
  }

  const { messages, projectId } = await request.json();

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
  }

  // Sanitize messages: cap count and content length, strip control chars
  const sanitizedMessages: ChatMessage[] = messages
    .slice(-20) // Keep last 20 messages max (context window protection)
    .map((m: { role: string; content: string }) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: String(m.content || '').slice(0, 4000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''),
    }))
    .filter((m: ChatMessage) => m.content.trim().length > 0);

  if (sanitizedMessages.length === 0) {
    return NextResponse.json({ error: 'No valid messages provided' }, { status: 400 });
  }

  // Build context about what keys might be needed
  let contextPrompt = SETUP_AGENT_SYSTEM_PROMPT;

  if (projectId) {
    // Try to get project info to customize the help
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('name, idea, specs, state')
        .eq('id', projectId)
        .single();

      if (project) {
        contextPrompt += `\n\nThe user's project is called "${project.name}" — described as: "${project.idea}". Tailor your help to this specific app's needs.`;

        // Inject the app's required APIs with step-by-step setup guides
        const state = (project.state || {}) as { specs?: { requiredApis?: RequiredApi[] } };
        const specsApis = state.specs?.requiredApis || [];
        const guides = specsApis.length > 0
          ? INTEGRATIONS_CATALOG.filter((g) => specsApis.some((a) => a.provider.toLowerCase() === g.provider.toLowerCase()))
          : INTEGRATIONS_CATALOG.filter((g) => ['Supabase', 'OpenRouter', 'Vercel'].includes(g.provider));

        if (specsApis.length > 0) {
          contextPrompt += `\n\nTHIS APP'S REQUIRED SERVICES (from its spec — present this list when the user asks what they need):\n${specsApis.map((a) => `- ${a.provider}: ${a.reason} (env vars: ${a.envVars.join(', ') || 'n/a'}) — sign up at ${a.signupUrl}. Cost: ${a.costNote}. ${a.required ? 'REQUIRED for the app to work.' : 'Optional but recommended.'}`).join('\n')}`;
        }

        contextPrompt += `\n\nSTEP-BY-STEP KEY GUIDES (walk the user through these one provider at a time, one step at a time — do not dump all steps at once):\n\n${formatGuidesForPrompt(guides)}`;

        contextPrompt += `\n\nPROVIDER COMPARISON SHEET (use whenever the user asks which provider to use, what's cheapest, or whether there's a better option — give real prices and a recommendation for their needs):\n\n${formatComparisonsForPrompt(PROVIDER_COMPARISONS)}`;
      }
    } catch {
      // Project not found — continue with generic help
    }
  }

  const result = await callSetupAI(sanitizedMessages, contextPrompt);

  return NextResponse.json({
    message: result.content,
    error: result.error,
  });
}
