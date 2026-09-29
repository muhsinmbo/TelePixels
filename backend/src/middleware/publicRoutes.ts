/**
 * The ONLY routes that work without a JWT. Everything else hits requireAuth.
 * (Kept in one place + unit-tested so a future edit can't silently open data.)
 */
import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth.js';

export const PUBLIC_ROUTES = new Set([
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /portal/verify',
  'GET /settings/global',
  'GET /docs',
]);

export function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.has(`${method.toUpperCase()} ${path}`);
}

export function authGate(req: Request, res: Response, next: NextFunction) {
  if (isPublicRoute(req.method, req.path)) return next();
  return requireAuth(req, res, next);
}
