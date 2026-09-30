/**
 * Public patient portal: MRN + access code only. Rate-limited, minimal data.
 */
import { Router, Request, Response } from 'express';
import { dbQuery } from '../database/db.js';
import { portalLimiter } from '../middleware/rateLimit.js';
import { isS3, s3ReadUrl, s3DownloadUrl } from '../storage/s3.js';
import { withMeta } from './patients.js';

export const portalRouter = Router();

portalRouter.post('/portal/verify', portalLimiter, async (req: Request, res: Response) => {
  const { mrn, accessCode } = req.body || {};
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : null;
  if (!mrn || !accessCode) return res.status(400).json({ error: 'MRN and access code required' });

  const patients = await dbQuery<any>(
    `SELECT id, name, age, gender, mrn, facility_id AS "facilityId" FROM patients
     WHERE (upper(mrn) = upper($1) OR upper(id) = upper($1)) AND upper(access_code) = upper($2)`, [mrn, accessCode]);
  const patient = patients[0];
  if (!patient) return res.status(401).json({ error: 'Invalid MRN or access code' });

  const requests = await dbQuery<any>(
    `SELECT id, patient_id AS "patientId", facility_id AS "facilityId", modalities, procedures,
       clinical_info AS "clinicalInfo", radiographer_history AS "radiographerHistory", status, priority,
       needs_report AS "needsReport", study_description AS "studyDescription", meta,
       created_at AS "createdAt", uploaded_at AS "uploadedAt", completed_at AS "completedAt"
     FROM imaging_requests WHERE patient_id = $1 AND ($2::text IS NULL OR id = $2)
     ORDER BY created_at DESC`, [patient.id, requestId]);
  if (!requests.length) return res.status(401).json({ error: 'Invalid MRN or access code' });

  const studies: Record<string, any[]> = {};
  const reports: Record<string, any[]> = {};
  for (const r of requests) {
    const images = await dbQuery<any>(
      `SELECT id, name, url, storage_path AS "storagePath", procedure_id AS "procedureId",
        procedure_name AS "procedureName", dicom_header AS "dicomHeader", uploaded_at AS "uploadedAt"
       FROM study_images WHERE request_id = $1 AND patient_id = $2 ORDER BY uploaded_at`, [r.id, patient.id]);
    if (isS3) {
      await Promise.all(images.map(async (image) => {
        image.url = await s3ReadUrl(image.storagePath);
        image.downloadUrl = await s3DownloadUrl(image.storagePath, image.name);
      }));
    }
    studies[r.id] = images;
    const reportRows = await dbQuery<any>(
      `SELECT id, request_id AS "requestId", patient_id AS "patientId",
        radiologist_id AS "radiologistId", radiologist_name AS "radiologistName",
        findings, impression, comparison, technique, pdf_data AS "pdfData",
        is_critical AS "isCritical", procedure_id AS "procedureId",
        procedure_name AS "procedureName", status, meta,
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM reports WHERE request_id = $1 AND patient_id = $2 ORDER BY created_at`, [r.id, patient.id]);
    reports[r.id] = reportRows.map(withMeta);
  }
  res.json({ patient, requests: requests.map(withMeta), studies, reports });
});
