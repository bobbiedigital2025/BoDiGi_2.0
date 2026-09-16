/**
 * API Routes for User API Key Storage
 * POST   /api/setup-agent/keys    — Save a key
 * GET    /api/setup-agent/keys    — List user's keys
 * DELETE /api/setup-agent/keys   — Delete a key
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';
import { encrypt } from '@/lib/encryption';
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
    const { data, error } = await supabase
      .from('user_api_keys')
      .upsert({
        user_id: user.id,
        project_id: projectId || null,
        provider,
        key_name: keyName,
        key_value_encrypted: encrypted,
        is_valid: true,
        last_checked: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,project_id,provider',
      })
      .select()
      .single();

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
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 });
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

  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
