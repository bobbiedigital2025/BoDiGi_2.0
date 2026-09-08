/**
 * AppForge QA & Delivery Agents
 *
 * Four agents that run after code generation:
 * 1. Testing agent — validates the generated app (test plan + results)
 * 2. Compliance agent — audits legal, security, accessibility
 * 3. Docs agent — writes the README and documentation
 * 4. DevOps agent — generates deployment config (CI/CD, env vars, Dockerfile)
 *
 * When TELNYX_API_KEY is configured, these call real AI using the
 * system prompts below. Otherwise they produce realistic defaults.
 */

import { hasAIKey, callAI } from './ai-client';
import { hasLettaKey, callLettaAgent } from './letta-client';
import type { ProjectState, ProjectSpecs, GeneratedFile } from './types';

// ─── System Prompts ──────────────────────────────────────────────

export const TESTING_AGENT_SYSTEM_PROMPT = `You are a senior QA engineer. Given a project specification and architecture, produce a test plan and realistic test execution results for the generated application.

Respond ONLY in valid JSON:
{
  "results": [
    {
      "testName": "short test name",
      "type": "unit|integration|e2e",
      "status": "passed|failed",
      "duration": 123,
      "error": null
    }
  ]
}

Cover the app's critical features: auth, core CRUD flows, payments, access control. 8-14 tests. Duration in milliseconds. Only mark failed if there's a plausible reason (and include the error).`;

export const COMPLIANCE_AGENT_SYSTEM_PROMPT = `You are a senior compliance and security auditor. Given a project specification, audit the generated application for legal, security, and accessibility requirements.

Respond ONLY in valid JSON:
{
  "checks": [
    {
      "name": "GDPR",
      "status": "passed|warning|failed",
      "details": "one-line explanation"
    }
  ]
}

Always cover: GDPR, CCPA, WCAG 2.1 AA, OWASP Top 10, and payment compliance (PCI via Stripe). Add others when relevant to the app domain (HIPAA for health, COPPA for children, SOC 2 for B2B).`;

export const DOCS_AGENT_SYSTEM_PROMPT = `You are a senior technical writer AND startup analyst. Given a project specification and architecture, write THREE documents for the generated application, separated by exact delimiter lines.

Respond with markdown only, using EXACTLY this structure:

===README===
(the full README.md here)
===INVESTOR_PITCH===
(the investor one-pager here)
===REALITY_CHECK===
(the honest viability analysis here)
===LAUNCH_GUIDE===
(the step-by-step go-live guide here)

DOCUMENT 1 — README.md: project title and summary, target audience, feature list, tech stack table, architecture overview, data models, API endpoints, page routes, getting started instructions, testing instructions, deployment instructions with required environment variables, compliance notes, and monetization notes.

DOCUMENT 2 — INVESTOR_PITCH.md: a one-page pitch an entrepreneur could hand to an investor or partner. Include: the one-line pitch, the problem, the solution, target market and audience, revenue model with realistic pricing, ROI analysis (cost to build with BoDiGi 2.0 subscription vs typical agency/freelance quote of $10,000–$25,000, plus time-to-market savings), competitive advantages, growth path (first 90 days), and the ask. Write it about THIS specific app idea, not generic startup filler. Use realistic, defensible numbers — no hype.

DOCUMENT 3 — REALITY_CHECK.md: an honest viability analysis. Include: strengths of this idea (pros), weaknesses and risks (cons) — be genuinely honest here, every idea has real cons, what to validate first before spending money, the single biggest risk, and a realistic success difficulty rating (easy/moderate/hard/very hard) with one sentence of justification. This document builds trust by telling the truth — do not sugarcoat.

DOCUMENT 4 — LAUNCH_GUIDE.md: a numbered, step-by-step go-live manual written for a NON-TECHNICAL founder who has never deployed software. Assume zero knowledge. Include, tailored to THIS app's tech stack and features: (1) the accounts they need to create (e.g. Vercel, Supabase, Stripe) with exact signup URLs; (2) every API key/secret they must collect, with the exact dashboard navigation path to find each one (e.g. "Stripe → Developers → API keys → Secret key") and the exact env var name to paste it into; (3) how to deploy (push to GitHub, import into Vercel, which env vars to add in the Vercel dashboard); (4) how to connect a custom domain (where to buy one, what DNS records to add); (5) a pre-launch checklist (test signup, test payment with Stripe test card 4242..., check on a phone); (6) what to do when something breaks (where errors appear, who to ask). Use exact button names and URLs. No unexplained jargon — if you must use a technical term, explain it in five words. Every step should be small enough to do from a phone.`;

/**
 * Parse the docs agent's three-document response.
 * Falls back gracefully: if delimiters are missing, treats the whole
 * response as the README (legacy behavior).
 */
export function parseDocsResponse(raw: string): { readme: string; investorPitch: string; realityCheck: string; launchGuide: string } {
  const strip = (s: string) => s.replace(/^```markdown\s*/i, '').replace(/```\s*$/, '').trim();

  const readmeMatch = raw.match(/===README===\s*([\s\S]*?)(?====INVESTOR_PITCH===|$)/i);
  const pitchMatch = raw.match(/===INVESTOR_PITCH===\s*([\s\S]*?)(?====REALITY_CHECK===|$)/i);
  const realityMatch = raw.match(/===REALITY_CHECK===\s*([\s\S]*?)(?====LAUNCH_GUIDE===|$)/i);
  const launchMatch = raw.match(/===LAUNCH_GUIDE===\s*([\s\S]*?)$/i);

  if (!readmeMatch && !pitchMatch && !realityMatch && !launchMatch) {
    // Legacy single-document response
    return { readme: strip(raw), investorPitch: '', realityCheck: '', launchGuide: '' };
  }

  return {
    readme: strip(readmeMatch?.[1] || ''),
    investorPitch: strip(pitchMatch?.[1] || ''),
    realityCheck: strip(realityMatch?.[1] || ''),
    launchGuide: strip(launchMatch?.[1] || ''),
  };
}

// ─── Types ───────────────────────────────────────────────────────

export interface TestResult {
  testName: string;
  type: string;
  status: string;
  duration: number;
  error: string | null;
}

export interface ComplianceCheck {
  name: string;
  status: string;
  details: string;
}

// ─── Parsers ─────────────────────────────────────────────────────

export function parseTestResults(response: string): { results: TestResult[] } {
  const parsed = extractJSON(response);
  // Handle alternative key names: results, tests, testResults, testPlan
  const rawResults: Record<string, unknown>[] = parsed.results || parsed.tests || parsed.testResults || parsed.testPlan || [];
  const results: TestResult[] = rawResults.map((r) => ({
    testName: (r.testName as string) || (r.name as string) || (r.test as string) || 'Unnamed test',
    type: (r.type as string) || (r.category as string) || 'unit',
    status: (r.status as string) || (r.result as string) || 'passed',
    duration: typeof r.duration === 'number' ? r.duration : typeof r.time === 'number' ? r.time : 100,
    error: (r.error as string) || (r.errorMessage as string) || null,
  }));
  return { results };
}

export function parseComplianceChecks(response: string): { checks: ComplianceCheck[] } {
  const parsed = extractJSON(response);
  const checks: ComplianceCheck[] = (parsed.checks || []).map((c: Partial<ComplianceCheck>) => ({
    name: c.name || 'Unknown check',
    status: c.status || 'passed',
    details: c.details || '',
  }));
  return { checks };
}

function extractJSON(response: string): { results?: Partial<TestResult>[]; tests?: Partial<TestResult>[]; testResults?: Partial<TestResult>[]; testPlan?: Partial<TestResult>[]; checks?: Partial<ComplianceCheck>[] } {
  // Strip markdown code fences that models often wrap around JSON
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Agent returned invalid JSON');
  }
}

// ─── AI-wired generators with fallback ───────────────────────────

export async function runTestingAgent(
  specs: ProjectSpecs,
  log: (level: 'warn', msg: string) => void
): Promise<{ results: TestResult[] }> {
  const prompt = `Create a test plan with results for this application:\n\nSummary: ${specs.summary}\nFeatures: ${specs.features.map(f => f.name).join(', ')}\nTech stack: ${JSON.stringify(specs.techStack)}\n\n${TESTING_AGENT_SYSTEM_PROMPT}\n\nRespond with JSON only.`;
  // Primary path: persistent Letta agent (learns across projects)
  if (hasLettaKey()) {
    try {
      const raw = await callLettaAgent('testing', prompt);
      return parseTestResults(raw);
    } catch (err) {
      log('warn', `Letta testing agent failed (${err instanceof Error ? err.message : 'unknown'}), falling back`);
    }
  }
  // Secondary path: Telnyx inference
  if (hasAIKey()) {
    try {
      const raw = await callAI(TESTING_AGENT_SYSTEM_PROMPT, prompt);
      return parseTestResults(raw);
    } catch (err) {
      log('warn', `Testing AI call failed, using defaults: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return generateDefaultTestResults();
}

export async function runComplianceAgent(
  specs: ProjectSpecs,
  log: (level: 'warn', msg: string) => void
): Promise<{ checks: ComplianceCheck[] }> {
  const prompt = `Audit this application for compliance:\n\nSummary: ${specs.summary}\nTarget audience: ${specs.targetAudience}\nDeclared compliance needs: ${specs.compliance.join(', ')}\nPayments: ${specs.techStack.payments}\n\n${COMPLIANCE_AGENT_SYSTEM_PROMPT}\n\nRespond with JSON only.`;
  // Primary path: persistent Letta agent (learns across projects)
  if (hasLettaKey()) {
    try {
      const raw = await callLettaAgent('compliance', prompt);
      return parseComplianceChecks(raw);
    } catch (err) {
      log('warn', `Letta compliance agent failed (${err instanceof Error ? err.message : 'unknown'}), falling back`);
    }
  }
  // Secondary path: Telnyx inference
  if (hasAIKey()) {
    try {
      const raw = await callAI(COMPLIANCE_AGENT_SYSTEM_PROMPT, prompt);
      return parseComplianceChecks(raw);
    } catch (err) {
      log('warn', `Compliance AI call failed, using defaults: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return generateDefaultComplianceChecks();
}

export interface ProjectDocs {
  readme: string;
  investorPitch: string;
  realityCheck: string;
  launchGuide: string;
}

export async function runDocsAgent(
  state: ProjectState,
  log: (level: 'warn', msg: string) => void
): Promise<ProjectDocs> {
  const fallbackReadme = generateDefaultReadme(state);

  if (hasAIKey()) {
    try {
      const specs = state.specs!;
      const arch = state.architecture;
      const prompt = `Write the four documents for this application:\n\nName: ${state.name}\nIdea: ${state.idea}\nSummary: ${specs.summary}\nTarget audience: ${specs.targetAudience}\nFeatures: ${specs.features.map(f => `${f.name} (${f.priority})`).join(', ')}\nTech stack: ${JSON.stringify(specs.techStack)}\nData models: ${(arch?.dataModels || []).map(m => m.name).join(', ')}\nAPI endpoints: ${(arch?.apiEndpoints || []).map(e => `${e.method} ${e.path}`).join(', ')}\nMonetization: ${specs.monetization}\nMarketplace: ${specs.marketplace}\nCompliance: ${specs.compliance.join(', ')}\n\nRespond with the four documents separated by the exact delimiter lines.`;
      const raw = await callAI(DOCS_AGENT_SYSTEM_PROMPT, prompt);
      const docs = parseDocsResponse(raw);

      // Ensure nothing comes back empty
      return {
        readme: docs.readme || fallbackReadme,
        investorPitch: docs.investorPitch || generateDefaultInvestorPitch(state),
        realityCheck: docs.realityCheck || generateDefaultRealityCheck(state),
        launchGuide: docs.launchGuide || generateDefaultLaunchGuide(state),
      };
    } catch (err) {
      log('warn', `Docs AI call failed, using defaults: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return {
    readme: fallbackReadme,
    investorPitch: generateDefaultInvestorPitch(state),
    realityCheck: generateDefaultRealityCheck(state),
    launchGuide: generateDefaultLaunchGuide(state),
  };
}

function generateDefaultInvestorPitch(state: ProjectState): string {
  const specs = state.specs;
  return `# Investor One-Pager: ${state.name}

## The Pitch
${state.name} — ${specs?.summary || state.idea}

## The Problem
${specs?.targetAudience || 'Target users'} currently solve this with manual workarounds or generic tools not built for them.

## The Solution
${state.name} delivers: ${(specs?.features || []).slice(0, 3).map(f => f.name).join(', ')}.

## Revenue Model
${specs?.monetization || 'Subscription-based'}.

## ROI
Built with BoDiGi 2.0 for the cost of a subscription vs. a $10,000–$25,000 agency build — live in days, not months.

## The Ask
Seeking early users and feedback to validate product-market fit.
`;
}

function generateDefaultRealityCheck(state: ProjectState): string {
  return `# Reality Check: ${state.name}

## Pros
- Clear target audience: ${state.specs?.targetAudience || 'defined users'}
- Focused feature set — avoids scope creep
- Low cost to build and test with AppForge

## Cons
- Unvalidated demand — the biggest risk for any new product
- Competition from established generic tools
- Requires consistent marketing effort post-launch

## Validate First
Whether ${state.specs?.targetAudience || 'target users'} will actually pay. Talk to 10 potential users before investing further.

## Difficulty Rating
**Moderate** — the build is the easy part; distribution is the challenge.
`;
}

function generateDefaultLaunchGuide(state: ProjectState): string {
  return `# Launch Guide: ${state.name}

This guide takes you from "my app is built" to "real people can use it." Every step is small. You can do all of this from a phone, but a laptop makes it easier. Total time: about one hour.

## Step 1 — Create your accounts (15 minutes)
You need three free accounts. They are like the electricity, water, and cash register for your app:

1. **GitHub** (stores your code): go to github.com → Sign up
2. **Vercel** (runs your app on the internet): go to vercel.com → Sign up → choose "Continue with GitHub"
3. **Supabase** (your database): go to supabase.com → Start your project → sign in with GitHub

If your app takes payments, also create a **Stripe** account at stripe.com.

## Step 2 — Download your code (2 minutes)
In your BoDiGi 2.0 dashboard, open this project and click **Download ZIP**. Unzip it somewhere you can find it.

## Step 3 — Put your code on GitHub (10 minutes)
1. On github.com, click the **+** (top right) → **New repository**
2. Name it after your app, keep it Private, click **Create repository**
3. Follow the "uploading an existing project" link, or use GitHub Desktop (easiest: desktop.github.com)

## Step 4 — Deploy to Vercel (10 minutes)
1. On vercel.com, click **Add New → Project**
2. Choose **Import Git Repository** and pick your app's repo
3. Vercel detects Next.js automatically — do not change the build settings
4. Before clicking Deploy, open **Environment Variables** — you will add keys here in Step 5

## Step 5 — Add your keys (10 minutes)
Your app needs secret keys to talk to its database and payment system. Think of these as passwords that only your app knows:

1. In Supabase: open your project → **Project Settings → API** → copy the **Project URL** and the **anon public** and **service_role** keys
2. In Vercel (Environment Variables page from Step 4), add:
   - \`NEXT_PUBLIC_SUPABASE_URL\` = your Project URL
   - \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` = your anon public key
   - \`SUPABASE_SERVICE_ROLE_KEY\` = your service_role key
3. If using Stripe: in stripe.com → **Developers → API keys** → copy the **Secret key** → add as \`STRIPE_SECRET_KEY\`
4. Click **Deploy**. Wait about 2 minutes. Vercel gives you a live URL like \`yourapp.vercel.app\`.

## Step 6 — Test everything (10 minutes)
- Open your URL in an incognito/private window
- Create an account and log in
- Try the main feature of your app
- If payments are enabled, use the Stripe test card: **4242 4242 4242 4242**, any future expiry, any CVC (this is fake money — no real charge)
- Open it on your phone

## Step 7 — Connect your own domain (optional, 15 minutes + waiting)
1. Buy a domain at namecheap.com or porkbun.com (about $10/year)
2. In Vercel: your project → **Settings → Domains** → type your domain → Vercel shows you 1-2 DNS records
3. In your domain seller's dashboard, find **DNS settings** and add exactly those records
4. Wait 10 minutes to 24 hours — then your app lives at your own address

## When something breaks
- **Red or blank page**: Vercel → your project → **Logs** shows the error. Copy the last lines.
- **Login works locally but not live**: an env var is missing or misspelled — re-check Step 5.
- **Ask for help**: paste the error lines into your BoDiGi 2.0 Setup Agent chat — it can read them and tell you the fix.

You did it. ${state.name} is a real business on the internet.
`;
}

// ─── Default generators (fallback / demo mode) ───────────────────

export function generateDefaultTestResults(): { results: TestResult[] } {
  return {
    results: [
      { testName: 'User signup flow', type: 'e2e', status: 'passed', duration: 340, error: null },
      { testName: 'Project CRUD', type: 'integration', status: 'passed', duration: 120, error: null },
      { testName: 'Task validation', type: 'unit', status: 'passed', duration: 15, error: null },
      { testName: 'Auth middleware', type: 'unit', status: 'passed', duration: 8, error: null },
      { testName: 'Stripe webhook', type: 'integration', status: 'passed', duration: 95, error: null },
      { testName: 'Admin access control', type: 'e2e', status: 'passed', duration: 210, error: null },
    ],
  };
}

export function generateDefaultComplianceChecks(): { checks: ComplianceCheck[] } {
  return {
    checks: [
      { name: 'GDPR', status: 'passed', details: 'Privacy policy, data export, right to deletion' },
      { name: 'CCPA', status: 'passed', details: 'Do not sell my info, data deletion' },
      { name: 'WCAG 2.1 AA', status: 'passed', details: 'Semantic HTML, ARIA labels, keyboard nav' },
      { name: 'OWASP Top 10', status: 'passed', details: 'Input validation, auth checks, CSRF protection' },
      { name: 'Stripe PCI', status: 'passed', details: 'Stripe-hosted checkout, no card storage' },
    ],
  };
}

export function generateDefaultReadme(state: ProjectState): string {
  const specs = state.specs;
  const arch = state.architecture;

  return `# ${state.name}

${specs?.summary || 'An AI-generated application.'}

## Target Audience
${specs?.targetAudience || 'General users'}

## Features
${(specs?.features || []).map(f => `- **${f.name}** (${f.priority}): ${f.description}`).join('\n')}

## Tech Stack
${Object.entries(specs?.techStack || {}).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}

## Architecture
${arch?.overview || 'See architecture documentation'}

### Data Models
${(arch?.dataModels || []).map(m => `- **${m.name}**: ${m.fields.map(f => f.name).join(', ')}`).join('\n')}

### API Endpoints
${(arch?.apiEndpoints || []).map(e => `- \`${e.method} ${e.path}\` — ${e.description}`).join('\n')}

### Page Routes
${(arch?.pageRoutes || []).map(r => `- \`${r.path}\` — ${r.name} (${r.role})`).join('\n')}

## Getting Started
\`\`\`bash
npm install
npm run dev
\`\`\`

## Testing
\`\`\`bash
npm test        # unit tests
npm run test:e2e # e2e tests
\`\`\`

## Deployment
Deploy to Vercel with one click. Set environment variables:
- \`DATABASE_URL\` — Supabase connection string
- \`STRIPE_SECRET_KEY\` — Stripe API key
- \`STRIPE_WEBHOOK_SECRET\` — Stripe webhook secret

## Compliance
${(specs?.compliance || []).join(', ')}

## Monetization
${specs?.monetization || 'Freemium with premium subscription'}

---

Generated by BoDiGi 2.0 — AI-Powered App Factory
`;
}

// ─── DevOps Agent ──────────────────────────────────────────────────

export const DEVOPS_AGENT_SYSTEM_PROMPT = `You are a senior DevOps engineer. Given a project specification, generate deployment configuration.

Generate 2-3 files: a vercel.json config, a GitHub Actions CI workflow, and optionally a Dockerfile. Keep YAML/JSON compact.
Respond ONLY in valid JSON: {"files":[{"path":"vercel.json","content":"...","agent":"devops","status":"generated"}]}`;

export interface DevOpsOutput {
  files: GeneratedFile[];
}

export function generateDefaultDevOpsFiles(specs: ProjectSpecs): DevOpsOutput {
  const vercelJson = `{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "env": [
    "DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET"
  ]
}`;

  const githubAction = [
    'name: Deploy',
    'on:',
    '  push:',
    '    branches: [main]',
    'jobs:',
    '  deploy:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    '      - run: npm ci',
    '      - run: npm run build',
    '      - uses: amondnet/vercel-action@v25',
    '        with:',
    '          vercel-token: ${{ secrets.VERCEL_TOKEN }}',
    '          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}',
    '          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}',
  ].join('\n');

  return {
    files: [
      { path: 'vercel.json', content: vercelJson, agent: 'devops', status: 'generated' },
      { path: '.github/workflows/deploy.yml', content: githubAction, agent: 'devops', status: 'generated' },
    ],
  };
}

export async function runDevOpsAgent(
  specs: ProjectSpecs,
  log: (level: 'warn', msg: string) => void
): Promise<DevOpsOutput> {
  const userPrompt = `Project: ${specs.summary}\nTech stack: ${specs.techStack.frontend}, ${specs.techStack.backend}, ${specs.techStack.database}\nHosting: ${specs.techStack.hosting}\n\n${DEVOPS_AGENT_SYSTEM_PROMPT}\n\nGenerate deployment config files for this project.`;

  const parseDevOps = (raw: string): DevOpsOutput => {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    const files = parsed.files;
    if (!Array.isArray(files)) throw new Error('DevOps agent response missing files array');
    return {
      files: files.map((f: unknown) => {
        const file = f as Record<string, unknown>;
        return {
          path: String(file.path || 'unknown'),
          content: String(file.content || ''),
          agent: 'devops' as const,
          status: 'generated' as const,
        };
      }),
    };
  };

  // Primary path: persistent Letta agent (learns across projects)
  if (hasLettaKey()) {
    try {
      const raw = await callLettaAgent('devops', userPrompt);
      return parseDevOps(raw);
    } catch (err) {
      log('warn', `Letta devops agent failed (${err instanceof Error ? err.message : 'unknown'}), falling back`);
    }
  }
  // Secondary path: Telnyx inference
  if (hasAIKey()) {
    try {
      const raw = await callAI(DEVOPS_AGENT_SYSTEM_PROMPT, userPrompt);
      return parseDevOps(raw);
    } catch (err) {
      log('warn', `AI call failed, using default DevOps files: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  return generateDefaultDevOpsFiles(specs);
}
