/**
 * BoDiGi AI Client
 *
 * Unified AI calling layer with provider failover:
 *
 *   1. OpenRouter (OPENROUTER_API_KEY) — preferred. One key, many
 *      models, pay-as-you-go, no account-level gating. OpenAI-compatible
 *      chat completions API.
 *   2. Telnyx (TELNYX_API_KEY) — legacy fallback. Kept so existing
 *      deployments don't break if the OpenRouter key is missing.
 *
 * Default model: GPT-4o mini via OpenRouter — cheap, fast, reliable
 * structured output. Override with AI_MODEL env var (any OpenRouter
 * model slug, e.g. "google/gemini-2.5-flash", "anthropic/claude-3.5-haiku").
 *
 * When neither key is configured, agents fall back to their default
 * generators (boilerplate mode).
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TELNYX_URL = 'https://api.telnyx.com/v2/ai/chat/completions';

/** Default model — cheapest tier with strong structured JSON output. */
const DEFAULT_MODEL = process.env.AI_MODEL || 'openai/gpt-4o-mini';
/** Telnyx model if falling back to Telnyx. */
const TELNYX_MODEL = 'MiniMaxAI/MiniMax-M3-MXFP8';

interface Provider {
  url: string;
  key: string;
  model: string;
  label: string;
}

function getProvider(): Provider | null {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    return { url: OPENROUTER_URL, key: orKey, model: DEFAULT_MODEL, label: 'OpenRouter' };
  }
  const txKey = process.env.TELNYX_API_KEY;
  if (txKey) {
    return { url: TELNYX_URL, key: txKey, model: TELNYX_MODEL, label: 'Telnyx' };
  }
  return null;
}

/** True when any AI provider key is available. */
export function hasAIKey(): boolean {
  return getProvider() !== null;
}

/** AI connection status for display in the dashboard. */
export function getAIStatus(): { connected: boolean; model: string } {
  const p = getProvider();
  return { connected: p !== null, model: p ? p.model : 'none' };
}

/**
 * Call the AI with a system prompt and user prompt.
 * Returns the raw text content of the response.
 * Throws on API errors — callers should catch and fall back.
 */
export async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No AI provider configured (set OPENROUTER_API_KEY or TELNYX_API_KEY)');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s max per call

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${provider.key}`,
    'Content-Type': 'application/json',
  };
  // OpenRouter recommends these for app attribution/ranking
  if (provider.label === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://bodigi2.com';
    headers['X-Title'] = 'BoDiGi 2.0';
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers,
    signal: controller.signal,
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${provider.label} API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI returned an empty response');
  }

  return content;
}
