/**
 * Radiology + ultrasound reports. Radiologist/sonographer-only writes (#5).
 * Creating a radiology report completes the parent request.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery } from '../database/db';
import { requireRole } from '../middleware/auth';
import { Validators, splitMeta } from '../middleware/validate';
import { audit } from '../middleware/errors';
import { withMeta } from './patients';

export const reportsRouter = Router();

const COLS = ['findings', 'impression', 'comparison', 'technique', 'pdfData', 'isCritical', 'procedureId', 'procedureName'] as const;

const SELECT = `id, request_id AS "requestId", patient_id AS "patientId",
  radiologist_id AS "radiologistId", radiologist_name AS "radiologistName",
  findings, impression, comparison, technique, pdf_data AS "pdfData",
  is_critical AS "isCritical", procedure_id AS "procedureId",
  procedure_name AS "procedureName", status, meta,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

reportsRouter.get('/patients/:patientId/requests/:requestId/reports', async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(
    `SELECT ${SELECT} FROM reports WHERE request_id = $1 AND patient_id = $2 ORDER BY created_at`, [req.params.requestId, req.params.patientId]);
  res.json(rows.map(withMeta));
});

reportsRouter.get('/patients/:patientId/requests/:requestId/reports/:reportId', async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(`SELECT ${SELECT} FROM reports WHERE id = $1`, [req.params.reportId]);
  if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
  res.json(withMeta(rows[0]));
});

reportsRouter.post('/patients/:patientId/requests/:requestId/reports',
  requireRole('radiologist'), Validators.reportCreate, async (req: Request, res: Response) => {
    const parent = await dbQuery<any>('SELECT id FROM imaging_requests WHERE id = $1 AND patient_id = $2',
      [req.params.requestId, req.params.patientId]);
    if (!parent[0]) return res.status(404).json({ error: 'Request not found' });
    const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
    const id = 'rep_' + crypto.randomBytes(5).toString('hex');
    const rows = await dbQuery<any>(
      `INSERT INTO reports (id, request_id, patient_id, radiologist_id, radiologist_name, findings, impression, comparison, technique, pdf_data, is_critical, procedure_id, procedure_name, status, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Finalized',$14) RETURNING ${SELECT}`,
      [id, req.params.requestId, req.params.patientId, req.user!.id,
       (req.user as any).displayName || req.user!.email,
       cols.findings, cols.impression, cols.comparison || null, cols.technique || null,
       cols.pdfData || null, !!cols.isCritical, cols.procedureId || null, cols.procedureName || null,
       JSON.stringify(meta)]
    );
    await dbQuery(
      `UPDATE imaging_requests SET status = 'Completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [req.params.requestId]);
    await audit(req, 'REPORT_FINALIZE', `Finalized report ${id}${cols.isCritical ? ' (CRITICAL)' : ''}`, id);
    res.status(201).json(withMeta(rows[0]));
  });

reportsRouter.patch('/patients/:patientId/requests/:requestId/reports/:reportId',
  requireRole('radiologist'), async (req: Request, res: Response) => {
    const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
    const allowed: Record<string, string> = {
      findings: 'findings', impression: 'impression', comparison: 'comparison',
      technique: 'technique', pdfData: 'pdf_data', isCritical: 'is_critical',
    };
    const sets: string[] = []; const vals: any[] = [];
    for (const [k, col] of Object.entries(allowed)) {
      if ((cols as any)[k] !== undefined) { vals.push(k === 'isCritical' ? !!(cols as any)[k] : (cols as any)[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (Object.keys(meta).length) { vals.push(JSON.stringify(meta)); sets.push(`meta = meta || $${vals.length}::jsonb`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update (addendum: findings/impression/...)' });
    vals.push(req.params.reportId);
    const rows = await dbQuery<any>(
      `UPDATE reports SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${SELECT}`, vals);
    if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
    await audit(req, 'REPORT_AMEND', `Amended report ${req.params.reportId}`, req.params.reportId);
    res.json(withMeta(rows[0]));
  });

// ---- Ultrasound worksheets (sonographer) ----
reportsRouter.post('/patients/:patientId/requests/:requestId/ultrasound-reports',
  requireRole('sonographer'), async (req: Request, res: Response) => {
    const b = req.body || {};
    if (!b.findings || !b.clinicalImpression)
      return res.status(400).json({ error: 'findings and clinicalImpression required' });
    const id = 'usr_' + crypto.randomBytes(5).toString('hex');
    const rows = await dbQuery<any>(
      `INSERT INTO ultrasound_reports (id, request_id, patient_id, sonographer_id, sonographer_name, findings, measurements, clinical_impression)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, request_id AS "requestId", patient_id AS "patientId",
         sonographer_id AS "sonographerId", sonographer_name AS "sonographerName",
         findings, measurements, clinical_impression AS "clinicalImpression", saved_at AS "savedAt"`,
      [id, req.params.requestId, req.params.patientId, req.user!.id,
       (req.user as any).displayName || req.user!.email,
       JSON.stringify(b.findings), JSON.stringify(b.measurements || {}), b.clinicalImpression]
    );
    await audit(req, 'ULTRASOUND_SAVE', `Saved worksheet ${id}`, id);
    res.status(201).json(rows[0]);
  });

reportsRouter.get('/patients/:patientId/requests/:requestId/ultrasound-reports', async (req: Request, res: Response) => {
  res.json(await dbQuery(
    `SELECT id, request_id AS "requestId", patient_id AS "patientId",
       sonographer_id AS "sonographerId", sonographer_name AS "sonographerName",
       findings, measurements, clinical_impression AS "clinicalImpression", saved_at AS "savedAt"
     FROM ultrasound_reports WHERE request_id = $1 AND patient_id = $2 ORDER BY saved_at`,
    [req.params.requestId, req.params.patientId]));
});
