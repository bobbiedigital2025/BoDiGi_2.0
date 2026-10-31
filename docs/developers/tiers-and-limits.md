# Tiers & Limits

BoDiGi plans govern three things: how many apps you can build, how many AI changes each app can absorb, and how fast you can call the API. This page lists the exact numbers your code will run into.

## Plans

| | Free | Starter | Pro | Enterprise |
|---|---|---|---|---|
| **Price** | $0 | $19.99/mo | $49.99/mo | $199/mo |
| **Builds** | 1 per 30 days | 5 per 30 days | 10 per day (fair-use) | Unlimited |
| **AI changes per app** | 3, lifetime | 15 per month | 50 per month | Unlimited |
| **Code export** | — | ZIP | ZIP + GitHub | ZIP + GitHub |
| **Live preview** | 7 days | 30 days | Unlimited | Unlimited |
| **Custom domain** | — | — | ✓ | ✓ |

Every new signup automatically starts on a **3-day Pro trial** — the full pipeline, unlimited-feel quotas, priority everything. The one thing the trial never includes is code export: permanent artifacts stay behind a paid plan.

When a paid period lapses, the account resolves to Free at read time — there is no "stuck tier" state to handle in your client.

## Build quota

Checked at the moment of burn — when you **approve** a concept — not when you draft or iterate cards. Draft and iterate as much as you like within the rate limits; only approvals consume builds.

When quota runs out, the approve call returns `403` with the details and — importantly — `conceptApproved: true`: the concept is locked in as approved, and you can return to it after upgrading. See [Concept Gate API](./concept-gate-api.md#approve-a-concept).

## AI-change caps

Every AI modification to a built app (modify passes, Day-2 fixes, loop wiring) counts against the per-app cap for your plan. Free accounts additionally have a lifetime total of 3 AI modifications across all apps before the Pro gate applies. When a cap is hit, the response tells you which cap and what resets it (monthly caps reset; the free trial cap upgrades).

## Rate limits

Rate limits are per account, enforced in a rolling window. On `429`, stop and wait for the `Retry-After` header (seconds) — hammering does not speed anything up.

| Endpoint family | Limit |
|---|---|
| Concept creation (`POST /api/concept`) | 10 per hour |
| Concept iteration | 30 per hour |
| Build approval / generation | 5 per hour |
| Stripe checkout | 10 per hour |
| GitHub export | 8 per hour |
| API key storage writes | 20 per hour |
| API key validation pings | 15 per hour |
| General API surface | 100 per minute |

## What this means in practice

- **A free-tier API tour:** draft concepts and iterate cards freely (rate limits only), approve one build per month, and spend its 3 AI changes carefully.
- **A production integration on Pro:** 10 builds a day and 50 AI changes per app per month cover a busy agency schedule; poll politely and respect `Retry-After`.
- **Quota responses are structured.** Parse the `quota` object (`tier`, `used`, `limit`) to render your own upgrade prompts instead of string-matching error text.
