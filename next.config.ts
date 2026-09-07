import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project for source map uploads (only used with SENTRY_AUTH_TOKEN set)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload source maps only when an auth token is present — builds work without it
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Hide source maps from public client bundles
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
