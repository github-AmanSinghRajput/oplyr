import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  // Periodically drop expired buckets so the Map can't grow unbounded. `unref` so the timer never
  // keeps the process alive.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs);
  sweep.unref?.();

  return (request, response, next) => {
    const key = request.ip || 'unknown';
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      response.setHeader('Retry-After', Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
      next(new AppError(429, 'Too many requests. Please slow down.', 'RATE_LIMITED'));
      return;
    }

    current.count += 1;
    buckets.set(key, current);
    next();
  };
}
