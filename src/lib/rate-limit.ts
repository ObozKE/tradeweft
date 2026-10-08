import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from './logger';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// In-memory sliding window cache for local development & offline testing
const memoryStore = new Map<string, { timestamps: number[] }>();

function inMemoryRateLimiter(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const current = memoryStore.get(identifier) || { timestamps: [] };
  // Filter out timestamps outside window
  const activeTimestamps = current.timestamps.filter((t) => t > windowStart);

  if (activeTimestamps.length >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset: activeTimestamps[0] + windowMs,
    };
  }

  activeTimestamps.push(now);
  memoryStore.set(identifier, { timestamps: activeTimestamps });

  return {
    success: true,
    limit,
    remaining: limit - activeTimestamps.length,
    reset: now + windowMs,
  };
}

let upstashRedis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  upstashRedis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/**
 * Creates a rate limiter instance
 * @param prefix - Key namespace (e.g., 'auth:callback', 'auth:initiate', 'onboarding')
 * @param requests - Maximum requests allowed in the duration window
 * @param windowSeconds - Sliding window duration in seconds
 */
export function createRateLimiter(
  prefix: string,
  requests: number = 10,
  windowSeconds: number = 60
) {
  let upstashLimiter: Ratelimit | null = null;
  if (upstashRedis) {
    upstashLimiter = new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
      prefix: `tw:${prefix}`,
    });
  }

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      // 1. If Upstash is configured, use it
      if (upstashLimiter) {
        try {
          const res = await upstashLimiter.limit(identifier);
          if (!res.success) {
            logger.warn({
              event: 'rate_limit.hit',
              prefix,
              identifier,
              limit: res.limit,
              remaining: res.remaining,
            });
          }
          return {
            success: res.success,
            limit: res.limit,
            remaining: res.remaining,
            reset: res.reset,
          };
        } catch (error) {
          logger.error({ error }, 'Upstash Redis query failed during rate limiting');
          // In production, fail closed
          if (process.env.NODE_ENV === 'production') {
            return {
              success: false,
              limit: requests,
              remaining: 0,
              reset: Date.now() + windowSeconds * 1000,
            };
          }
          // In dev/test, fall back to memory
        }
      }

      // 2. In production without Upstash credentials, fail closed for security
      if (process.env.NODE_ENV === 'production') {
        logger.error('Missing UPSTASH_REDIS_REST_URL or TOKEN in production. Failing closed.');
        return {
          success: false,
          limit: requests,
          remaining: 0,
          reset: Date.now() + windowSeconds * 1000,
        };
      }

      // 3. Development / Test in-memory limiter
      const memRes = inMemoryRateLimiter(
        `${prefix}:${identifier}`,
        requests,
        windowSeconds * 1000
      );
      if (!memRes.success) {
        logger.warn({
          event: 'rate_limit.hit',
          prefix,
          identifier,
          limit: memRes.limit,
          remaining: memRes.remaining,
        });
      }
      return memRes;
    },
  };
}

export const authCallbackLimiter = createRateLimiter('auth:callback', 15, 60);
export const authInitiateLimiter = createRateLimiter('auth:initiate', 20, 60);
export const emailLoginLimiter = createRateLimiter('auth:email_login', 5, 60);
export const emailSignupLimiter = createRateLimiter('auth:email_signup', 5, 60);
export const onboardingLimiter = createRateLimiter('onboarding', 10, 60);
export const serverActionLimiter = createRateLimiter('action', 30, 60);
export const packageActionLimiter = createRateLimiter('package:action', 30, 60);
export const publishLimiter = createRateLimiter('package:publish', 10, 60);
export const exploreSearchLimiter = createRateLimiter('explore:search', 60, 60);
