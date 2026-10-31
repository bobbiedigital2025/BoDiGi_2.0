# Integration Guide

Patterns for building a reliable client on top of the BoDiGi API. Everything here reflects behavior that is enforced server-side today.

## Idempotency and safe retries

The API is built for safe retries at every state-changing step:

| Operation | Idempotency behavior |
|---|---|
| Approve a concept | If the build is already running, you get the same `projectId` back with `"Build already running"` — never a second build |
| Start a paid render | If the render was already submitted, you get the existing `videoId` — never a double bill |
| Concept creation | Not idempotent — each call drafts a new concept. Guard against double-submits in your client |

A network timeout is not a failure verdict. On timeout, fetch the resource and check its state before retrying: `GET /api/concept/{id}` tells you whether an approve landed (status `building` + `project_id`), and the project poll tells you whether a build exists.

## Polling patterns

**During a build** — poll `GET /api/generate/{projectId}` every few seconds. Watch `state.status`:

- `planning` → `building` → `testing` → `deploying` → `done` is the happy path.
- `done` — read `deploymentUrl` and stop polling.
- `failed` — stop polling; the project record keeps its logs for diagnosis. Start a fresh build from the same concept with a new approve if you want to retry.
- Stalled builds (no progress for 15+ minutes) are automatically flipped to `failed` by the platform watchdog — you never poll a dead build forever.

**During a paid render** — poll `GET /api/generate/{projectId}/ad/render?video_id=...` until `status` is `completed` or `failed`. On `completed`, the URLs are persisted to your project's ad kit, so you can drop the `video_id` afterward.

**While deciding on a card** — you do not need to poll at all: concept creation and iteration return the card synchronously. Poll `GET /api/concept/{id}` only to check whether a flagged concept has been cleared for building (status flips `flagged` → `presented`).

## Error handling

Every error is `{"error": "human-readable message"}`. Some endpoints add structured fields — handle them programmatically:

- **Quota rejections** (`403` from approve): a `quota` object (`tier`, `used`, `limit`) plus `upgradeUrl`, and `conceptApproved: true` so you know the concept is saved as approved.
- **Rate limits** (`429`): honor `Retry-After` (seconds). The window is per account — waiting is the only cure.
- **Payment pending** (`402` from render start): the purchase has not cleared yet. Wait a few seconds and retry; the Stripe webhook needs to land first.
- **Wrong state** (`409`): the message names the exact state and what it means. These are not errors to retry blindly — read the state, then act.
- **Not found** (`404`): either the resource does not exist, or it belongs to another account. The API does not distinguish — treat as "not mine to touch."

## Sessions in long-running clients

Sessions expire. In a long-running script or server integration:

1. Sign in ([Authentication](./authentication.md), Option B).
2. On any `401`, discard the session, sign in again, and replay the request — all state-changing operations you might replay are idempotent or state-checkable as above.
3. Never persist a session cookie to disk longer than you need it. It is the credential.

## Ownership model

Every list, fetch, and mutation is scoped to the authenticated account, enforced twice — in the route handler and again by Row Level Security in the database. Design your client so account context is explicit: one session per user, no shared sessions between users of your integration.

## What not to build against

- **Don't scrape the dashboard HTML.** Everything the dashboard shows comes from the documented endpoints on these pages.
- **Don't cache provider URLs.** Render output links you receive are minted for you; treat any long-lived reference as a storage path, not a URL.
- **Don't build against staged endpoints.** Where a capability is staged (campaign purchases today), the docs say so and show the exact `503` you will get. This page is the source of truth: when a staged capability launches, its full flow appears here.
