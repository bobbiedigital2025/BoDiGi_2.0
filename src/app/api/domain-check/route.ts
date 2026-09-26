/**
 * API Route: GET /api/domain-check?domain=example.com
 * Custom Domain Assistant — checks whether a domain looks registered
 * (RDAP, the modern WHOIS) and returns the exact DNS records needed to
 * point it at a Vercel deployment. No API key required (RDAP is free).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const domain = (new URL(request.url).searchParams.get('domain') || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');

  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(domain) || domain.length > 253) {
    return NextResponse.json({ error: 'Enter a valid domain like myapp.com' }, { status: 400 });
  }

  // RDAP lookup — registered domains return 200 with a JSON object,
  // unregistered return 404. Some TLDs have no RDAP; treat errors as unknown.
  let registered: boolean | null = null;
  try {
    const rdap = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/rdap+json' },
    });
    if (rdap.status === 200) registered = true;
    else if (rdap.status === 404) registered = false;
  } catch {
    registered = null;
  }

  // DNS records for a Vercel deployment (standard Vercel values)
  const records = [
    { type: 'A', name: '@', value: '76.76.21.21', purpose: 'Points the root domain (myapp.com) at Vercel' },
    { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', purpose: 'Points www.myapp.com at Vercel' },
    { type: 'TXT', name: '_vercel', value: 'vc-domain-verify=your-project,xxx-token', purpose: 'Proves you own the domain — Vercel shows the exact value when you add the domain in its dashboard' },
  ];

  return NextResponse.json({
    domain,
    registered,
    records,
    steps: [
      'Buy the domain (if you don\'t own it) — Namecheap, Cloudflare, or Google Domains all work',
      'In your Vercel dashboard: open your project → Settings → Domains → Add, and type the domain',
      'Vercel shows the exact TXT verification value — copy it into the records below at your registrar',
      'Add the A and CNAME records below at your registrar\'s DNS settings (where you bought the domain)',
      'Wait for DNS to propagate (usually 5-30 minutes), then Vercel issues the HTTPS certificate automatically',
    ],
  });
}
