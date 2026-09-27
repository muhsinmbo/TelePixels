/**
 * Staff management. Admin-only provisioning; roles immutable except by superadmin.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { dbQuery } from '../database/db';
import { requireRole } from '../middleware/auth';
import { Validators, splitMeta } from '../middleware/validate';
import { audit } from '../middleware/errors';
import { withMeta } from './patients';

export const usersRouter = Router();

const COLS = ['email', 'displayName', 'role', 'status', 'facilityId', 'systemTheme',
  'whatsappEnabled', 'emailEnabled', 'patientEmailTemplate', 'physicianEmailTemplate',
  'radiologistEmailTemplate'] as const;

const SELECT = `id, email, display_name AS "displayName", role, status,
  facility_id AS "facilityId", system_theme AS "systemTheme",
  whatsapp_enabled AS "whatsappEnabled", email_enabled AS "emailEnabled",
  patient_email_template AS "patientEmailTemplate",
  physician_email_template AS "physicianEmailTemplate",
  radiologist_email_template AS "radiologistEmailTemplate", meta`;

usersRouter.get('/users', requireRole('facilityadmin'), async (req: Request, res: Response) => {
  const scope = req.user!.role === 'superadmin' ? null : req.user!.facilityId;
  const rows = scope
    ? await dbQuery<any>(`SELECT ${SELECT} FROM users WHERE facility_id = $1 ORDER BY display_name`, [scope])
    : await dbQuery<any>(`SELECT ${SELECT} FROM users ORDER BY display_name`);
  res.json(rows.map((u: any) => ({ ...withMeta(u), uid: u.id })));
});

usersRouter.post('/users', requireRole('facilityadmin'), Validators.userCreate, async (req: Request, res: Response) => {
  if (req.body.role === 'superadmin' && req.user!.role !== 'superadmin')
    return res.status(403).json({ error: 'Only superadmin can create superadmin' });
  const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
  const facilityId = req.user!.role === 'superadmin' ? (cols.facilityId || req.user!.facilityId) : req.user!.facilityId;
  const id = 'usr_' + crypto.randomBytes(5).toString('hex');
  const password_hash = await bcrypt.hash(req.body.password || crypto.randomBytes(8).toString('hex'), 12);
  try {
    const rows = await dbQuery<any>(
      `INSERT INTO users (id, email, password_hash, display_name, role, status, facility_id, system_theme,
         whatsapp_enabled, email_enabled, patient_email_template, physician_email_template, radiologist_email_template, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${SELECT}`,
      [id, cols.email.toLowerCase(), password_hash, cols.displayName || cols.email.split('@')[0],
       cols.role || 'receptionist', cols.status || 'active', facilityId, cols.systemTheme || 'cyber',
       cols.whatsappEnabled ?? true, cols.emailEnabled ?? true,
       cols.patientEmailTemplate || null, cols.physicianEmailTemplate || null,
       cols.radiologistEmailTemplate || null, JSON.stringify(meta)]
    );
    await audit(req, 'USER_CREATE', `Created user ${cols.email}`, id);
    res.status(201).json({ ...withMeta(rows[0]), uid: id });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

usersRouter.patch('/users/:uid', async (req: Request, res: Response) => {
  const { uid } = req.params;
  if (req.body.role && req.user!.id === uid)
    return res.status(403).json({ error: 'Cannot change your own role' });
  if (req.body.role && req.user!.role !== 'superadmin')
    return res.status(403).json({ error: 'Only superadmin can change roles' });
  const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
  const allowed: Record<string, string> = {
    displayName: 'display_name', status: 'status', facilityId: 'facility_id',
    systemTheme: 'system_theme', role: 'role', whatsappEnabled: 'whatsapp_enabled',
    emailEnabled: 'email_enabled', patientEmailTemplate: 'patient_email_template',
    physicianEmailTemplate: 'physician_email_template', radiologistEmailTemplate: 'radiologist_email_template',
  };
  const sets: string[] = []; const vals: any[] = [];
  for (const [k, col] of Object.entries(allowed)) {
    if ((cols as any)[k] !== undefined) { vals.push((cols as any)[k]); sets.push(`${col} = $${vals.length}`); }
  }
  if (Object.keys(meta).length) { vals.push(JSON.stringify(meta)); sets.push(`meta = meta || $${vals.length}::jsonb`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(uid);
  const rows = await dbQuery<any>(
    `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${SELECT}`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  await audit(req, 'USER_UPDATE', `Updated user ${uid}`, uid);
  res.json({ ...withMeta(rows[0]), uid });
});

usersRouter.delete('/users/:uid', requireRole('superadmin'), async (req: Request, res: Response) => {
  // Soft-deactivate: reports reference users with ON DELETE RESTRICT
  const rows = await dbQuery('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id', ['inactive', req.params.uid]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  await audit(req, 'USER_DEACTIVATE', `Deactivated user ${req.params.uid}`, req.params.uid);
  res.status(204).send();
});
