/**
 * Patients & intake. Facility-scoped; mrn unique & immutable.
 * Unknown client fields ride in meta JSONB and merge back on read.
 * Client-chosen IDs (intake) are honored when safe, else generated.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery } from '../database/db';
import { facilityScope } from '../middleware/auth';
import { Validators, splitMeta } from '../middleware/validate';
import { audit } from '../middleware/errors';

export const patientsRouter = Router();

const COLS = ['name', 'age', 'gender', 'phone', 'contact', 'address', 'nationalId', 'accessCode', 'facilityId'] as const;
type PatientCols = {
  name?: string; age?: number; gender?: string; phone?: string; contact?: string;
  address?: string; nationalId?: string; accessCode?: string; facilityId?: string;
};

const SELECT = `id, name, age, gender, phone, contact, address,
  national_id AS "nationalId", access_code AS "accessCode", mrn,
  facility_id AS "facilityId", meta,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export function withMeta(r: any): any {
  if (!r) return r;
  const { meta, ...rest } = r;
  return { ...(meta || {}), ...rest };
}

function scopeFilter(req: Request): { clause: string; vals: any[] } {
  const scope = facilityScope(req);
  const q = (req.query.facilityId as string) || '';
  const facilityId = scope || q;
  if (facilityId) return { clause: 'WHERE facility_id = $1', vals: [facilityId] };
  return { clause: '', vals: [] };
}

patientsRouter.get('/patients', async (req: Request, res: Response) => {
  const { clause, vals } = scopeFilter(req);
  const rows = await dbQuery<any>(`SELECT ${SELECT} FROM patients ${clause} ORDER BY created_at DESC`, vals);
  res.json(rows.map(withMeta));
});

patientsRouter.get('/patients/:id', async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(`SELECT ${SELECT} FROM patients WHERE id = $1`, [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const scope = facilityScope(req);
  if (scope && p.facilityId !== scope) return res.status(403).json({ error: 'Cross-facility access denied' });
  res.json(withMeta(p));
});

function newAccessCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

patientsRouter.post('/patients', Validators.patientCreate, async (req: Request, res: Response) => {
  const { cols, meta } = splitMeta<PatientCols>(req.body, [...COLS]);
  const scope = facilityScope(req);
  const facilityId = scope || cols.facilityId || 'default-facility';
  if (scope && req.body.facilityId && req.body.facilityId !== scope)
    return res.status(403).json({ error: 'Cross-facility write denied' });
  // Honor intake's client-chosen ID when safe
  let id = 'KP-' + crypto.randomInt(100000, 999999);
  if (typeof req.body.id === 'string' && SAFE_ID.test(req.body.id)) {
    const taken = await dbQuery('SELECT 1 FROM patients WHERE id = $1', [req.body.id]);
    if (!taken[0]) id = req.body.id;
  }
  try {
    const rows = await dbQuery<any>(
      `INSERT INTO patients (id, name, age, gender, phone, contact, address, national_id, access_code, mrn, facility_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${SELECT}`,
      [id, cols.name, cols.age ?? 0, cols.gender || 'Other', cols.phone || null, cols.contact || null,
       cols.address || null, cols.nationalId || null, cols.accessCode || newAccessCode(),
       req.body.mrn || id, facilityId, JSON.stringify(meta)]
    );
    await audit(req, 'PATIENT_CREATE', `Registered patient ${id}`, id);
    res.status(201).json(withMeta(rows[0]));
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'MRN already exists' });
    throw e;
  }
});

patientsRouter.patch('/patients/:id', Validators.patientUpdate, async (req: Request, res: Response) => {
  const { cols, meta } = splitMeta<PatientCols>(req.body, [...COLS]);
  const map: Record<string, string> = {
    name: 'name', age: 'age', gender: 'gender', phone: 'phone', contact: 'contact',
    address: 'address', nationalId: 'national_id', accessCode: 'access_code', facilityId: 'facility_id',
  };
  const sets: string[] = []; const vals: any[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (cols as any)[k];
    if (v !== undefined) { vals.push(v); sets.push(`${col} = $${vals.length}`); }
  }
  if (Object.keys(meta).length) { vals.push(JSON.stringify(meta)); sets.push(`meta = meta || $${vals.length}::jsonb`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const scope = facilityScope(req);
  vals.push(req.params.id);
  const rows = await dbQuery<any>(
    `UPDATE patients SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}
     ${scope ? `AND facility_id = '${scope}'` : ''} RETURNING ${SELECT}`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Patient not found' });
  await audit(req, 'PATIENT_UPDATE', `Updated patient ${req.params.id}`, req.params.id);
  res.json(withMeta(rows[0]));
});

patientsRouter.delete('/patients/:id', async (req: Request, res: Response) => {
  if (req.user!.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
  const rows = await dbQuery('DELETE FROM patients WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Patient not found' });
  await audit(req, 'PATIENT_DELETE', `Deleted patient ${req.params.id}`, req.params.id);
  res.status(204).send();
});
