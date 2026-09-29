/**
 * API Routes for User API Key Storage
 * POST   /api/setup-agent/keys    — Save a key
 * GET    /api/setup-agent/keys    — List user's keys
 * DELETE /api/setup-agent/keys   — Delete a key
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { createAdminClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';
import { decrypt } from '@/lib/encryption';
import { rateLimit, getClientId, RATE_LIMITS } from '@/lib/rate-limit';

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// Detect provider from key format
function detectProvider(keyName: string): string {
  const name = keyName.toLowerCase();
  if (name.includes('telnyx')) return 'telnyx';
  if (name.includes('supabase')) return 'supabase';
  if (name.includes('vercel')) return 'vercel';
  if (name.includes('openai')) return 'openai';
  if (name.includes('anthropic')) return 'anthropic';
  if (name.includes('github')) return 'github';
  return 'custom';
}

// Validate key format (basic checks)
function validateKey(keyName: string, keyValue: string): { valid: boolean; message?: string } {
  if (!keyValue || keyValue.length < 10) {
    return { valid: false, message: 'Key seems too short. Make sure you copied the full key.' };
  }

  const name = keyName.toLowerCase();
  if (name.includes('telnyx') && !keyValue.startsWith('KEY') && keyValue.length < 20) {
    return { valid: false, message: 'Telnyx keys usually start with "KEY" and are fairly long. Double-check you copied the right value.' };
  }
  if (name.includes('supabase_url') && !keyValue.includes('supabase.co')) {
    return { valid: false, message: 'Supabase URLs usually contain "supabase.co". Make sure you copied the Project URL, not the key.' };
  }
  if (name.includes('github') && !keyValue.startsWith('github_pat_') && !keyValue.startsWith('ghp_') && !keyValue.startsWith('gho_')) {
    return { valid: false, message: 'GitHub tokens usually start with "github_pat_" (fine-grained) or "ghp_" (classic). Make sure you copied the full token.' };
  }

  return { valid: true };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Rate limit key storage writes
  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.keyStorage);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { keyName, keyValue, projectId } = await request.json();

  if (!keyName || !keyValue) {
    return NextResponse.json({ error: 'Key name and value required' }, { status: 400 });
  }

  // Validate
  const validation = validateKey(keyName, keyValue);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const provider = detectProvider(keyName);
  const encrypted = encrypt(keyValue);

  try {
    // Writes go through the admin client (service role) like every other
    // server-side write in this codebase: the user is authenticated above
    // and the row is pinned to their user_id, so this is safe — and it
    // sidesteps table RLS, whose missing INSERT policy 500'd every key save.
    const db = createAdminClient();

    // Find-then-write scoped to user+project+provider+key_name (per-app keys
    // like a Supabase URL plus service key must not collide).
    let lookup = db
      .from('user_api_keys')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .eq('key_name', keyName);
    lookup = projectId ? lookup.eq('project_id', projectId) : lookup.is('project_id', null);
    const { data: existing } = await lookup.maybeSingle();

    const fields = {
      key_name: keyName,
      key_value_encrypted: encrypted,
      is_valid: true,
      last_checked: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = existing
      ? await db.from('user_api_keys').update(fields).eq('id', existing.id).select().single()
      : await db.from('user_api_keys').insert({
          user_id: user.id, project_id: projectId || null, provider, ...fields,
        }).select().single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      key: {
        id: data.id,
        provider: data.provider,
        keyName: data.key_name,
        masked: maskKey(keyValue),
        isValid: data.is_valid,
      },
    });
  } catch (err) {
    console.error('Key storage error:', err);
    // Surface the real detail to the key's owner — opaque failures are
    // undebuggable for the very person who could fix them.
    let detail = 'unknown';
    if (err instanceof Error) detail = err.message;
    else if (err && typeof err === 'object' && 'message' in err) detail = String((err as { message: unknown }).message);
    else if (err != null) detail = String(err);
    return NextResponse.json({ error: `Failed to save key: ${detail}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  let query = supabase
    .from('user_api_keys')
    .select('id, provider, key_name, is_valid, last_checked, created_at, updated_at')
    .eq('user_id', user.id);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
  }

  return NextResponse.json({
    keys: data.map((k: { id: string; provider: string; key_name: string; is_valid: boolean; last_checked: string | null; created_at: string; updated_at: string }) => ({
      id: k.id,
      provider: k.provider,
      keyName: k.key_name,
      isValid: k.is_valid,
      lastChecked: k.last_checked,
      updatedAt: k.updated_at,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { keyId } = await request.json();

  if (!keyId) {
    return NextResponse.json({ error: 'Key ID required' }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from('user_api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * POST /api/setup-agent/keys/test — validate a stored key against its provider.
 * Body: { keyId }  →  { valid, message }
 *
 * Decrypts the stored key server-side (never leaves the server), pings the
 * provider with a cheap authenticated call, and updates is_valid/last_checked.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rl = rateLimit(getClientId(request, user.id), RATE_LIMITS.keyTest);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many key tests. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { keyId } = await request.json();
  if (!keyId) {
    return NextResponse.json({ error: 'Key ID required' }, { status: 400 });
  }

  // Fetch + decrypt server-side. Admin client because table RLS has no
  // SELECT policy for user rows (writes already go through the service role).
  const db = createAdminClient();
  const { data: row, error: fetchError } = await db
    .from('user_api_keys')
    .select('id, provider, key_name, key_value_encrypted')
    .eq('id', keyId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  let value: string;
  try {
    value = decrypt(row.key_value_encrypted);
  } catch {
    return NextResponse.json({ valid: false, message: 'Stored key could not be decrypted — remove and re-add it.' }, { status: 200 });
  }

  const result = await testKey(row.provider, row.key_name, value);

  await db
    .from('user_api_keys')
    .update({ is_valid: result.valid, last_checked: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', user.id);

  return NextResponse.json(result);
}

/**
 * Cheap authenticated ping per provider. Returns valid + a human message.
 * Never returns the key. Timeouts are short so a hung provider doesn't
 * hang the settings page.
 */
async function testKey(provider: string, keyName: string, value: string): Promise<{ valid: boolean; message: string }> {
  const timeout = (ms: number) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };

  try {
    switch (provider) {
      case 'telnyx': {
        // Balance endpoint is the cheapest authenticated call Telnyx has.
        const res = await fetch('https://api.telnyx.com/v2/balance', {
          headers: { Authorization: `Bearer ${value}` },
          signal: timeout(8000),
        });
        if (res.ok) return { valid: true, message: 'Telnyx accepted the key — balance endpoint responded.' };
        if (res.status === 403) return { valid: false, message: 'Telnyx rejected the key (403). If your balance is $0, top up the wallet — Telnyx reports empty balance as a 403, not an auth error.' };
        return { valid: false, message: `Telnyx responded ${res.status}.` };
      }
      case 'supabase': {
        if (keyName.toLowerCase().includes('url')) {
          // URL "key": just check the project responds.
          const res = await fetch(`${value.replace(/\/$/, '')}/rest/v1/`, {
            headers: { apikey: 'ping' },
            signal: timeout(8000),
          });
          // Any structured response (even 401) means the project is live.
          return res.status === 404
            ? { valid: false, message: 'Project URL did not respond — check it is your Supabase Project URL.' }
            : { valid: true, message: 'Supabase project is live and responding.' };
        }
        // Service/anon key: ping the platform's own REST root with it.
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!url) return { valid: false, message: 'Cannot verify Supabase keys on this deployment (missing platform URL).' };
        const res = await fetch(`${url}/rest/v1/`, {
          headers: { apikey: value },
          signal: timeout(8000),
        });
        if (res.ok) return { valid: true, message: 'Supabase accepted the key.' };
        return { valid: false, message: `Supabase rejected the key (${res.status}).` };
      }
      case 'github': {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${value}`, Accept: 'application/vnd.github+json' },
          signal: timeout(8000),
        });
        if (res.ok) return { valid: true, message: 'GitHub accepted the token.' };
        if (res.status === 401) return { valid: false, message: 'GitHub rejected the token — it may be expired or revoked. Generate a new one.' };
        return { valid: false, message: `GitHub responded ${res.status}.` };
      }
      case 'vercel': {
        const res = await fetch('https://api.vercel.com/v2/user', {
          headers: { Authorization: `Bearer ${value}` },
          signal: timeout(8000),
        });
        if (res.ok) return { valid: true, message: 'Vercel accepted the token.' };
        return { valid: false, message: `Vercel rejected the token (${res.status}).` };
      }
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${value}` },
          signal: timeout(8000),
        });
        if (res.ok) return { valid: true, message: 'OpenAI accepted the key.' };
        if (res.status === 401) return { valid: false, message: 'OpenAI rejected the key — check it is a valid sk- key.' };
        return { valid: false, message: `OpenAI responded ${res.status}.` };
      }
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' },
          signal: timeout(8000),
        });
        if (res.ok) return { valid: true, message: 'Anthropic accepted the key.' };
        return { valid: false, message: `Anthropic responded ${res.status}.` };
      }
      default:
        return { valid: true, message: 'Custom key stored — no automated test for this provider. It will be checked when your app uses it.' };
      }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, message: 'Provider did not respond in time — could be a network hiccup. Try again.' };
    }
    return { valid: false, message: 'Could not reach the provider to test this key.' };
  }
}
