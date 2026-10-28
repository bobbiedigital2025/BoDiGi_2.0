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
 * Codegen roles (database, backend, frontend) default to Claude Sonnet 5.5
 * on OpenRouter — build quality IS the product. Override per role with
 * AI_MODEL_DATABASE / AI_MODEL_BACKEND / AI_MODEL_FRONTEND.
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

/** Codegen quality floor for the three code-writing roles (OpenRouter only). */
const CODEGEN_MODEL = 'anthropic/claude-sonnet-5.5';
const CODEGEN_ROLES = new Set(['database', 'backend', 'frontend']);

/**
 * Role-aware call budgets (Oct 17 KDP-build incident).
 *
 * Codegen stages (database/backend/frontend) emit whole-stage JSON file
 * manifests — 40–100KB. With the old flat budget (90s / max_tokens 8192),
 * Sonnet's thinking spent most of the token budget and the response JSON
 * came back truncated or empty, silently degrading big builds to template
 * fallbacks ("AI returned an empty response" / JSON parse errors).
 *
 * Codegen gets the near-full Vercel window (270s of the 300s maxDuration)
 * and a 32K-token budget. Lightweight calls (docs, summaries, marketing)
 * keep the small/fast budget so they never hog a window.
 */
function budgetForRole(role?: string): { timeoutMs: number; maxTokens: number } {
  if (role && CODEGEN_ROLES.has(role)) {
    return { timeoutMs: 270_000, maxTokens: 32_768 };
  }
  return { timeoutMs: 90_000, maxTokens: 8_192 };
}

/** Approximate per-token dollar cost by model, for usage analytics. */
const MODEL_PRICE: Record<string, { input: number; output: number }> = {
  'openai/gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
  'anthropic/claude-sonnet-5.5': { input: 0.000002, output: 0.00001 },
};

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
export function getAIStatus(): { connected: boolean; model: string; label: string } {
  const p = getProvider();
  return { connected: p !== null, model: p ? p.model : 'none', label: p ? p.label : 'AI' };
}

/**
 * The model hit its output-token ceiling mid-response (finish_reason=length).
 * `partial` holds whatever content arrived — codegen runners use it to
 * request a continuation from the exact cut point instead of silently
 * falling back to starter templates.
 */
export class TruncatedError extends Error {
  readonly partial: string;

  constructor(partial: string, detail: string) {
    super(detail);
    this.name = 'TruncatedError';
    this.partial = partial;
  }
}

/**
 * Call the AI with a system prompt and user prompt.
 * Returns the raw text content of the response.
 * Throws on API errors — callers should catch and fall back.
 */
export async function callAI(systemPrompt: string, userPrompt: string, role?: string, opts?: { rawContinuation?: boolean }): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No AI provider configured (set OPENROUTER_API_KEY or TELNYX_API_KEY)');
  }

  // Per-role model override: AI_MODEL_FRONTEND / AI_MODEL_BACKEND / AI_MODEL_DATABASE
  // let codegen run a stronger model while docs/summary calls stay on the default.
  const roleModel = role ? process.env[`AI_MODEL_${role.toUpperCase()}`] : undefined;
  const model = roleModel
    || (provider.label === 'OpenRouter' && role && CODEGEN_ROLES.has(role)
      ? CODEGEN_MODEL
      : provider.model);

  const budget = budgetForRole(role);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budget.timeoutMs);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${provider.key}`,
    'Content-Type': 'application/json',
  };
  // OpenRouter recommends these for app attribution/ranking
  if (provider.label === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://bodigi2.com';
    headers['X-Title'] = 'BoDiGi 2.0';
  }

  // Thinking models burn the output budget on reasoning before writing a
  // single content token — the Oct 15 "builds not good" root cause.
  // Probed Oct 28 (Juno): OpenRouter's reasoning.max_tokens is ACCEPTED
  // but INERT for anthropic/claude-sonnet-5.5 on every provider — 500 and
  // 2000 caps, Anthropic-native thinking passthrough, first-party pin:
  // all burned the full budget on reasoning with zero content. What DOES
  // bound the burn is response_format json_object — the model interleaves
  // thinking with output instead of thinking until the budget dies (probe:
  // 1926 reasoning tokens + 1944 chars of real content). Codegen manifests
  // are JSON by contract, so this is free. The reasoning cap stays as
  // belt-and-suspenders in case OpenRouter ever maps it. rawContinuation
  // (salvage resume) opts OUT: a mid-token continuation must not be forced
  // into a standalone valid JSON object.
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: budget.maxTokens,
  };
  if (provider.label === 'OpenRouter' && role && CODEGEN_ROLES.has(role) && !opts?.rawContinuation) {
    body.response_format = { type: 'json_object' };
  }
  if (provider.label === 'OpenRouter' && model === CODEGEN_MODEL) {
    body.reasoning = { max_tokens: 8_000 };
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers,
    signal: controller.signal,
    body: JSON.stringify(body),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${provider.label} API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content: string | undefined = choice?.message?.content;
  const finishReason: string | undefined = choice?.finish_reason;

  // ─── Usage accounting — BEFORE the truncation checks so full-budget
  // burns (the most expensive calls) still reach the ledger (RUNE's Oct 28
  // Finding 3a). Awaited: the relay chain-handoff exits the function
  // context, which kills fire-and-forget fetches — that is why zero rows
  // landed after 04:18 UTC (Finding 3b). Still wrapped so accounting can
  // never break generation.
  try {
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const price = MODEL_PRICE[model] ?? MODEL_PRICE['openai/gpt-4o-mini'];
    const estCostCents = (inputTokens * price.input + outputTokens * price.output);
    await logAiUsage({
      kind: currentCallKind || 'other',
      model,
      inputTokens,
      outputTokens,
      estCostCents,
    });
  } catch { /* accounting must never break generation */ }

  // finish_reason=length = the output ceiling cut the response mid-stream.
  // Throw a typed error so codegen runners can attempt a continuation from
  // the cut point instead of parsing a half-written manifest and silently
  // falling back to templates. With thinking models this can also arrive
  // with EMPTY content — the whole budget went to reasoning. Both shapes
  // are truncation.
  if (finishReason === 'length') {
    throw new TruncatedError(
      typeof content === 'string' ? content : '',
      content
        ? `AI response hit the ${budget.maxTokens}-token output ceiling mid-manifest (finish_reason=length)`
        : `AI spent the entire ${budget.maxTokens}-token output budget on reasoning before writing any content (finish_reason=length, empty response)`
    );
  }
  if (!content) {
    throw new Error('AI returned an empty response');
  }

  return content;
}

/**
 * Usage accounting context — routes set the call kind + user/project
 * before calling the AI so the ledger attributes costs correctly.
 */
let currentCallKind: string | null = null;
let currentUserId: string | null = null;
let currentProjectId: string | null = null;

export function setUsageContext(kind: string, userId?: string, projectId?: string) {
  currentCallKind = kind;
  currentUserId = userId || null;
  currentProjectId = projectId || null;
}

/** Default image model — Gemini 2.5 Flash Image via OpenRouter (~4¢/image). */
const IMAGE_MODEL = process.env.AI_IMAGE_MODEL || 'google/gemini-2.5-flash-image';

/**
 * Generate an image from a text prompt (OpenRouter image models only).
 * Returns the image as raw base64 (no data-URL prefix).
 * Throws on API errors or when no image is returned — callers should catch.
 */
export async function callImageAI(prompt: string): Promise<string> {
  const rawKey = process.env.OPENROUTER_API_KEY;
  if (!rawKey) {
    throw new Error('Image generation requires OPENROUTER_API_KEY');
  }
  // Tolerate accidental whitespace/newlines baked into the key at save time.
  const key = rawKey.replace(/\s+/g, '');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 3 min — images are slow

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bodigi2.com',
      'X-Title': 'BoDiGi 2.0',
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: IMAGE_MODEL,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter image API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const images = data.choices?.[0]?.message?.images;
  const dataUrl: string | undefined = images?.[0]?.image_url?.url;
  if (!dataUrl || !dataUrl.includes(',')) {
    throw new Error('Image model returned no image');
  }

  // ─── Usage accounting (fire-and-forget) ───
  try {
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    // Gemini 2.5 Flash Image: $30/M output tokens (~1290 tokens/image ≈ 3.9¢)
    const estCostCents = (inputTokens * 0.00000015 + outputTokens * 0.00003);
    await logAiUsage({
      kind: currentCallKind || 'image',
      model: IMAGE_MODEL,
      inputTokens,
      outputTokens,
      estCostCents,
    });
  } catch { /* accounting must never break generation */ }

  return dataUrl.split(',', 2)[1];
}

async function logAiUsage(entry: {
  kind: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostCents: number;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  // Awaited by callers — the relay chain-handoff exits the function
  // context, which kills unawaited fetches (Oct 28: zero usage rows after
  // 04:18 UTC). Swallows its own errors: best-effort accounting must
  // never break generation.
  return fetch(`${url}/rest/v1/ai_usage_log`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify([{
      user_id: currentUserId,
      project_id: currentProjectId,
      kind: entry.kind,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      est_cost_cents: entry.estCostCents,
    }]),
  }).then(() => undefined).catch(() => { /* silent — accounting never breaks generation */ });
}
