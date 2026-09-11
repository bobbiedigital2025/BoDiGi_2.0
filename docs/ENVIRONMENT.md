# Environment Variables Reference

All env vars live in **Vercel → bo-di-gi-2-0-plmk → Settings → Environment Variables**.
After adding or changing ANY var: **Deployments → ⋯ → Redeploy → uncheck "Use existing build cache"**.
Each var must be enabled for **Production** (and Preview) — a var saved only to Development does nothing in production.

## Values you can copy directly (not secrets)

| Var | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://bo-di-gi-2-0-plmk.vercel.app` |
| `EMAIL_FROM` | `BoDiGi 2.0 <onboarding@resend.dev>` |
| `STRIPE_PRICE_STARTER` | `price_1UCa0W5tpYluUonhFqq82Udp` |
| `STRIPE_PRICE_PRO` | `price_1UCa1j5tpYluUonhpkzdUs8m` |
| `STRIPE_PRICE_ENTERPRISE` | `price_1UCa3b5tpYluUonhEexidPkr` |

(Price IDs are identifiers, not credentials — safe to keep in this private repo.)

## Values that live in dashboards (never commit these)

| Var | Where to get it | Starts with |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key → Reveal **test** key | `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → adventurous-finesse → Signing secret → Reveal | `whsec_` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | `https://` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → Publishable key | `sb_` / `eyJ` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → Secret key | `sb_` / `eyJ` |
| `TELNYX_API_KEY` | Telnyx portal → Auth → API keys | `KEY` |
| `LETTA_API_KEY` | Letta dashboard → API keys | `sk-let` |
| `RESEND_API_KEY` | Resend → API Keys | `re_` |
| `ENCRYPTION_KEY` | generated (in `/root/downloads/newkeys.txt` on the sandbox) | base64 |
| `CRON_SECRET` | generated (same file) | hex |
| `SENTRY_DSN` | Sentry → bobbie-digital-qw → javascript-nextjs → Client Keys | `https://` (optional) |
| `NEXT_PUBLIC_SENTRY_DSN` | same value as SENTRY_DSN | `https://` (optional) |

## Common mistakes (we hit all of these)

1. **`sk_test_` in the webhook secret field.** `STRIPE_SECRET_KEY` gets `sk_test_...`; `STRIPE_WEBHOOK_SECRET` gets `whsec_...`. They are different secrets from different Stripe pages.
2. **Rolling the signing secret.** Don't click the circular "roll" arrow in Stripe's webhook page unless you mean to kill the old secret. Reveal + copy only.
3. **Forgetting to redeploy.** Env vars only apply to builds created *after* the var was saved.
4. **Using build cache after env changes.** Uncheck it — cached builds can bake in old/missing vars.
5. **Wrong environment scope.** Check Production + Preview on every var.
6. **Product ID vs Price ID.** Env vars want `price_...` (click into the product → click the price), not `prod_...`.

## Health checks

```bash
# Webhook alive + verifying signatures (want 400, NOT 500):
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://bo-di-gi-2-0-plmk.vercel.app/api/stripe/webhook \
  -H "Content-Type: application/json" -d '{"type":"test"}'

# Site up:
curl -s -o /dev/null -w "%{http_code}\n" https://bo-di-gi-2-0-plmk.vercel.app/
```
