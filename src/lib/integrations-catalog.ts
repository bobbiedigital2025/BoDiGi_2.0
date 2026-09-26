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

/**
 * Provider comparisons — when a founder asks "which one should I use?"
 * or "what's the cheapest option?", agents consult this. Each category
 * lists the realistic options with pricing and a plain-English
 * "best for" verdict.
 */
export interface ProviderComparison {
  category: string;
  options: {
    name: string;
    pricing: string;
    bestFor: string;
    catch?: string;
  }[];
  /** One-line default recommendation for a typical BoDiGi user */
  defaultPick: string;
}

export const PROVIDER_COMPARISONS: ProviderComparison[] = [
  {
    category: 'AI / LLM access',
    options: [
      { name: 'OpenRouter', pricing: 'Pay-as-you-go, one key for 300+ models. Most models cost fractions of a cent per message.', bestFor: 'Almost everyone — one key, swap models freely, no commitment.', catch: 'Slightly marked-up prices vs going direct (usually <5%).' },
      { name: 'OpenAI direct', pricing: 'Pay-as-you-go. GPT-4o-mini is extremely cheap for chat.', bestFor: 'Teams standardizing on OpenAI models with higher volume.', catch: 'One vendor; separate key per other provider.' },
      { name: 'Anthropic direct', pricing: 'Pay-as-you-go. Claude models are strong at writing and code.', bestFor: 'Apps where output quality of long-form text matters most.', catch: 'Same single-vendor caveat.' },
      { name: 'Groq', pricing: 'Free tier, then pay-as-you-go. Insanely fast (hundreds of tokens/sec).', bestFor: 'Speed-critical features — autocomplete, real-time chat.', catch: 'Smaller model selection.' },
    ],
    defaultPick: 'OpenRouter — one key covers every model, easy to switch later, no vendor lock-in.',
  },
  {
    category: 'Payments',
    options: [
      { name: 'Stripe', pricing: 'No monthly fee. ~2.9% + 30¢ per charge. Test mode free forever.', bestFor: 'The safe default — huge docs, every platform integrates with it, scales from $0 to millions.', catch: 'You handle sales tax and some compliance yourself.' },
      { name: 'PayPal / Venmo', pricing: '~3.49% + 49¢ per transaction.', bestFor: 'Audiences that trust the PayPal button (older shoppers, marketplaces).', catch: 'Clunkier checkout, weaker developer tools.' },
      { name: 'Square', pricing: '2.9% + 30¢ online.', bestFor: 'Businesses that also sell in person (syncs with Square POS).', catch: 'Web checkout is less customizable.' },
      { name: 'Lemon Squeezy', pricing: '5% + 50¢ per charge.', bestFor: 'Selling software/digital products without forming a company — they act as the merchant of record and handle global sales tax.', catch: 'Higher cut; less control.' },
    ],
    defaultPick: 'Stripe if the user has or can get a business setup; Lemon Squeezy if they are a solo creator who does not want to deal with taxes.',
  },
  {
    category: 'Email',
    options: [
      { name: 'Resend', pricing: 'Free: 3,000 emails/mo. Then $20/mo for 50k.', bestFor: 'Modern apps — best developer experience, React email templates.', catch: 'Newer company, fewer enterprise features.' },
      { name: 'SendGrid', pricing: 'Free: 100 emails/day. Then $19.95/mo.', bestFor: 'High volume and mature deliverability tooling.', catch: 'Dated API, slow to innovate.' },
      { name: 'Postmark', pricing: '$15/mo for 10k emails. No free tier.', bestFor: 'Transactional email that absolutely must arrive (receipts, password resets).', catch: 'Costs money from day one.' },
      { name: 'Mailchimp', pricing: 'Free: 1,000 contacts (marketing emails only).', bestFor: 'Newsletters and marketing campaigns — not app transactional email.', catch: 'Wrong tool for receipts/password resets.' },
    ],
    defaultPick: 'Resend — generous free tier, cleanest API, made for app developers.',
  },
  {
    category: 'Maps / location',
    options: [
      { name: 'Google Maps', pricing: '$200/mo free credit — most small apps never pay.', bestFor: 'Best-in-class search, places data, directions.', catch: 'Requires a credit card; billing shocks happen if an app goes viral.' },
      { name: 'Mapbox', pricing: 'Free tier ~50k map loads/mo.', bestFor: 'Beautiful custom-styled maps, cheaper at scale.', catch: 'Weaker place search.' },
      { name: 'OpenStreetMap (Leaflet)', pricing: 'Free.', bestFor: 'Simple "show a pin on a map" features with zero budget.', catch: 'No turn-by-turn or place search.' },
    ],
    defaultPick: 'Google Maps for search/directions features; plain OpenStreetMap if the app just shows locations.',
  },
  {
    category: 'Image / media hosting',
    options: [
      { name: 'Supabase Storage', pricing: 'Included in Supabase free tier (1GB).', bestFor: 'Simple uploads (avatars, a few images) — no new account needed since the app already uses Supabase.', catch: 'No automatic resizing/optimization.' },
      { name: 'Cloudinary', pricing: 'Free: 25 credits/mo (~25GB bandwidth).', bestFor: 'Image-heavy apps — automatic resizing, compression, format conversion.', catch: 'Another account to manage.' },
      { name: 'UploadThing', pricing: 'Free tier, then cheap.', bestFor: 'Quick file-upload widgets in Next.js apps.', catch: 'Smaller ecosystem.' },
    ],
    defaultPick: 'Supabase Storage for light needs (one less account); Cloudinary when the app is media-heavy.',
  },
  {
    category: 'SMS / phone',
    options: [
      { name: 'Twilio', pricing: 'Pay-as-you-go, SMS ~1¢ each in the US.', bestFor: 'The industry standard — SMS, calls, WhatsApp, verification.', catch: 'Pricing adds up at volume.' },
      { name: 'Vonage', pricing: 'Similar to Twilio.', bestFor: 'Slightly cheaper in some regions.', catch: 'Smaller ecosystem.' },
      { name: 'Resend/Email instead', pricing: 'Free.', bestFor: 'Most apps — email notifications cover 90% of needs at zero cost.', catch: 'Not real-time like SMS.' },
    ],
    defaultPick: 'Ask first: does this really need texts, or would email notifications do the job? Email is free; SMS rarely is.',
  },
  {
    category: 'Database + auth',
    options: [
      { name: 'Supabase', pricing: 'Free: 500MB DB, 50k users. Pro $25/mo.', bestFor: 'The BoDiGi default — Postgres, auth, storage, realtime in one.', catch: 'None for this stack.' },
      { name: 'Neon', pricing: 'Free tier Postgres.', bestFor: 'Serverless Postgres only (no built-in auth).', catch: 'You would bolt on Clerk for auth.' },
    ],
    defaultPick: 'Supabase — the whole pipeline is built around it.',
  },
];

/** Format comparisons into a prompt block. */
export function formatComparisonsForPrompt(comparisons: ProviderComparison[]): string {
  return comparisons
    .map(
      (c) => `${c.category.toUpperCase()} — default pick: ${c.defaultPick}
${c.options.map((o) => `- ${o.name}: ${o.pricing} Best for: ${o.bestFor}${o.catch ? ` Watch out: ${o.catch}` : ''}`).join('\n')}`
    )
    .join('\n\n');
}
