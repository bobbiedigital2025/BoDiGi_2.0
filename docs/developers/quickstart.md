# Quickstart — your first build via the API

This guide takes you from a plain-English app idea to a running, deployed application using only the HTTP API. The same flow powers the bodigi2.com dashboard.

The shape of a build:

```
idea ──▶ POST /api/concept ──▶ Concept Card
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
                 approve         iterate        cancel
                    │              │
                    ▼              └─▶ new card version ─▶ approve
        build fires (projectId)
                    │
                    ▼
        poll GET /api/generate/{projectId}
                    │
                    ▼
        state.status === 'done' ──▶ deploymentUrl
```

Nothing builds until you approve a concept card. That approval gate is server-enforced — there is no way to start a build without going through it.

> **Heads-up on quota:** approving a concept consumes one build from your plan's quota (Free includes 1 build per month). If you just want to see a concept card without building, skip step 4 — drafting and iterating cards does not consume build quota.

## 1. Get a session

Every request needs an authenticated session. Follow [Authentication](./authentication.md) — Option B (scripted sign-in) is what the example below uses.

## 2. Create a concept

Send your idea to the Concept Gate. It classifies the content, drafts a one-screen Concept Card, and returns it for your review:

```bash
curl -X POST https://bodigi2.com/api/concept \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-YOUR-PROJECT-REF-auth-token=VALUE" \
  -d '{
    "idea": "A booking app for my dog-grooming studio — clients pick a slot, pay a deposit, and get an automatic reminder the day before."
  }'
```

A successful response looks like this:

```json
{
  "conceptId": "concept-1791921091218-hhi84t",
  "status": "presented",
  "classifier": "clean",
  "card": {
    "name": "PawSlots",
    "tagline": "Grooming appointments that book themselves",
    "pitch": "A focused booking flow for a dog-grooming studio: clients choose a service, pick an open slot, pay a deposit online, and receive a reminder the day before their visit.",
    "screens": [
      "Services and prices — pick a groom package",
      "Calendar — choose an open slot",
      "Checkout — pay the deposit",
      "Confirmation — booking details and reminder opt-in"
    ],
    "mustHaves": [
      "Slot calendar with studio-set availability",
      "Deposit checkout",
      "Day-before automatic reminders"
    ],
    "notBuilding": [
      "Staff scheduling and rota management",
      "Multi-location support"
    ],
    "look": "Warm, friendly, rounded — playful illustrations, soft browns and teals"
  }
}
```

The card is the contract for the build: `mustHaves` is what the AI team will build, and `notBuilding` is what it deliberately will not. Read both.

Two other outcomes are possible at this step:

- `"status": "flagged"` — the card is ready, but one detail is under human review before the build can start. You can keep refining the card meanwhile. See [Concept Gate API](./concept-gate-api.md#statuses).
- `403` with `"status": "blocked"` — the idea does not meet the content rules, and no card is drafted.

## 3. Iterate until the card is right (optional)

If the card isn't quite what you meant, send feedback. Anything you do not mention carries forward unchanged:

```bash
curl -X POST https://bodigi2.com/api/concept/concept-1791921091218-hhi84t/iterate \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-YOUR-PROJECT-REF-auth-token=VALUE" \
  -d '{ "feedback": "Skip the deposit — flat free booking instead. Keep the reminders." }'
```

The response returns the revised card with an incremented `card_version`. Iterate as many times as you like — iterations do not consume build quota.

## 4. Approve and start the build

When the card is right, approve it. This is the moment quota is checked and the build fires — from the approved card snapshot, not your raw idea:

```bash
curl -X POST https://bodigi2.com/api/concept/concept-1791921091218-hhi84t/approve \
  -H "Cookie: sb-YOUR-PROJECT-REF-auth-token=VALUE"
```

```json
{
  "projectId": "proj-1791922488102-k3j9ra",
  "message": "Approved! The AI team is starting your build..."
}
```

Save the `projectId` — it is your handle for everything that follows. Approving is idempotent: if the build is already running, you get the same `projectId` back with `"message": "Build already running"`.

If you are out of quota, the response is `403` — but note the `conceptApproved: true` field: your concept is locked in as approved, and you can come back to it after upgrading:

```json
{
  "error": "Your Free plan includes 1 build per month. You've used 1/1. ...",
  "quota": { "tier": "free", "used": 1, "limit": 1 },
  "upgradeUrl": "/pricing",
  "conceptApproved": true
}
```

## 5. Watch the build

Poll the project until it finishes:

```bash
curl https://bodigi2.com/api/generate/proj-1791922488102-k3j9ra \
  -H "Cookie: sb-YOUR-PROJECT-REF-auth-token=VALUE"
```

```json
{
  "state": {
    "id": "proj-1791922488102-k3j9ra",
    "name": "PawSlots",
    "status": "building",
    "currentPhase": 2,
    "tasks": [ "..." ],
    "specs": { "..." },
    "generatedFiles": [ "..." ]
  },
  "progress": 38,
  "agentActivity": { "..." },
  "files": [ "..." ],
  "ai": { "..." },
  "testResults": null,
  "complianceChecks": null,
  "deploymentUrl": null
}
```

The field to watch is `state.status`:

| Status | Meaning |
|--------|---------|
| `planning` | The agent team is decomposing the card into specs and tasks |
| `building` | Agents are generating the application code |
| `testing` | The test agent is verifying the build |
| `deploying` | Deployment configuration is being prepared |
| `done` | Build complete — check `deploymentUrl` for the live preview |
| `failed` | The build failed — the project keeps its logs; you can start a fresh build from the same concept |

A poll every few seconds is plenty. If a build stalls (no progress for more than 15 minutes), the platform automatically marks it `failed` — you will never poll a dead build forever.

When `state.status` reaches `done`, the response includes your live preview URL:

```json
{ "state": { "status": "done", "..." : "..." }, "deploymentUrl": "https://your-app.vercel.app" }
```

## Complete example script

A full end-to-end script — sign in, create a concept, approve it, poll to completion:

```js
// first-build.mjs — your first BoDiGi build, end to end.
// Requires: npm install @supabase/ssr
import { createServerClient } from '@supabase/ssr';

const API = 'https://bodigi2.com';
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

const jar = new Map();
const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookies: {
    getAll() { return [...jar].map(([name, value]) => ({ name, value })); },
    setAll(cookies) { cookies.forEach(({ name, value }) => jar.set(name, value)); },
  },
});

const { error } = await supabase.auth.signInWithPassword({
  email: process.env.BODIGI_EMAIL,
  password: process.env.BODIGI_PASSWORD,
});
if (error) throw new Error(error.message);

const cookies = [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
const api = (path, init = {}) =>
  fetch(`${API}${path}`, { ...init, headers: { cookie: cookies, ...init.headers } });

// 1. Create the concept
const concept = await (await api('/api/concept', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    idea: 'A booking app for my dog-grooming studio — clients pick a slot, pay a deposit, and get an automatic reminder the day before.',
  }),
})).json();

if (concept.status !== 'presented') {
  console.log('Concept not buildable yet:', concept.status);
  process.exit(1);
}
console.log(`Card drafted: ${concept.card.name} — "${concept.card.tagline}"`);

// 2. Approve it (this consumes one build from your quota)
const approval = await (await api(`/api/concept/${concept.conceptId}/approve`, {
  method: 'POST',
})).json();
console.log('Build started:', approval.projectId);

// 3. Poll until done
while (true) {
  await new Promise((r) => setTimeout(r, 5000));
  const project = await (await api(`/api/generate/${approval.projectId}`)).json();
  const status = project.state?.status;
  const pct = project.progress ?? 0;
  console.log(`${status} (${pct}%)`);

  if (status === 'done') {
    console.log('Live at:', project.deploymentUrl);
    break;
  }
  if (status === 'failed') {
    console.log('Build failed — see the project logs in your dashboard.');
    break;
  }
}
```

## Where to go next

- [Concept Gate API](./concept-gate-api.md) — every endpoint, parameter, and status in detail
- [Tiers & Limits](./tiers-and-limits.md) — what your plan allows
- [Integration Guide](./integration-guide.md) — idempotency, error handling, and client patterns
