/**
 * STANDARD BUILD — central error shape + audit helper.
 * All routes return { error: string } on failure; audit() writes append-only logs.
 */
import { Request, Response, NextFunction } from 'express';
import { dbQuery } from '../database/db.js';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Express 4 does not catch async handler rejections — without this, a single
 * thrown error (e.g. AI 503, DB blip) kills the process with ECONNRESET.
 */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('[api] error:', err?.message || err);
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || 'Internal server error' });
}

export async function audit(req: Request, action: string, details: string, targetId?: string) {
  try {
    await dbQuery(
      `INSERT INTO system_logs (action, details, user_id, user_name, user_role, facility_id, target_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [action, details, req.user?.id || 'system', req.user?.displayName || req.user?.email || 'system',
       req.user?.role || null, req.user?.facilityId || null, targetId || null]
    );
  } catch (e: any) {
    console.warn('[audit] write failed:', e.message);
  }
}
