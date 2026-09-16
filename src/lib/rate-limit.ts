/**
 * Lightweight in-memory rate limiter for API routes.
 * Suitable for single-instance deployments (Vercel serverless functions
 * share memory within the same instance, so this is best-effort).
 * For strict multi-region limiting, use Upstash Ratelimit.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given identifier (e.g. user ID or IP).
 */
export function rateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = identifier;

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: config.limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= config.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Get client identifier from request (user ID preferred, falls back to IP).
 */
export function getClientId(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

/**
 * Standard rate limit configurations.
 */
export const RATE_LIMITS = {
  /** Pipeline generation — expensive AI calls */
  generate: { limit: 5, windowSeconds: 3600 },       // 5/hour
  /** Setup agent chat — moderate AI calls */
  setupAgent: { limit: 30, windowSeconds: 3600 },    // 30/hour
  /** Key storage writes */
  keyStorage: { limit: 20, windowSeconds: 3600 },    // 20/hour
  /** GitHub export — each export makes 2 GitHub API calls per file, so keep tight */
  githubExport: { limit: 5, windowSeconds: 3600 },    // 5/hour
  /** Stripe checkout */
  checkout: { limit: 10, windowSeconds: 3600 },      // 10/hour
  /** General API */
  api: { limit: 100, windowSeconds: 60 },            // 100/minute
} as const;
