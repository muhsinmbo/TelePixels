/**
 * STANDARD BUILD — real JWT auth only. No reviewer bypass, no mock tokens.
 * Every protected route uses requireAuth; role checks use requireRole().
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string; email: string; role: string; facilityId: string; displayName?: string;
}

declare global { namespace Express { interface Request { user?: AuthUser } } }

function secret(): string {
  const s = process.env.JWT_SECRET || '';
  if (!s || s.length < 32) throw new Error('JWT_SECRET missing or too short (min 32 chars)');
  return s;
}

/** Short-lived access pass (default 15m). See ACCESS_TOKEN_TTL. */
export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, facilityId: user.facilityId },
    secret(),
    { expiresIn: (process.env.ACCESS_TOKEN_TTL as any) || '15m' }
  );
}

/** Rejects missing/invalid/expired Bearer tokens with 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }
  try {
    const p = jwt.verify(header.slice(7), secret()) as any;
    if (!p?.id || !p?.role) return res.status(401).json({ error: 'Invalid token claims' });
    req.user = { id: p.id, email: p.email, role: p.role, facilityId: p.facilityId };
    return next();
  } catch (err: any) {
    const msg = err?.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

/** superadmin bypasses all role checks; everyone else must hold one of the roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (req.user.role === 'superadmin') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires ${roles.join('/')} (you are ${req.user.role})` });
    }
    next();
  };
}

/** Non-superadmins are locked to their own facility. Returns null for superadmin (all facilities). */
export function facilityScope(req: Request): string | null {
  if (!req.user || req.user.role === 'superadmin') return null;
  return req.user.facilityId;
}
