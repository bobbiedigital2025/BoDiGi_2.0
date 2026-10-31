# Render Pipeline

BoDiGi's Ad Studio turns a built app into video ads. This page documents how renders work over the API: the render job model, the pay-per-video flow that is live today, the render completion webhook, and what is still staged.

Two things to know up front:

1. **Renders require an ad kit.** Every render narrates your project's ad script. Generate the kit first with `POST /api/generate/{projectId}/ad` (see below).
2. **Render outputs are private.** Finished videos live in a private storage bucket, scoped to your account — never a public URL you did not mint.

## The render job model

Renders are recorded in the `render_jobs` table — the system of record for the render system. Nothing depends on anyone remembering: payment, provider job, completion, and delivery are all on the row.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | The job's identity. For HeyGen renders, this same value is the provider `callback_id` — completions are routed back to the exact job |
| `kind` | string | `'avatar'` (HeyGen talking-avatar video) or `'kinetic'` (typography + voice video, rendered locally with ffmpeg) |
| `product` | string | What the job produces: `'video_30'`, `'video_long'`, or `'campaign'` |
| `status` | string | Lifecycle below |
| `provider` | string | `'heygen'` or `'kinetic-ffmpeg'` |
| `provider_job_id` | string | The HeyGen `video_id` once submitted |
| `output` | JSON | Storage paths of the finished files (master, cuts) |
| `attempts` | integer | Render attempts — retries are visible, not silent |
| `error` | string | Failure reason, when `status` is `failed` |

**Status lifecycle**

```
queued ──▶ rendering ──▶ rendered ──▶ finishing ──▶ done
              │
              ├──▶ failed
              └──▶ cancelled
```

Access is owner-only, enforced by Row Level Security. Outputs are stored under `render-outputs/{user_id}/{job_id}/` in a private bucket — your files, readable only by your account.

## Pay-per-video avatar renders (live)

The live flow for a talking-avatar ad video, from script to screen:

### 1. Generate the ad kit

```http
POST /api/generate/{projectId}/ad
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `length` | number | no | `15`, `30` (default), or `60` seconds |
| `angle` | string | no | A persuasive angle for the script |

Returns the ad kit: a script, storyboard scenes in your brand's voice, and hashtags. `GET` on the same path returns the existing kit without regenerating.

### 2. Pick an avatar and voice

```http
GET /api/generate/{projectId}/ad/avatars
```

Returns the avatars and voices available to the platform's HeyGen account:

```json
{
  "configured": true,
  "avatars": [
    {
      "avatar_id": "...",
      "name": "...",
      "type": "photo_avatar",
      "preview_url": "https://...",
      "supported_engines": ["avatar_iv", "avatar_v"],
      "gender": "female"
    }
  ],
  "voices": [
    { "voice_id": "...", "name": "...", "language": "English", "gender": "Female", "preview_url": "https://..." }
  ]
}
```

### 3. Pay for the render

```http
POST /api/generate/{projectId}/ad/render/checkout
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tier` | string | no | `'short'` — 30-second ad, **$4.99** (default) — or `'long'` — 1–2 minute ad, **$12.99** |
| `avatarId` | string | yes | From the avatar list |
| `voiceId` | string | yes | From the voice list |
| `dimension` | string | no | `'16:9'` (default) or `'9:16'` vertical |

Creates a Stripe Checkout session and returns its URL. **The render never starts until payment clears** — a webhook flips the purchase to `paid` first.

### 4. Start the render

```http
POST /api/generate/{projectId}/ad/render/start
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `purchaseId` | number | yes | The purchase created at checkout |

Called once your session returns from Stripe and the purchase shows `paid`. Idempotent: if the render was already submitted, you get the existing `videoId` back instead of a double render.

- **`200`** — `{ "videoId": "...", "status": "rendering" }`
- **`402`** — payment has not cleared yet; retry after the webhook lands
- **`503`** — video rendering is not configured on the platform

### 5. Poll until the video is ready

```http
GET /api/generate/{projectId}/ad/render?video_id={videoId}
```

Returns the render status and persists the finished URLs on your project:

```json
{
  "status": "completed",
  "videoUrl": "https://...",
  "thumbnailUrl": "https://...",
  "subtitleUrl": "https://...",
  "durationSeconds": 30,
  "error": null
}
```

`status` is one of `pending`, `processing`, `completed`, `failed`, or `unknown`. On `completed`, the URLs are also saved into your project's ad kit, so the dashboard and future API calls can find them without the `video_id`.

## Kinetic renders

Kinetic videos (`kind: 'kinetic'`) are typography-and-voice ads rendered by BoDiGi's own ffmpeg renderer — no third-party provider, no per-render provider cost. A kinetic job is claimed from the `render_jobs` queue, rendered into a 16:9 master plus a 9:16 vertical cut, uploaded to your private output folder, and flipped to `rendered`.

Kinetic renders are the engine behind campaign packages (below), which are staged pending launch.

## The render completion webhook

```http
POST /api/webhooks/heygen
```

This endpoint is operated by BoDiGi — HeyGen calls it when a `render_jobs`-tracked avatar render finishes. You do not call it directly, but its contract matters if you are reasoning about how completions work:

- **Routing.** Each render submission carries `callback_id = render_jobs.id`, so a completion lands on the exact job that started it.
- **Fast ACK.** The endpoint flips the job status and acknowledges within HeyGen's 10-second window; heavy work (downloading the finished file) happens after the acknowledgment.
- **Idempotent.** Duplicate deliveries are safe — the status flip only takes effect while the job is still `rendering`.
- **Private banking.** The finished master file is downloaded from a short-lived provider URL into BoDiGi's private storage — the expiring URL is never stored as a permanent link.

Failed renders flip the job to `failed` with the provider's error message on the row.

## Campaign packages (staged)

Ad Studio's campaign layer — one master script, three hook variants, six cut videos, per-platform posting copy, and a day-by-day posting plan — is implemented but **not yet purchasable**. Until pricing launches, the campaign endpoints answer honestly:

```json
{ "error": "Campaigns are launching soon — pricing is being finalized." }
```

with HTTP `503`. When campaigns launch, this page will document the purchase flow with the same end-to-end detail as the pay-per-video flow above.

## What this means for your integration

- Today, build against the **pay-per-video flow** (steps 1–5 above) — it is live end to end.
- Treat `render_jobs` statuses and the webhook contract as the stable vocabulary: renders are queued, rendering, rendered, done — or failed with a reason.
- Never cache provider URLs long-term; minted links for private outputs are the only durable addresses.
