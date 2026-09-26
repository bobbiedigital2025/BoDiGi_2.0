/**
 * Integrations catalog — knowledge base of third-party services a generated
 * app might need, with step-by-step key acquisition guides. Used by the
 * Setup Agent (so it can walk users through setup) and by the project
 * page (to list what an app requires).
 */

export interface IntegrationGuide {
  provider: string;
  envVars: string[];
  signupUrl: string;
  costNote: string;
  /** Plain-English numbered steps to get the key(s) */
  steps: string[];
  /** Keywords in an app idea/spec that imply this integration */
  triggers: string[];
}

export const INTEGRATIONS_CATALOG: IntegrationGuide[] = [
  {
    provider: 'Supabase',
    envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    signupUrl: 'https://supabase.com',
    costNote: 'Free tier is generous — 500MB database, 50k monthly users. No card required.',
    steps: [
      'Go to supabase.com and sign up (GitHub login is fastest)',
      'Click "New project", pick a name and a database password (save the password somewhere safe)',
      'Wait ~2 minutes for the project to provision',
      'Go to Project Settings (gear icon) → API',
      'Copy the "Project URL" — that is NEXT_PUBLIC_SUPABASE_URL',
      'Copy the "anon public" key — that is NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'Copy the "service_role" key — that is SUPABASE_SERVICE_ROLE_KEY (keep this one secret, it bypasses security rules)',
    ],
    triggers: ['database', 'auth', 'login', 'signup', 'user accounts', 'storage', 'file upload', 'realtime'],
  },
  {
    provider: 'OpenRouter',
    envVars: ['OPENROUTER_API_KEY'],
    signupUrl: 'https://openrouter.ai',
    costNote: 'Pay-as-you-go, most models cost fractions of a cent per message. $5 credit goes a long way.',
    steps: [
      'Go to openrouter.ai and sign in (Google works)',
      'Click your profile icon → "Keys"',
      'Click "Create Key", give it a name like your app name',
      'Copy the key (starts with sk-or-v1-) — that is OPENROUTER_API_KEY',
      'Add a few dollars of credit under "Credits" if the app will see real use',
    ],
    triggers: ['ai', 'chatbot', 'chat', 'agent', 'agents', 'assistant', 'gpt', 'llm', 'summarize', 'generate text', 'multi-agent', 'mcp', 'autonomous'],
  },
  {
    provider: 'Stripe',
    envVars: ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    signupUrl: 'https://stripe.com',
    costNote: 'No monthly fee — Stripe takes ~2.9% + 30¢ per successful charge. Test mode is free forever.',
    steps: [
      'Go to stripe.com and sign up',
      'You can skip full business verification for now and stay in "test mode" (toggle in the top right)',
      'Go to Developers → API keys',
      'Copy the "Secret key" (starts with sk_test_) — that is STRIPE_SECRET_KEY',
      'Copy the "Publishable key" (starts with pk_test_) — that is NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'For webhooks later: Developers → Webhooks → Add endpoint, then copy its "Signing secret" — that is STRIPE_WEBHOOK_SECRET',
      'When you are ready to accept real money, complete business verification and switch to live keys',
    ],
    triggers: ['payment', 'payments', 'stripe', 'subscription', 'billing', 'checkout', 'invoice', 'sell', 'pricing', 'paid'],
  },
  {
    provider: 'Resend',
    envVars: ['RESEND_API_KEY'],
    signupUrl: 'https://resend.com',
    costNote: 'Free tier: 3,000 emails/month. Plenty for a new app.',
    steps: [
      'Go to resend.com and sign up',
      'Go to API Keys → "Create API Key" (full access is fine)',
      'Copy the key (starts with re_) — that is RESEND_API_KEY',
      'To send from your own domain (like support@yourapp.com): Domains → Add Domain, add the DNS records it shows at your registrar, and click Verify',
      'Without a verified domain you can only send to your own signup email in testing',
    ],
    triggers: ['email', 'emails', 'notification', 'newsletter', 'welcome email', 'receipts', 'invite'],
  },
  {
    provider: 'Vercel',
    envVars: ['VERCEL_TOKEN'],
    signupUrl: 'https://vercel.com',
    costNote: 'Hobby tier is free and covers personal projects. Pro ($20/mo) for team features.',
    steps: [
      'Go to vercel.com and sign up (GitHub login recommended — it makes deploys automatic)',
      'Click your avatar → Settings → Tokens',
      'Click "Create Token", scope it to your account, no expiration is simplest',
      'Copy the token — that is VERCEL_TOKEN',
    ],
    triggers: ['deploy', 'hosting', 'vercel', 'domain'],
  },
  {
    provider: 'Google Maps / Places',
    envVars: ['NEXT_PUBLIC_GOOGLE_MAPS_KEY'],
    signupUrl: 'https://console.cloud.google.com',
    costNote: 'Google gives $200/month of free Maps credit — most small apps never exceed it.',
    steps: [
      'Go to console.cloud.google.com and sign in with a Google account',
      'Create a new project (top-left dropdown → New Project)',
      'Go to "APIs & Services" → Library, search "Maps JavaScript API" and Enable it (also "Places API" if the app searches places)',
      'Go to APIs & Services → Credentials → Create Credentials → API Key',
      'Copy the key — that is NEXT_PUBLIC_GOOGLE_MAPS_KEY',
      'Click the key to restrict it: HTTP referrer restrictions to your domain, so nobody can steal your quota',
    ],
    triggers: ['map', 'maps', 'location', 'geolocation', 'nearby', 'directions', 'places', 'address'],
  },
  {
    provider: 'Twilio',
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    signupUrl: 'https://www.twilio.com',
    costNote: 'Pay-as-you-go — SMS around 1¢ each in the US. Trial credit included.',
    steps: [
      'Go to twilio.com and sign up (verify your phone number)',
      'From the Console dashboard, copy "Account SID" — that is TWILIO_ACCOUNT_SID',
      'Copy "Auth Token" — that is TWILIO_AUTH_TOKEN',
      'Phone Numbers → Buy a number, then copy it — that is TWILIO_PHONE_NUMBER',
    ],
    triggers: ['sms', 'text message', 'phone', 'call', 'whatsapp', 'verification code'],
  },
  {
    provider: 'OpenWeather',
    envVars: ['OPENWEATHER_API_KEY'],
    signupUrl: 'https://openweathermap.org',
    costNote: 'Free tier: 1,000 calls/day. Weather apps rarely need more.',
    steps: [
      'Go to openweathermap.org and sign up',
      'Go to your profile → "My API keys"',
      'Copy the default key (or generate one named after your app) — that is OPENWEATHER_API_KEY',
      'Note: new keys can take up to 2 hours to activate',
    ],
    triggers: ['weather', 'forecast', 'temperature', 'climate'],
  },
  {
    provider: 'GitHub',
    envVars: ['GITHUB_TOKEN'],
    signupUrl: 'https://github.com',
    costNote: 'Free.',
    steps: [
      'Go to github.com and sign in',
      'Click your avatar → Settings → Developer settings (bottom of the left sidebar)',
      'Personal access tokens → Fine-grained tokens → Generate new token',
      'Give it repo access for the repos you need, expiry of your choice',
      'Copy the token — that is GITHUB_TOKEN',
    ],
    triggers: ['github', 'repository', 'repo', 'git', 'version control', 'code export'],
  },
  {
    provider: 'Cloudinary',
    envVars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
    signupUrl: 'https://cloudinary.com',
    costNote: 'Free tier: 25 credits/month — enough for image-heavy MVPs.',
    steps: [
      'Go to cloudinary.com and sign up',
      'The dashboard shows your Cloud Name, API Key, and API Secret right away',
      'Copy all three into CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
    ],
    triggers: ['image', 'images', 'photo', 'photos', 'video', 'media', 'upload', 'resize', 'thumbnail'],
  },
];

/** Feature/idea text → matched integration guides (Supabase always included). */
export function detectRequiredApis(text: string): IntegrationGuide[] {
  const lower = text.toLowerCase();
  const matched = INTEGRATIONS_CATALOG.filter(
    (g) => g.provider === 'Supabase' || g.triggers.some((t) => lower.includes(t))
  );
  return matched;
}

/** Format guides into a prompt block for the Setup Agent. */
export function formatGuidesForPrompt(guides: IntegrationGuide[]): string {
  return guides
    .map(
      (g) => `${g.provider} (${g.signupUrl})
  Env vars: ${g.envVars.join(', ')}
  Cost: ${g.costNote}
  Steps:
${g.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`
    )
    .join('\n\n');
}
