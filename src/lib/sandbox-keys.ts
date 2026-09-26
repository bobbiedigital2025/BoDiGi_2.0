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
): { env: Record<string, string>; providers: string[] } {
  const env: Record<string, string> = {};
  const providers: string[] = [];

  for (const sp of SANDBOX_PROVIDERS) {
    if (!requiredProviders.some((p) => p.toLowerCase() === sp.provider.toLowerCase())) continue;
    const values: Record<string, string> = {};
    let complete = true;
    for (const [appVar, serverVar] of Object.entries(sp.envMap)) {
      const v = process.env[serverVar];
      if (!v) { complete = false; break; }
      values[appVar] = v;
    }
    if (complete) {
      Object.assign(env, values);
      providers.push(sp.provider);
    }
  }

  return { env, providers };
}
