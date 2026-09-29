/**
 * API Route: GET /api/generate/[projectId]/download
 *
 * Packages all generated files for a project into a zip archive
 * and streams it back as a download.
 * Free tier gets the export with a BoDiGi watermark; paid tiers
 * (starter, pro, enterprise) and admins get clean files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveTier } from '@/lib/trial';
import JSZip from 'jszip';
import { getProject } from '@/lib/agents/pipeline';
import { loadProjectFromSupabase } from '@/lib/supabase/project-store';
import { createServerClient } from '@/lib/supabase/server-client';
import type { ProjectState, GeneratedFile } from '@/lib/agents/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // Check authentication
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check tier — free AND trial get watermarked exports, paid gets clean.
  // The trial is a taste of Pro, not a transfer of the asset: clean code
  // only leaves the platform when real money has arrived.
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, role, is_trial, tier_expires_at')
    .eq('id', user.id)
    .single();

  const tier = resolveTier(profile);
  const isAdmin = profile?.role === 'admin';
  const isPaid = isAdmin || (tier !== 'free' && !profile?.is_trial);

  // Try in-memory first
  const project = getProject(projectId);

  let projectName: string;
  let projectIdea: string;
  let files: GeneratedFile[];
  let specs: unknown;
  let architecture: unknown;

  if (project) {
    projectName = project.state.name;
    projectIdea = project.state.idea;
    files = project.files;
    specs = project.state.specs;
    architecture = project.state.architecture;
  } else {
    // Try Supabase
    const sbProject = await loadProjectFromSupabase(projectId);
    if (!sbProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    projectName = sbProject.state.name;
    projectIdea = sbProject.state.idea;
    files = sbProject.files || [];
    specs = sbProject.state.specs;
    architecture = sbProject.state.architecture;
  }

  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No files generated yet' }, { status: 400 });
  }

  const zip = new JSZip();

  // Property watermark on every markdown doc — free tier only
  const WATERMARK = `\n\n---\n\n**BoDiGi 2.0's Property** — Generated with the free plan of BoDiGi 2.0 (bodigi2.com). Upgrade to remove this watermark.\n`;

  for (const file of files) {
    const content = !isPaid && file.path.endsWith('.md')
      ? file.content + WATERMARK
      : file.content;
    zip.file(file.path, content);
  }

  // Include the brand kit when the Brand Agent has run: logo, palette, guide.
  const brand = (specs as Record<string, unknown> | null)?.brand as
    | { logo_url?: string; palette?: Record<string, string>; voice?: string; tagline?: string; generated_at?: string }
    | undefined;
  if (brand?.palette) {
    zip.file('brand/palette.json', JSON.stringify(brand.palette, null, 2));
    zip.file('brand/BRAND.md', [
      `# ${projectName} — Brand Kit`,
      ``,
      brand.tagline ? `**Tagline:** ${brand.tagline}` : null,
      brand.voice ? `**Voice:** ${brand.voice}` : null,
      ``,
      `## Palette`,
      ...Object.entries(brand.palette).map(([role, hex]) => `- **${role}:** \`${hex}\``),
      ``,
      `Logo: see brand/logo.png (generated ${brand.generated_at || 'recently'} by BoDiGi's Brand Agent).`,
      ``,
    ].filter((l) => l !== null).join('\n'));
    if (brand.logo_url) {
      try {
        const logoRes = await fetch(brand.logo_url);
        if (logoRes.ok) {
          zip.file('brand/logo.png', Buffer.from(await logoRes.arrayBuffer()));
        }
      } catch { /* a missing logo never blocks the export */ }
    }
  }

  // Include manifest
  zip.file('bodigi.manifest.json', JSON.stringify({
    id: projectId,
    name: projectName,
    idea: projectIdea,
    generatedAt: new Date().toISOString(),
    specs,
    architecture,
  }, null, 2));

  // Include setup instructions — built from the app's ACTUAL required APIs
  // (specs.requiredApis), not a hardcoded list, so the ZIP always matches
  // what the PM Agent declared for this specific build.
  interface RequiredApiEntry { provider: string; reason: string; envVars: string[]; signupUrl?: string; costNote?: string; required?: boolean; }
  const reqApis: RequiredApiEntry[] = (specs && Array.isArray((specs as { requiredApis?: unknown }).requiredApis))
    ? (specs as unknown as { requiredApis: RequiredApiEntry[] }).requiredApis
    : [];

  const envLines = reqApis.length > 0
    ? reqApis.flatMap((a) => (a.envVars || []).map((v) => `${v}=`))
    : ['NEXT_PUBLIC_SUPABASE_URL=', 'NEXT_PUBLIC_SUPABASE_ANON_KEY=', 'SUPABASE_SERVICE_ROLE_KEY=', 'OPENROUTER_API_KEY='];

  const keyGuide = reqApis.length > 0
    ? reqApis.map((a) => [
        `### ${a.provider}${a.required ? ' (required)' : ' (optional)'}`,
        a.reason,
        a.signupUrl ? `Get keys: ${a.signupUrl}` : null,
        a.costNote ? `Cost: ${a.costNote}` : null,
        `Env vars: ${(a.envVars || []).map((v) => '\`' + v + '\`').join(', ')}`,
      ].filter((l): l is string => Boolean(l)).join('\n'))
      .join('\n\n')
    : [
        '### OpenRouter (AI provider)',
        'Get a key at https://openrouter.ai/keys — one key unlocks many models.',
        '',
        '### Supabase (database)',
        'Project Settings → API → copy the Project URL, Publishable (anon) Key, and Secret (service_role) Key.',
      ].join('\n');

  zip.file('SETUP.md', `# ${projectName} — Setup Instructions

## Prerequisites
- Node.js 18+
- npm or yarn

## Environment Variables
Create a \`.env.local\` file in the project root with:

\`\`\`
${envLines.join('\n')}
\`\`\`

## Getting API Keys

${keyGuide}

## Run Locally
\`\`\`bash
npm install
npm run dev
\`\`\`

## Deploy to Vercel (recommended)
1. Push this folder to a GitHub repo (or use BoDiGi's Export to GitHub button).
2. In Vercel: **Add New → Project → Import** the repo.
3. Vercel auto-detects Next.js — keep the defaults:
   - Framework Preset: **Next.js**
   - Build Command: **next build**
   - Output Directory: **.next** (default)
   - Install Command: **npm install**
4. Add every environment variable from the list above (**Settings → Environment Variables**, Production + Preview).
5. Deploy. Redeploy after adding any missing env var.

---
Generated by BoDiGi 2.0
`);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'appforge-app';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': String(buffer.length),
    },
  });
}
