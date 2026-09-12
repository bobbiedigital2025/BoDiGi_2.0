import { NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email';

/**
 * POST /api/email/welcome
 * Sends the welcome email after a successful signup. Called fire-and-forget
 * from the client — failures here must never block account creation.
 * Body: { email: string, name?: string }
 */
export async function POST(request: Request) {
  try {
    const { email, name } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const result = await sendWelcomeEmail(email, typeof name === 'string' ? name : undefined);
    return NextResponse.json(result);
  } catch {
    // Never 500 on a welcome email — return ok so the client ignores it
    return NextResponse.json({ sent: false });
  }
}
