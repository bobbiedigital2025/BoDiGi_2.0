# BoDiGi Spec Template (PRD Generator)

Every fix and feature gets specced through this template **before building**. Sized to the job — a spec too heavy for small work gets skipped, so the small path is official:

| Size | When | Depth |
|---|---|---|
| **FIX** | Bug fix, small improvement, hardening | One tight paragraph per section; skip sections that don't apply. ~5 min. |
| **FEATURE** | New capability, user-facing or pipeline | Full sections. ~20-30 min. |
| **TRIVIAL** | Typos, copy, CSS tweaks, dependency bumps | No spec. Good commit message only. |

**Header block (every spec):**
```
Title: <one line>
Date / Author / Status: draft | approved | shipped
Size: FIX | FEATURE
Model tier (if AI is used): <model> — cheapest that clears the bar; say why it clears it
```

---

## 1. Problem & Revenue Impact
What's broken or missing, who it hurts, and the money math: revenue protected or created, cost avoided — or "no direct revenue; here's the ops/quality story." A spec with neither a money story nor an ops story doesn't get built.

## 2. Architecture & Data Flow
Components touched, data flow end-to-end, files/tables/migrations, deploy surface (which projects/routes). One change per deploy — if this spec implies two changes, it's two specs.

## 3. Security-Auth-Isolation
Auth boundaries, RLS, tenant isolation, key handling (env vars, never literals), rate limits. Anything touching **payments, auth, or schema** gets flagged here — those carry extra gates (Modify Pass can't touch them; neither does a casual fix).

## 4. Acceptance Criteria
Testable statements, and the ship rules ride every spec:
- **Shipped = Vercel READY** — a green local build proves nothing.
- **Done ≠ verified** until someone LOOKS at the rendered app.
- Follow-up fixing runs the 3-strike cap: fix → strip to minimal viable → HALT + NEEDS_REVIEW. Never loop.

## Standing rules (every spec inherits)
- Cheapest model that clears the bar; declared in the header.
- One change per deploy; verify READY before calling anything live.
- Never invent features or fake APIs — unsupported request = "on the roadmap" + the current working solution.
- User builds are private (RLS) — never showcase one without an opt-in "share my build" toggle.
- Keys, secrets, and builder prompts never reach users or outbound payloads.

---

## Worked example — FIX size

```
Title: Preflight secret-scan kernel — detect hardcoded keys in generated code before delivery
Date: Oct 24 2026 / Author: Juno / Status: shipped
Size: FIX
Model tier: none (deterministic static scan — no AI)
```

**1. Problem & Revenue Impact.** Generated code or exports can embed real API keys as literals; a key that ships inside a customer's GitHub repo is leaked the moment they push it. One leaked Stripe or OpenRouter key costs more than every build we've ever run. No direct revenue — this is the trust story: "your app is yours" must never mean "your app leaks our keys."

**2. Architecture & Data Flow.** One seam: `runPreflight()` in `src/lib/deploy/preflight.ts` — both delivery paths (GitHub export via `ensureExportScaffold`, Vercel deploy via the same scaffold) already flow through it. New `scanSecrets()` pass + `secretFindings` on the report + one narration line in `preflightLogLines()`. No schema, no routes, no deploy surface change.

**3. Security-Auth-Isolation.** Scan is read-only over the file set; findings store pattern class + file path + 4-char redacted preview — **never the secret value** (logs are customer-visible; keys never reach logs or users). v1 is log-only: delivery is not blocked until the false-positive rate is proven low in production; blocking arms as v2.

**4. Acceptance Criteria.**
- `runPreflight` on a file set containing `sk_live_…` in a `.ts` file produces one `secretFindings` entry labeled `stripe-live-secret-key` with a redacted preview.
- Placeholder keys (`YOUR_API_KEY`, `sk_test_123`, `<...>`) produce zero findings.
- A clean file set produces zero findings and the existing "all imports and packages check out" line unchanged.
- Deploy goes READY on push; existing preflight behavior (dep/bridge) byte-identical on a clean set.

*Specced shape from RUNE's c50ce02 assessment (#14 kernel: same family as stub fingerprints; Vercel serverless — no Docker assumptions).*
