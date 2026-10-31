# BoDiGi 2.0 — Developer Documentation

**BoDiGi 2.0** is an AI-powered application factory: you describe an app in plain English, approve a one-screen concept card, and a team of specialized AI agents builds the full stack — frontend, backend, database schema, API routes, tests, compliance docs, and deployment configuration.

These docs cover the public HTTP API that powers [bodigi2.com](https://bodigi2.com): the Concept Gate (every build's front door), the build pipeline, the video render pipeline, and the plan limits that govern them.

## Documentation

| Page | What it covers |
|------|----------------|
| [Authentication](./authentication.md) | How API requests are authenticated, and how to call the API programmatically |
| [Quickstart](./quickstart.md) | Your first build via the API, end to end |
| [Concept Gate API](./concept-gate-api.md) | Create, review, iterate, approve, and cancel concepts — plus the admin review queue |
| [Render Pipeline](./render-pipeline.md) | Video render jobs, the pay-per-video flow, and the render completion webhook |
| [Tiers & Limits](./tiers-and-limits.md) | Plans, build quotas, AI-change caps, and rate limits |
| [Integration Guide](./integration-guide.md) | Patterns for building a reliable client on top of the API |

## Conventions

**Base URL**

```
https://bodigi2.com
```

All paths in these docs are relative to the base URL. Every endpoint speaks JSON: send `Content-Type: application/json` and expect JSON back.

**Error envelope**

Errors are always a JSON object with a human-readable `error` field. Some endpoints add structured fields (for example, quota details on a build-quota rejection):

```json
{
  "error": "Your Free plan includes 1 build per month. You've used 1/1. Upgrade to build more — your apps run on your own API keys, so higher tiers cost us nothing extra to serve you.",
  "quota": { "tier": "free", "used": 1, "limit": 1 },
  "upgradeUrl": "/pricing"
}
```

**Status codes**

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Invalid input — fix the request body and retry |
| `401` | No authenticated session — see [Authentication](./authentication.md) |
| `402` | Payment required — a purchase must clear before the action runs |
| `403` | Not allowed — content-policy blocks, quota exhaustion, or missing admin rights |
| `404` | Not found — the resource does not exist **or** belongs to another user |
| `409` | Conflict — the resource is in a state that does not allow this action |
| `429` | Rate limited — respect the `Retry-After` header (seconds) |
| `500` | Server error — safe to retry idempotent operations after a moment |
| `503` | Not available yet — the capability is staged but not enabled |

**Ownership and privacy**

Every resource is scoped to the authenticated account. Requests for another user's concept, project, or render return `404` (not `403`) — the API never confirms that someone else's resource exists. Row-level security in the database enforces the same boundary.

**Rate limits**

Most endpoints are rate-limited per account. When you exceed a limit you receive `429` with a `Retry-After` header measured in seconds. Exact limits are listed in [Tiers & Limits](./tiers-and-limits.md).

## Current status of the API surface

These docs describe what is deployed today. Where a capability is staged but not yet enabled (for example, campaign package purchases), the reference says so explicitly and shows the exact response you will get — we do not document aspirational endpoints.

---

*Questions or something in these docs that doesn't match what you're seeing? Contact [support@bobbie.digital](mailto:support@bobbie.digital).*
