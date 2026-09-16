/**
 * API Route: GET /api/cron/expire-previews
 * Vercel Cron job — expires free-tier preview projects whose
 * preview_expires_at has passed.
 *
 * Scheduled in vercel.json to run daily at 03:00 UTC.
 * Secured with CRON_SECRET — Vercel sends it as Authorization: Bearer <secret>.
 *
 * Also sets preview_expires_at (7 days out) on any free-tier project
 * that doesn't have one yet — keeps the data consistent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendExpiryWarningEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this header automatically for cron jobs)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const results = {
    backfilled: 0,
    expired: 0,
    warningsSent: 0,
    errors: [] as string[],
  };

  try {
    // 1. Backfill: free-tier projects with no expiry set → set to 7 days from creation
    const { data: noExpiry, error: backfillError } = await supabase
      .from('projects')
      .select('id, created_at, user_id')
      .eq('is_preview', true)
      .is('preview_expires_at', null);

    if (backfillError) throw backfillError;

    for (const project of noExpiry || []) {
      // Set expiry based on owner's tier: free = 7 days, starter = 30 days,
      // pro/enterprise = never (no expiry set)
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier')
        .eq('id', project.user_id)
        .single();

      const tier = profile?.tier || 'free';
      if (tier === 'pro' || tier === 'enterprise') continue;

      const days = tier === 'starter' ? 30 : 7;
      const createdAt = new Date(project.created_at);
      const expiresAt = new Date(createdAt);
      expiresAt.setDate(expiresAt.getDate() + days);

      const { error } = await supabase
        .from('projects')
        .update({ preview_expires_at: expiresAt.toISOString() })
        .eq('id', project.id);

      if (error) results.errors.push(`backfill ${project.id}: ${error.message}`);
      else results.backfilled += 1;
    }

    // 2. Send expiry warning emails: free-tier projects expiring within 24 hours
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: expiringSoon, error: warningError } = await supabase
      .from('projects')
      .select('id, user_id, name, preview_expires_at')
      .eq('is_preview', true)
      .not('preview_expires_at', 'is', null)
      .gte('preview_expires_at', now.toISOString())
      .lte('preview_expires_at', tomorrow.toISOString());

    if (warningError) throw warningError;

    for (const project of expiringSoon || []) {
      // Warning emails for free AND starter tier (both have expiring previews)
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier, email')
        .eq('id', project.user_id)
        .single();

      const tier = profile?.tier || 'free';
      if (tier === 'pro' || tier === 'enterprise') continue;
      if (!profile?.email) continue;

      const { sent } = await sendExpiryWarningEmail(
        profile.email,
        project.name || 'Your app',
        1,
        `https://bobbiedigital2025-appforge-dev.vercel.app/pricing`
      );

      if (sent) results.warningsSent += 1;
    }

    // 3. Expire: free-tier projects past their expiry → mark as expired (offline)
    const { data: expiredProjects, error: expireError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('is_preview', true)
      .not('preview_expires_at', 'is', null)
      .lt('preview_expires_at', now.toISOString());

    if (expireError) throw expireError;

    for (const project of expiredProjects || []) {
      // Pro/Enterprise upgraded — previews never expire, clear flags
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier')
        .eq('id', project.user_id)
        .single();

      const tier = profile?.tier || 'free';
      if (tier === 'pro' || tier === 'enterprise') {
        // User upgraded — clear preview flags instead
        await supabase
          .from('projects')
          .update({ is_preview: false, preview_expires_at: null })
          .eq('id', project.id);
        continue;
      }

      // Free (7 days) or Starter (30 days) past expiry → mark as expired
      const { error } = await supabase
        .from('projects')
        .update({
          is_preview: false,
          status: 'expired',
          updated_at: now,
        })
        .eq('id', project.id);

      if (error) results.errors.push(`expire ${project.id}: ${error.message}`);
      else results.expired += 1;
    }

    console.log('Preview expiry cron complete:', results);

    return NextResponse.json({
      success: true,
      timestamp: now,
      ...results,
    });
  } catch (err) {
    console.error('Cron error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error', ...results },
      { status: 500 }
    );
  }
}
