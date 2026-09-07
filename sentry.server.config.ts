import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Only send errors when DSN is configured (production)
  enabled: !!process.env.SENTRY_DSN,

  // Sample 10% of transactions for performance monitoring — keep volume low on free tier
  tracesSampleRate: 0.1,

  // Don't send errors in local dev
  environment: process.env.VERCEL_ENV || 'development',
});
