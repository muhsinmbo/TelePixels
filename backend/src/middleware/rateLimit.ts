/**
 * Rate limiting (P2). Lenient global cap + strict budgets for auth and the
 * public portal. Uses X-Forwarded-For only when behind a proxy you control
 * (see TRUST_PROXY); default keeps direct-remote-IP behavior.
 */
import rateLimit from 'express-rate-limit';

// NOTE: if deployed behind a proxy you control, set TRUST_PROXY=true so
// limiters key on X-Forwarded-For. app.ts applies it (default: direct IP).

/** General API budget: 300 requests / 15 min per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_API || 300),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down and retry shortly' },
});

/** Login budget: slows credential stuffing without hurting staff. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH || 30),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again in 15 minutes' },
});

/** Public portal budget (replaces the old hand-rolled counter). */
export const portalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PORTAL || 30),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again shortly' },
});
