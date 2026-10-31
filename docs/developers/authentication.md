# Authentication

Every BoDiGi 2.0 API request must carry an authenticated session for your [bodigi2.com](https://bodigi2.com) account. There is no separate developer token — the API is the same one the dashboard uses, and your session is the credential.

## The session model

- **Sign-in method:** email and password at [`/login`](https://bodigi2.com/login). (Google and GitHub single sign-on are on the roadmap but not yet enabled — the buttons currently show a friendly "coming soon" note.)
- **Session format:** a Supabase Auth session, stored in `sb-*` cookies. The API reads the session from request cookies on every call — there is no `Authorization` header path.
- **Unauthenticated requests** receive `401` with a JSON body:

```json
{ "error": "Authentication required. Please sign in to start a build." }
```

- **Expired sessions:** access tokens expire periodically. If your script starts receiving `401` responses, sign in again — the sign-in flow is cheap and idempotent.

## Calling the API programmatically

### Option A — reuse your browser session (fastest way to explore)

1. Sign in at [bodigi2.com](https://bodigi2.com).
2. Open your browser's developer tools and copy the `sb-*` cookies for the site.
3. Send them along with each request:

```bash
curl https://bodigi2.com/api/me \
  -H "Cookie: sb-YOUR-PROJECT-REF-auth-token=VALUE"
```

This is the quickest way to try the API with `curl` or a REST client. Treat the cookie value like a password — it *is* your session.

### Option B — sign in from a script

Use the same Supabase SSR library the app itself uses, with an in-memory cookie jar standing in for the browser. Sign in once, then forward the captured cookies with every API call:

```js
// bodigi-session.mjs — mint a BoDiGi session and call the API.
// Requires: npm install @supabase/ssr
import { createServerClient } from '@supabase/ssr';

// BoDiGi's public client values — the same ones bodigi2.com ships to every
// browser (visible in the page source). They are public by design; access
// control is enforced by Row Level Security plus your session.
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

// A tiny in-memory cookie jar — the role the browser plays on the site.
const jar = new Map();
const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookies: {
    getAll() {
      return [...jar].map(([name, value]) => ({ name, value }));
    },
    setAll(cookies) {
      cookies.forEach(({ name, value }) => jar.set(name, value));
    },
  },
});

const { error } = await supabase.auth.signInWithPassword({
  email: process.env.BODIGI_EMAIL,
  password: process.env.BODIGI_PASSWORD,
});
if (error) throw new Error(error.message);

// Forward the session cookies with every BoDiGi API request.
const cookieHeader = [...jar].map(([n, v]) => `${n}=${v}`).join('; ');

const res = await fetch('https://bodigi2.com/api/me', {
  headers: { cookie: cookieHeader },
});
console.log(await res.json());
// -> { "authenticated": true, "role": "user", "tier": "pro", "email": "..." }
```

Keep the session in a variable and reuse it; sign in again only when you start seeing `401`s.

## Verifying your session

`GET /api/me` is a lightweight session probe. It returns your role and plan tier — handy for branching logic in your client:

```bash
curl https://bodigi2.com/api/me \
  -H "Cookie: sb-YOUR-PROJECT-REF-auth-token=VALUE"
```

```json
{
  "authenticated": true,
  "role": "user",
  "tier": "pro",
  "email": "you@example.com"
}
```

## Roles

Most endpoints work for any authenticated account and operate on that account's own resources. A small set of review endpoints (the flagged-concept queue) requires an account with the `admin` role and returns `403` otherwise. Admin authority is checked server-side on every call.

## Security notes

- Sessions are the only credential — BoDiGi does not currently issue long-lived API keys. Never paste your cookie value into shared code, screenshots, or logs.
- All resource access is checked server-side against the session's user, and again at the database by Row Level Security. A valid session for one account can never read another account's concepts, projects, or renders.
