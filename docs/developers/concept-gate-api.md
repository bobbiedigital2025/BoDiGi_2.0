# Concept Gate API

Every BoDiGi build starts at the Concept Gate. You send an app idea; the gate classifies the content, drafts a one-screen **Concept Card** for your approval, and only then — when you approve — does a build fire. The approval is server-enforced: there is no API path to a build that skips the gate.

The gate does two jobs on every submission:

1. **Content classification** — explicit adult content is refused outright (`blocked`); borderline content is held for human review (`flagged`); everything else passes (`clean`).
2. **Card drafting** — an AI drafts the Concept Card you review, iterate, and approve. If the drafting AI is unavailable, the gate falls back to a minimal card built from your own text — the gate never dead-ends.

## Statuses

A concept moves through this lifecycle:

```
drafting ──▶ presented ──⇄── iterating
                │
                ├──▶ approved ──▶ building  (project linked)
                ├──▶ flagged ──▶ (admin review) ──▶ presented | blocked
                ├──▶ cancelled
                └──▶ blocked
```

| Status | Meaning |
|--------|---------|
| `drafting` | Card is being drafted (transient — creation returns `presented`) |
| `presented` | Card is ready for your approve / iterate / cancel decision |
| `iterating` | Your feedback is being folded into the next card version (transient) |
| `approved` | You approved, but the build has not fired (for example, quota was exhausted — upgrade and return) |
| `building` | The build is running; the concept is linked to its project |
| `flagged` | Card is visible, but one detail is under human review; the build waits |
| `blocked` | Content does not meet the rules — no card flow, no build, ever |
| `cancelled` | You abandoned the concept before approving |

The `classifier` field mirrors the last classification result: `pending`, `clean`, `borderline`, or `blocked`.

## The Concept Card

```json
{
  "name": "PawSlots",
  "tagline": "Grooming appointments that book themselves",
  "pitch": "A focused booking flow for a dog-grooming studio...",
  "screens": ["Services and prices — pick a groom package", "..."],
  "mustHaves": ["Slot calendar with studio-set availability", "..."],
  "notBuilding": ["Staff scheduling and rota management", "..."],
  "look": "Warm, friendly, rounded — playful illustrations, soft browns and teals"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | The app's working name |
| `tagline` | string | One line positioning |
| `pitch` | string | What the app is, in a short paragraph |
| `screens` | string[] | 3–5 one-line screen descriptions, in walkthrough order |
| `mustHaves` | string[] | The 2–4 v1 features the build will include |
| `notBuilding` | string[] | 2–3 things this build deliberately does **not** include |
| `look` | string | The design vibe in one line |

The approved card snapshot — not your raw idea — is what the build uses. `notBuilding` is as binding as `mustHaves`.

---

## Create a concept

```http
POST /api/concept
```

Classifies your idea and drafts a Concept Card. Nothing builds yet.

**Rate limit:** 10 requests per hour per account.

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `idea` | string | yes | The app idea, at least 10 characters. Trimmed to 2,000 characters; control characters stripped |
| `source` | string | no | `'idea'` (default) or `'interview'` when the idea came from a Plan Mode interview brief |

```json
{ "idea": "A booking app for my dog-grooming studio — clients pick a slot, pay a deposit, and get an automatic reminder the day before." }
```

### Responses

**`200` — card presented (or flagged for review)**

```json
{
  "conceptId": "concept-1791921091218-hhi84t",
  "status": "presented",
  "classifier": "clean",
  "card": { "name": "...", "tagline": "...", "pitch": "...", "screens": [], "mustHaves": [], "notBuilding": [], "look": "..." }
}
```

When the classifier marks the idea borderline, `status` is `"flagged"`, the card is still returned, and a `flaggedNotice` field explains that the build waits for review:

```json
{
  "conceptId": "concept-1791921091218-hhi84t",
  "status": "flagged",
  "classifier": "borderline",
  "card": { "..." : "..." },
  "flaggedNotice": "Your concept card is ready. Our team is reviewing one detail before the build can start — you can still refine the card below."
}
```

**`403` — blocked.** Explicit adult content: no card is drafted, the concept is recorded as `blocked`, and the response includes a `conceptId` you can inspect later.

```json
{
  "conceptId": "concept-1791921091218-hhi84t",
  "status": "blocked",
  "error": "We can't build this one — the concept doesn't meet our content rules. If you think that's a mistake, contact support@bobbie.digital."
}
```

**`400`** — idea missing, not a string, or under 10 characters.
**`401`** — no authenticated session.
**`429`** — rate limited; respect `Retry-After`.

---

## Fetch a concept

```http
GET /api/concept/{conceptId}
```

Returns the full concept record — owner or admin only. This is the endpoint to poll while you are deciding, and it carries the status the card page renders.

### Response

```json
{
  "concept": {
    "id": "concept-1791921091218-hhi84t",
    "user_id": "00000000-0000-0000-0000-000000000000",
    "source": "idea",
    "source_idea": "A booking app for my dog-grooming studio...",
    "status": "presented",
    "card": { "..." : "..." },
    "card_version": 1,
    "iterations": [],
    "classifier": "clean",
    "classifier_reason": null,
    "project_id": null,
    "created_at": "2026-10-31T02:14:11.000Z",
    "updated_at": "2026-10-31T02:14:11.000Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Concept identifier — `concept-<timestamp>-<random>` |
| `status` | string | Lifecycle status (see above) |
| `card` | object | The current Concept Card |
| `card_version` | integer | Increments with every iteration |
| `iterations` | array | History of `{ feedback, card, at }` records |
| `classifier` | string | Last classification verdict |
| `classifier_reason` | string \| null | Why the classifier (or an admin reviewer) reached its verdict |
| `project_id` | string \| null | The linked project once the build fires |

**`404`** — no such concept, or it belongs to another user.

---

## Iterate on a concept

```http
POST /api/concept/{conceptId}/iterate
```

Send feedback on the current card; get a revised card back. Elements you do not mention carry forward unchanged. Iterations are uncapped — they do not consume build quota; the only bound is the rate limit.

**Rate limit:** 30 requests per hour per account.

Allowed from `presented`, `iterating`, or `flagged` (flagged concepts can keep refining while review happens — they still cannot build until cleared).

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `feedback` | string | yes | What to change, at least 3 characters. Trimmed to 1,000 characters |

```json
{ "feedback": "Skip the deposit — flat free booking instead. Keep the reminders." }
```

### Responses

**`200` — revised card.** Every iteration is re-classified, so content that drifts is caught. The response mirrors concept creation (`conceptId`, `status`, `card`, `card_version`, `classifier`, and `flaggedNotice` when flagged).

**`403` — blocked.** If the revision crosses the content line, the concept is closed as `blocked` — start a fresh idea instead.

**`409`** — the concept is in a state that does not allow iteration (for example `building`, `approved`, `cancelled`, or `blocked`).

---

## Approve a concept

```http
POST /api/concept/{conceptId}/approve
```

The approved moment — the only door to a build. Fires the multi-agent pipeline from the approved card snapshot and returns the project it created.

Allowed **only** from `presented`. Flagged concepts must wait for an admin clear; blocked concepts never build.

### Request body

None.

### Responses

**`200` — build started.**

```json
{ "projectId": "proj-1791922488102-k3j9ra", "message": "Approved! The AI team is starting your build..." }
```

**Idempotent:** approving a concept that is already `building` returns the existing project:

```json
{ "projectId": "proj-1791922488102-k3j9ra", "message": "Build already running" }
```

**`403` — quota exhausted.** Build quota is checked here, at the moment of burn. The concept is set to `approved` and stays yours — upgrade, then approve again:

```json
{
  "error": "Your Free plan includes 1 build per month. You've used 1/1. ...",
  "quota": { "tier": "free", "used": 1, "limit": 1 },
  "upgradeUrl": "/pricing",
  "conceptApproved": true
}
```

**`409` — wrong state.** The error message explains the exact situation:

| Concept state | Response message |
|---------------|------------------|
| `flagged` | "This concept is under review — the build unlocks as soon as our team clears it." |
| `blocked` | "This concept doesn't meet our content rules and can't be built." |
| `cancelled` | "This concept was cancelled — start a fresh idea anytime." |
| `drafting` | "The concept card is still being drafted — refresh in a moment." |
| `iterating` | "The card is mid-revision — try again in a few seconds." |

**`404`** — no such concept, or not yours.

---

## Cancel a concept

```http
POST /api/concept/{conceptId}/cancel
```

Abandons a concept before the build. Your idea text stays in your history — nothing is deleted.

Allowed from `drafting`, `presented`, `iterating`, `flagged`, or `approved`. A concept that is already `building` cannot be cancelled here — cancel it from the build page in your dashboard instead.

### Response

```json
{ "status": "cancelled" }
```

---

## Admin review queue

*These endpoints require an account with the `admin` role.*

### List flagged concepts

```http
GET /api/admin/flagged-concepts
```

Returns the borderline-content review queue, newest first (up to 50):

```json
{
  "flagged": [
    {
      "id": "concept-1791921091218-hhi84t",
      "user_id": "00000000-0000-0000-0000-000000000000",
      "source": "idea",
      "source_idea": "...",
      "status": "flagged",
      "card": { "..." : "..." },
      "card_version": 2,
      "classifier": "borderline",
      "classifier_reason": "...",
      "created_at": "2026-10-31T02:14:11.000Z"
    }
  ]
}
```

### Record a review verdict

```http
POST /api/admin/flagged-concepts/{conceptId}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | yes | `'clear'` or `'block'` |

- `clear` returns the concept to `presented` — the founder can approve and build.
- `block` closes the concept as `blocked`.

Only concepts currently `flagged` can be reviewed. The verdict is recorded in the concept's `classifier_reason` field (audit trail).

**`403`** — your account does not have the `admin` role.

---

## Content rules in brief

The classifier exists to keep the platform buildable for everyone. Explicit adult content is refused outright. Borderline submissions are held for a human look — the card stays visible and iterable while under review, and a cleared concept builds normally. If you believe a verdict is wrong, contact [support@bobbie.digital](mailto:support@bobbie.digital).
