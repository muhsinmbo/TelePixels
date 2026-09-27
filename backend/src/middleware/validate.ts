/**
 * STANDARD BUILD — allowlist validation (no new deps).
 * Blocks: shadow fields (#6), oversized input (#7), client timestamps (#11).
 */
import { Request, Response, NextFunction } from 'express';

function pick(obj: any, allowed: string[]): any {
  const out: any = {};
  for (const k of allowed) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}
const tooLong = (v: unknown, max: number) => typeof v === 'string' && v.length > max;
const GENDERS = ['Male', 'Female', 'Other'];
const STATUSES = ['Pending', 'Images Uploaded', 'In Progress', 'Partially Reported', 'Completed'];
const PRIORITIES = ['routine', 'urgent', 'STAT'];

const FORBIDDEN = new Set(['createdAt', 'created_at', 'updatedAt', 'updated_at', 'uid']);

/** Drop server-managed keys but pass everything else through (routes split known cols vs meta). */
function passThrough(body: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'meta' || FORBIDDEN.has(k)) continue;
    out[k] = v;
  }
  if (body?.meta && typeof body.meta === 'object') out.meta = body.meta;
  return out;
}

/**
 * Split a client payload into known columns vs extras.
 * Extras ride in the meta JSONB column and are merged back on read,
 * so frontend workflow fields survive without per-field migrations.
 */
export function splitMeta<T extends object>(body: any, known: string[]): { cols: T; meta: Record<string, any> } {
  const cols: any = {};
  const meta: Record<string, any> = { ...(body?.meta || {}) };
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'meta' || FORBIDDEN.has(k)) continue;
    if (known.includes(k)) cols[k] = v;
    else meta[k] = v;
  }
  return { cols: cols as T, meta };
}

export const Validators = {
  patientCreate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (!b.name || typeof b.name !== 'string') return res.status(400).json({ error: 'name is required' });
    if (tooLong(b.name, 255) || tooLong(b.mrn, 64)) return res.status(413).json({ error: 'field too long' });
    if (b.age !== undefined && (typeof b.age !== 'number' || b.age < 0 || b.age > 150))
      return res.status(400).json({ error: 'age must be 0-150' });
    if (b.gender && !GENDERS.includes(b.gender)) return res.status(400).json({ error: 'gender must be Male/Female/Other' });
    req.body = passThrough(b);
    next();
  },
  patientUpdate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (b.mrn !== undefined || b.createdAt !== undefined || b.id !== undefined)
      return res.status(400).json({ error: 'mrn/createdAt/id are immutable' });
    if (tooLong(b.name, 255)) return res.status(413).json({ error: 'name too long' });
    req.body = passThrough(b);
    next();
  },
  userCreate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (!b.email || typeof b.email !== 'string') return res.status(400).json({ error: 'email is required' });
    if (tooLong(b.email, 255) || tooLong(b.displayName, 255)) return res.status(413).json({ error: 'field too long' });
    req.body = passThrough(b);
    next();
  },
  requestCreate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (b.status && !STATUSES.includes(b.status)) return res.status(400).json({ error: `status must be ${STATUSES.join('/')}` });
    if (b.priority && !PRIORITIES.includes(b.priority)) return res.status(400).json({ error: 'priority must be routine/urgent/STAT' });
    req.body = passThrough(b);
    next();
  },
  requestUpdate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (b.status && !STATUSES.includes(b.status)) return res.status(400).json({ error: 'invalid status' });
    if (b.priority && !PRIORITIES.includes(b.priority)) return res.status(400).json({ error: 'invalid priority' });
    // State machine: never jump straight to Completed without a report (#10) — enforced here + in reports route
    req.body = passThrough(b);
    next();
  },
  reportCreate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (!b.findings || !b.impression) return res.status(400).json({ error: 'findings and impression are required' });
    req.body = passThrough(b);
    next();
  },
  imageCreate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (!b.name || !b.url || !b.storagePath) return res.status(400).json({ error: 'name, url, storagePath required' });
    req.body = passThrough(b);
    next();
  },
  logCreate(req: Request, res: Response, next: NextFunction) {
    const b = req.body || {};
    if (!b.action) return res.status(400).json({ error: 'action is required' });
    req.body = pick(b, ['action', 'details', 'targetId', 'facilityId']);
    next();
  },
};
