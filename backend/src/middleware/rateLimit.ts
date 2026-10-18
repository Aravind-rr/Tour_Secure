// backend/src/middleware/rateLimit.ts
// Tiny in-memory fixed-window rate limiter (per user id or IP).
// Good enough for a single instance; swap for Redis in a multi-instance deploy.

import type { Request, Response, NextFunction } from "express";

export function rateLimit(opts: { windowMs: number; max: number; name?: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id || req.ip || "anon";
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, h);
    }
    h.count++;
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (h.count > opts.max) {
      res.setHeader("Retry-After", String(Math.ceil((h.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests", reason: `${opts.name || "rate"}_limited` });
    }
    return next();
  };
}
