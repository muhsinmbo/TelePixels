/**
 * System settings + append-only audit logs.
 */
import { Router, Request, Response } from 'express';
import { dbQuery } from '../database/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Validators } from '../middleware/validate.js';
import { getPage, pageClause } from '../middleware/paginate.js';

export const systemRouter = Router();

systemRouter.get('/settings/global', async (_req: Request, res: Response) => {
  const rows = await dbQuery<any>(`SELECT value FROM system_settings WHERE key = 'global'`);
  res.json(rows[0]?.value || { theme: 'cyber', whatsappEnabled: true, emailEnabled: true });
});

systemRouter.patch('/settings/global', requireRole('facilityadmin'), async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(
    `INSERT INTO system_settings (key, value) VALUES ('global', $1)
     ON CONFLICT (key) DO UPDATE SET value = system_settings.value || EXCLUDED.value, updated_at = NOW()
     RETURNING value`, [JSON.stringify(req.body || {})]);
  res.json(rows[0].value);
});

systemRouter.get('/logs', requireRole('superadmin'), async (req: Request, res: Response) => {
  const { limit, offset } = getPage(req.query);
  const vals: any[] = [];
  res.json(await dbQuery(
    `SELECT id, action, details, user_id AS "userId", user_name AS "userName", user_role AS "userRole",
       facility_id AS "facilityId", target_id AS "targetId", created_at AS "timestamp"
     FROM system_logs ORDER BY id DESC ${pageClause(vals, limit, offset)}`, vals));
});

systemRouter.post('/logs', Validators.logCreate, async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(
    `INSERT INTO system_logs (action, details, user_id, user_name, user_role, facility_id, target_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, action, details, created_at AS "timestamp"`,
    [req.body.action, req.body.details || '', req.user!.id,
     (req.user as any).displayName || req.user!.email, req.user!.role,
     req.body.facilityId || req.user!.facilityId, req.body.targetId || null]);
  res.status(201).json(rows[0]);
});
