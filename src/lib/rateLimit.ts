import { logger } from "@/lib/logger";

/**
 * Rate limiter interface — swap the in-memory implementation for a
 * Redis-backed one later (RATE_LIMIT_BACKEND env) without touching call sites.
 */
export interface RateLimiter {
  consume(
    key: string,
    opts: { limit: number; windowMs: number },
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Simple sliding-window-ish limiter using fixed windows, per-process. */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  async consume(
    key: string,
    { limit, windowMs }: { limit: number; windowMs: number },
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      };
    }

    bucket.count += 1;
    return { allowed: true };
  }
}

export function getRateLimiter(): RateLimiter {
  const backend = process.env.RATE_LIMIT_BACKEND ?? "memory";
  if (backend !== "memory") {
    logger.warn(`Rate limiter backend "${backend}" not implemented — falling back to memory`);
  }
  return memoryRateLimiter;
}

export const memoryRateLimiter = new InMemoryRateLimiter();

export const OTP_RATE_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 } as const;
/** IP-layer cap — coarser than the per-mobile limit, stops host-wide abuse. */
export const OTP_IP_RATE_LIMIT = { limit: 15, windowMs: 10 * 60 * 1000 } as const;

/**
 * Best-effort client IP: trust x-forwarded-for (first hop) when the app is
 * behind a proxy, else x-real-ip, else fall back to "unknown". Only the
 * second (coarse) limiting layer keys on IP — per-mobile limiting remains
 * primary so NAT'd/shared networks are not bricked.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
