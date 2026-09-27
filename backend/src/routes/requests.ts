/**
 * Imaging requests & worklists. Patient must exist in same facility (#3, #4).
 * Unknown client fields ride in meta JSONB and merge back on read.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery } from '../database/db';
import { facilityScope } from '../middleware/auth';
import { Validators, splitMeta } from '../middleware/validate';
import { audit } from '../middleware/errors';
import { withMeta } from './patients';

export const requestsRouter = Router();

const COLS = ['modalities', 'procedures', 'clinicalInfo', 'radiographerHistory', 'status', 'priority', 'needsReport', 'studyDescription'] as const;

const SELECT = `id, patient_id AS "patientId", facility_id AS "facilityId",
  modalities, procedures, clinical_info AS "clinicalInfo",
  radiographer_history AS "radiographerHistory", status, priority,
  needs_report AS "needsReport", study_description AS "studyDescription", meta,
  created_at AS "createdAt", uploaded_at AS "uploadedAt", completed_at AS "completedAt"`;

async function checkPatient(req: Request, patientId: string) {
  const rows = await dbQuery<any>('SELECT id, facility_id FROM patients WHERE id = $1', [patientId]);
  const p = rows[0];
  if (!p) return { error: 'Patient not found' as const };
  const scope = facilityScope(req);
  if (scope && p.facility_id !== scope) return { error: 'Cross-facility access denied' as const };
  return { patient: p };
}

requestsRouter.get('/requests', async (req: Request, res: Response) => {
  const conds: string[] = []; const vals: any[] = [];
  const scope = facilityScope(req);
  const facilityId = scope || (req.query.facilityId as string);
  if (facilityId) { vals.push(facilityId); conds.push(`facility_id = $${vals.length}`); }
  if (req.query.status) { vals.push(req.query.status); conds.push(`status = $${vals.length}`); }
  if (req.query.patientId) { vals.push(req.query.patientId); conds.push(`patient_id = $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await dbQuery<any>(`SELECT ${SELECT} FROM imaging_requests ${where} ORDER BY created_at DESC`, vals);
  res.json(rows.map(withMeta));
});

requestsRouter.get('/patients/:patientId/requests/:requestId', async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(`SELECT ${SELECT} FROM imaging_requests WHERE id = $1`, [req.params.requestId]);
  const r = rows[0];
  if (!r || r.patientId !== req.params.patientId) return res.status(404).json({ error: 'Request not found' });
  const scope = facilityScope(req);
  if (scope && r.facilityId !== scope) return res.status(403).json({ error: 'Cross-facility access denied' });
  res.json(withMeta(r));
});

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

requestsRouter.post('/patients/:patientId/requests', Validators.requestCreate, async (req: Request, res: Response) => {
  const chk = await checkPatient(req, req.params.patientId);
  if ('error' in chk) return res.status(chk.error === 'Patient not found' ? 404 : 403).json({ error: chk.error });
  const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
  // Honor intake's pre-generated request ID when safe (patient doc references it)
  let id = 'req_' + crypto.randomBytes(5).toString('hex');
  if (typeof req.body.id === 'string' && SAFE_ID.test(req.body.id)) {
    const taken = await dbQuery('SELECT 1 FROM imaging_requests WHERE id = $1', [req.body.id]);
    if (!taken[0]) id = req.body.id;
  }
  const rows = await dbQuery<any>(
    `INSERT INTO imaging_requests (id, patient_id, facility_id, modalities, procedures, clinical_info, radiographer_history, status, priority, needs_report, study_description, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${SELECT}`,
    [id, req.params.patientId, chk.patient.facility_id,
     JSON.stringify(cols.modalities || []), JSON.stringify(cols.procedures || []),
     cols.clinicalInfo || null, cols.radiographerHistory || null,
     cols.status || 'Pending', cols.priority || 'routine',
     cols.needsReport !== undefined ? !!cols.needsReport : true, cols.studyDescription || null,
     JSON.stringify(meta)]
  );
  await audit(req, 'REQUEST_CREATE', `Created request ${id}`, id);
  res.status(201).json(withMeta(rows[0]));
});

requestsRouter.patch('/patients/:patientId/requests/:requestId', Validators.requestUpdate, async (req: Request, res: Response) => {
  const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
  // State machine (#10): Completed via report finalization — except no-report
  // studies (needsReport === false), which legitimately complete on upload.
  if (cols.status === 'Completed') {
    const cur = await dbQuery<any>('SELECT needs_report FROM imaging_requests WHERE id = $1 AND patient_id = $2',
      [req.params.requestId, req.params.patientId]);
    if (!cur[0]) return res.status(404).json({ error: 'Request not found' });
    const willNeedReport = cols.needsReport !== undefined ? !!cols.needsReport : cur[0].needs_report;
    if (willNeedReport) {
      return res.status(400).json({ error: 'Complete a request by finalizing its report, not by status edit' });
    }
  }
  const map: Record<string, string> = {
    clinicalInfo: 'clinical_info', radiographerHistory: 'radiographer_history',
    status: 'status', priority: 'priority', needsReport: 'needs_report', studyDescription: 'study_description',
  };
  const sets: string[] = []; const vals: any[] = [];
  for (const [k, col] of Object.entries(map)) {
    if (cols[k] !== undefined) {
      vals.push(k === 'needsReport' ? !!cols[k] : cols[k]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (Object.keys(meta).length) { vals.push(JSON.stringify(meta)); sets.push(`meta = meta || $${vals.length}::jsonb`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  // Server-side timestamps for workflow transitions
  if (cols.status === 'Images Uploaded' || cols.status === 'Completed') {
    sets.push(`uploaded_at = COALESCE(uploaded_at, NOW())`);
  }
  if (cols.status === 'Completed') {
    sets.push(`completed_at = NOW()`);
  }
  vals.push(req.params.requestId, req.params.patientId);
  const rows = await dbQuery<any>(
    `UPDATE imaging_requests SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${vals.length - 1} AND patient_id = $${vals.length} RETURNING ${SELECT}`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
  await audit(req, 'REQUEST_UPDATE', `Updated request ${req.params.requestId}`, req.params.requestId);
  res.json(withMeta(rows[0]));
});
