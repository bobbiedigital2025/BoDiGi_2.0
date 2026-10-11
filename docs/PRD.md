# BoDiGi 2.0 — Product Requirements Document

**Last updated:** October 11, 2026 · **Owner:** Bobbie Jo Gray (Founder) · **Status:** Live in production at https://bodigi2.com

---

## 1. Vision

Non-technical founders bring an idea; a team of eleven specialized AI agents builds the business around it — app, documents, launch tools, and marketing — in minutes. The founder owns everything: code, hosting, keys. No lock-in, ever.

**Positioning line:** "You bring the idea and AI builds a business that you own."

BoDiGi is not a dev tool. It competes on being a *business builder* for entrepreneurs, not on code generation for developers.

## 2. Honest Expectations (standing disclaimer)

BoDiGi gives the founder a head start — not a guaranteed business. Using the Service does not guarantee success, revenue, or users. Real businesses require substantial ongoing work on the founder's end (marketing, sales, support, operations, persistence). This disclaimer appears in the Terms of Service (§3), on the homepage ("One honest promise" strip + footer fine print), and in the README. All marketing copy must stay consistent with it: we sell a head start, never an outcome.

## 3. Target Users

- **Primary:** non-technical founders and small-business owners with an idea and no team
- **Secondary:** side-hustlers validating ideas before spending real money
- **Excluded (for now):** professional developers wanting fine-grained control

## 4. Tiers & Pricing

| | Free | Starter $19.99/mo | Pro $49.99/mo | Enterprise $199/mo |
|---|---|---|---|---|
| Builds | 1/mo | 5/mo | Unlimited (fair use) | Unlimited (fair use) |
| Preview expiry | 7 days | 30 days | Never (while subscribed) | Never |
| AI modifications | 3 trial uses | ✓ | ✓ | ✓ |
| Rollback, GitHub export, Day-2 PRs | — | ✓ | ✓ | ✓ |
| Marketing kit | — | — | ✓ | ✓ |
| Support | Community | Email | Priority | Phone + SLA |

**Unit economics guardrails:** per-build AI cost ≈ $0.20–1.50 on the default model. "Unlimited" is governed by a fair-use clause (Terms §7); per-app AI caps (15/mo Starter, 50/mo Pro) already exist in `quota.ts`. 25% of every payment auto-carves into the AI reserve ledger.

**Promo codes:** FLASH10 ($10 off, 200 redemptions, expires Dec 1 2026), DEPLOY5 ($5 off, earned by passing the /training quiz, 100 redemptions). Rules: one per customer, no stacking, expiry enforced, withdrawable anytime (Terms §6).

## 5. Feature Inventory (current)

**Pre-build:** Plan Mode interview agent · required-APIs detection · provider pricing advisor · terms gate · example ideas

**Build pipeline (11 agents):** Nova (PM) · Atlas (Architecture) · Vault (Database) · Forge (Backend) · Prism (Frontend) · Scout (Testing) · Aegis (Compliance) · Pilot (DevOps) · Scribe (Docs) · Mend (Healing) · Brand/Proof agent. Letta agent path primary; OpenRouter direct path (`gpt-4o-mini` default) with Telnyx legacy fallback. Per-role model overrides via `AI_MODEL_<ROLE>`.

**Build Memory (Oct 11):** the platform's learning loop. `build_lessons` table stores generalized rules extracted from (a) every Modify Pass (the clearest user-feedback signal), (b) post-build reflection on warnings/fallbacks, (c) manual seeds. All codegen agents read role-relevant lessons into their prompts before generating. Memory degrades silently — it can never break a build.

**Post-build:** Modify Pass (natural-language edits; snapshot first; can't touch auth/payments/schema; Reality-Check weakness chips → one-click fix) · version history + rollback · Day-2 healing agent (diagnosis + fix PRs) · Engagement Loop Builder (max 8 loops)

**Deployment:** one-click deploy to the user's own Vercel account (OAuth; revocable; app keeps running) · Domain Assistant · custom domain setup · Zero-Key Sandbox (test-mode keys auto-injected, guided handoff to real keys)

**Monetization surfaces:** Stripe subscriptions (live mode verified) · pay-per-video Ad Studio ($4.99/30s, $12.99/1–2min; render after payment clears; 25% to AI reserve) · template marketplace ($0–5000, 80/20 split)

**Docs per build:** README · INVESTOR_PITCH · REALITY_CHECK (honest pros/cons, risks, difficulty) · LAUNCH_GUIDE · MARKETING_KIT (Pro+: brand voice, launch posts, social, email sequences, 30-day plan)

**Ad Studio:** HeyGen v3 (Avatar V engine), SRT captions, 16:9 + 9:16, founder voice clone + avatar twin, per-app ad kits.

**Platform pages:** landing · pricing · FAQ (GEO/JSON-LD) · showcase + investor pages · templates gallery · training/quiz (DEPLOY5) · settings (tabs: Account / Documents / Connections / Features / Accessibility) · API Keys & Connections vault (per-project keys, Test buttons) · admin (users, security audit, accounting) · support inbox

**Security/compliance:** 22+ RLS policies · rate limiting · security headers · AES-256-GCM key storage · admin security audit panel · accounting panel (revenue vs AI spend vs margin)

## 6. Architecture

Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS + Auth + Storage) · Stripe (live) · Resend · Vercel · Letta Cloud (agent orchestration) · OpenRouter (primary inference) · Telnyx (legacy fallback) · HeyGen (video). Migrations 001–017 in `supabase/migrations/`.

## 7. Success Metrics

- Signups/week and free→paid conversion (north star)
- Build success rate (no fallback) and median build duration
- Modify Pass usage per project (engagement proxy)
- Cost per build vs tier economics (admin accounting panel)
- Lessons applied per build (Build Memory health)

## 8. Roadmap (priority order)

1. **Verification build of Build Memory** end-to-end (migration 017 live → build → confirm lessons read/write)
2. Fair-use counter enforcement for unlimited tiers (protects the unit economics in §4)
3. Vertical 9:16 ad cut pipeline for TikTok/Reels/Shorts (marketing)
4. GitHub export UI button (backend + migration 006 done; UI pending)
5. OAuth providers (Google/GitHub) enablement in Supabase
6. 2FA (TOTP + passkey roadmap defined)
7. Day-2+ visions (parked per founder decision): gamified education platform, build-to-earn credits, marketplace revenue share, full-hosted option
