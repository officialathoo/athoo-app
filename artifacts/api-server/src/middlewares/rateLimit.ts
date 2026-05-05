import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyFn: (req: Request) => string;
  message?: string;
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.path}:${opts.keyFn(req)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: opts.message || "Too many requests. Please wait and try again.",
        retryAfter,
      });
      return;
    }
    bucket.count += 1;
    next();
  };
}

// Periodic GC so the map doesn't grow unbounded.
const gc = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000);
if (typeof gc.unref === "function") gc.unref();

export const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: (req) => {
    const phone = (req.body?.phone || "").toString().trim();
    const email = (req.body?.email || "").toString().trim().toLowerCase();
    const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
    return `${phone}|${email}|${ip}`;
  },
  message: "Too many OTP requests. Please wait 10 minutes before trying again.",
});

