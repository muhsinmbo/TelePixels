/**
 * Public patient portal: MRN + access code only. Rate-limited, minimal data.
 */
import { Router, Request, Response } from 'express';
import { dbQuery } from '../database/db';
import { portalLimiter } from '../middleware/rateLimit';

export const portalRouter = Router();

portalRouter.post('/portal/verify', portalLimiter, async (req: Request, res: Response) => {
  const { mrn, accessCode } = req.body || {};
  if (!mrn || !accessCode) return res.status(400).json({ error: 'MRN and access code required' });

  const patients = await dbQuery<any>(
    `SELECT id, name, age, gender, facility_id FROM patients
     WHERE upper(mrn) = upper($1) AND upper(access_code) = upper($2)`, [mrn, accessCode]);
  const patient = patients[0];
  if (!patient) return res.status(401).json({ error: 'Invalid MRN or access code' });

  const requests = await dbQuery<any>(
    `SELECT id, patient_id AS "patientId", modalities, procedures, status, created_at AS "createdAt"
     FROM imaging_requests WHERE patient_id = $1 ORDER BY created_at DESC`, [patient.id]);
  const studies: Record<string, any[]> = {};
  const reports: Record<string, any[]> = {};
  for (const r of requests) {
    studies[r.id] = await dbQuery(
      `SELECT id, name, url, procedure_name AS "procedureName" FROM study_images WHERE request_id = $1`, [r.id]);
    reports[r.id] = await dbQuery(
      `SELECT id, findings, impression, radiologist_name AS "radiologistName", created_at AS "createdAt"
       FROM reports WHERE request_id = $1`, [r.id]);
  }
  res.json({ patient, requests, studies, reports });
});
