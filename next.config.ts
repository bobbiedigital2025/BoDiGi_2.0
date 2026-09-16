import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  // Force HTTPS for a year (browsers remember, even on first visit's redirect)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Allow same-origin framing — the dashboard embeds /preview in an iframe.
  // DENY would break the Live Preview tab.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Don't guess MIME types — blocks content sniffing attacks
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Hide our tech stack from attackers probing the server
  { key: "X-Powered-By", value: "" },
  // Control referrer data sent to other sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict which browser features pages can use
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
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
