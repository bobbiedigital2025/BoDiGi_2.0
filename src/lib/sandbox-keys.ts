/**
 * Zero-Key Testing Sandbox
 *
 * Non-technical founders stall when a generated app needs Stripe/Resend/
 * OpenRouter/Supabase keys just to SEE it work. This fills the gap:
 * when a user deploys, BoDiGi injects its own TEST-MODE keys for every
 * service the app needs that the user hasn't provided. The deploy panel
 * then shows the guided handoff — which env vars to replace with
 * production keys before going live.
 *
 * The sandbox keys live in BoDiGi's OWN server env (set in Vercel):
 *   BODIGI_SANDBOX_OPENROUTER_API_KEY   — OpenRouter test key (small credit)
 *   BODIGI_SANDBOX_STRIPE_SECRET_KEY    — Stripe TEST mode key (sk_test_...)
 *   BODIGI_SANDBOX_STRIPE_PUBLISHABLE_KEY
 *   BODIGI_SANDBOX_RESEND_API_KEY       — Resend test key
 *   BODIGI_SANDBOX_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY — shared playground project
 *
 * If a sandbox key isn't configured, that provider is simply skipped —
 * the deploy proceeds exactly as before (fail-open, never blocks).
 */

export interface SandboxProvider {
  provider: string;
  /** generated-app env var → BoDiGi server env var holding the test key */
  envMap: Record<string, string>;
}

export const SANDBOX_PROVIDERS: SandboxProvider[] = [
  {
    provider: 'OpenRouter',
    envMap: { OPENROUTER_API_KEY: 'BODIGI_SANDBOX_OPENROUTER_API_KEY' },
  },
  {
    provider: 'Stripe',
    envMap: {
      STRIPE_SECRET_KEY: 'BODIGI_SANDBOX_STRIPE_SECRET_KEY',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'BODIGI_SANDBOX_STRIPE_PUBLISHABLE_KEY',
    },
  },
  {
    provider: 'Resend',
    envMap: { RESEND_API_KEY: 'BODIGI_SANDBOX_RESEND_API_KEY' },
  },
  {
    provider: 'Supabase',
    envMap: {
      NEXT_PUBLIC_SUPABASE_URL: 'BODIGI_SANDBOX_SUPABASE_URL',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'BODIGI_SANDBOX_SUPABASE_ANON_KEY',
      SUPABASE_SERVICE_ROLE_KEY: 'BODIGI_SANDBOX_SUPABASE_SERVICE_ROLE_KEY',
    },
  },
];

/**
 * Compute the env vars to inject for a project's required APIs.
 * Returns only providers whose sandbox keys are actually configured
 * on this BoDiGi deployment. Never throws — sandbox is best-effort.
 */
export function computeSandboxEnv(
  requiredProviders: string[]
): { env: Record<string, string>; providers: string[]; warnings: string[] } {
  const env: Record<string, string> = {};
  const providers: string[] = [];
  const warnings: string[] = [];

  for (const sp of SANDBOX_PROVIDERS) {
    if (!requiredProviders.some((p) => p.toLowerCase() === sp.provider.toLowerCase())) continue;
    const values: Record<string, string> = {};
    let complete = true;
    for (const [appVar, serverVar] of Object.entries(sp.envMap)) {
      const v = process.env[serverVar];
      if (!v) { complete = false; break; }
      values[appVar] = v;
    }
    if (!complete) continue;

    // ─── Abuse guards: the sandbox must never carry live-power keys ───
    // Stripe: test-mode ONLY. A live key in the sandbox would let a
    // malicious generated app move real money — refuse it outright.
    if (sp.provider === 'Stripe') {
      const secret = values.STRIPE_SECRET_KEY || '';
      if (!secret.startsWith('sk_test_')) {
        warnings.push('Stripe sandbox skipped — BODIGI_SANDBOX_STRIPE_SECRET_KEY is not a test-mode key (sk_test_...). Refusing to inject a live key into a sandboxed app.');
        continue;
      }
    }
    // OpenRouter: can't verify the credit cap from code — the key MUST be
    // a dedicated low-credit key (set the limit in the OpenRouter dashboard).
    // Surface a reminder in the deploy response so it's never forgotten.
    if (sp.provider === 'OpenRouter') {
      warnings.push('Reminder: the sandbox OpenRouter key should be a dedicated key with a hard credit cap set in the OpenRouter dashboard — every sandboxed app can spend from it.');
    }
    // Resend: test sender only; unverified recipient domains bounce anyway.
    if (sp.provider === 'Resend') {
      warnings.push('Reminder: the sandbox Resend key should use a test sender domain — sandboxed apps can send from whatever it is configured with.');
    }

    Object.assign(env, values);
    providers.push(sp.provider);
  }

  return { env, providers, warnings };
}
