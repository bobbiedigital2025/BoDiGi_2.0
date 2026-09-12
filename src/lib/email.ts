/**
 * Email service via Resend (https://resend.com).
 * Reads RESEND_API_KEY from environment. Emails are silently skipped
 * when the key isn't configured — safe for development.
 *
 * Get an API key: resend.com → API Keys → Create API Key
 * Verify your sending domain for production use.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = process.env.EMAIL_FROM || 'BoDiGi 2.0 <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bo-di-gi-2-0-plmk.vercel.app';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[email skipped — RESEND_API_KEY not set] To: ${to} | Subject: ${subject}`);
    return { sent: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { sent: false, error: err };
    }

    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err);
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ──────────────────────────────────────────────
// Email templates
// ──────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#d946ef);line-height:48px;font-size:24px;">⚡</div>
      <h1 style="color:#fff;font-size:20px;margin:12px 0 0;">BoDiGi 2.0</h1>
    </div>
    ${content}
    <p style="color:#525252;font-size:12px;text-align:center;margin-top:40px;">
      BoDiGi 2.0 — AI-powered application factory<br>
      <a href="${APP_URL}" style="color:#8b5cf6;">bodigi.app</a>
    </p>
  </div>
</body>
</html>`;
}

export async function sendExpiryWarningEmail(to: string, projectName: string, daysLeft: number, upgradeUrl: string) {
  return sendEmail({
    to,
    subject: `Your app "${projectName}" expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    html: baseTemplate(`
      <h2 style="color:#fff;font-size:18px;">Your preview is expiring soon</h2>
      <p style="color:#a3a3a3;font-size:14px;line-height:1.6;">
        Your app <strong style="color:#fff;">${projectName}</strong> will go offline in
        <strong style="color:#f59e0b;">${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.
        Upgrade to keep it live permanently and get the full source code.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${upgradeUrl}" style="display:inline-block;padding:14px 32px;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;text-decoration:none;font-weight:600;">
          Upgrade Now
        </a>
      </div>
    `),
  });
}

export async function sendUpgradeConfirmationEmail(to: string, tierName: string) {
  return sendEmail({
    to,
    subject: `Welcome to BoDiGi 2.0 ${tierName}!`,
    html: baseTemplate(`
      <h2 style="color:#fff;font-size:18px;">You're upgraded! 🎉</h2>
      <p style="color:#a3a3a3;font-size:14px;line-height:1.6;">
        Welcome to <strong style="color:#fff;">BoDiGi 2.0 ${tierName}</strong>.
        Your previews never expire, and you now have full source code export access.
      </p>
      <p style="color:#a3a3a3;font-size:14px;line-height:1.6;">
        Head to your dashboard to download your projects or start a new build.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;padding:14px 32px;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;text-decoration:none;font-weight:600;">
          Open Dashboard
        </a>
      </div>
    `),
  });
}

export async function sendWelcomeEmail(to: string, name?: string) {
  const greeting = name ? `Hey ${name.split(' ')[0]}` : 'Hey there';
  return sendEmail({
    to,
    subject: 'Welcome to BoDiGi 2.0 — your idea is about to become an app',
    html: baseTemplate(`
      <h2 style="color:#fff;font-size:18px;">${greeting}, you're in. ⚡</h2>
      <p style="color:#a3a3a3;font-size:14px;line-height:1.6;">
        You bring the idea. We build the business. Describe your app in one sentence
        and nine specialized AI agents will spec it, architect it, write the code,
        test it, and hand you a live preview — plus an investor one-pager, an honest
        reality check, and a step-by-step launch guide.
      </p>
      <p style="color:#a3a3a3;font-size:14px;line-height:1.6;">
        Your first build is free. It takes about five minutes.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;padding:14px 32px;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;text-decoration:none;font-weight:600;">
          Build My First App
        </a>
      </div>
    `),
  });
}
