/**
 * Study images metadata. Binary upload lives in storage.ts; this stores the record
 * and flips the parent request to 'Images Uploaded'.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery } from '../database/db';
import { Validators, splitMeta } from '../middleware/validate';
import { audit } from '../middleware/errors';
import { withMeta } from './patients';

export const imagesRouter = Router();

const COLS = ['name', 'url', 'storagePath', 'procedureId', 'procedureName', 'dicomHeader'] as const;

const SELECT = `id, request_id AS "requestId", patient_id AS "patientId", name, url,
  storage_path AS "storagePath", procedure_id AS "procedureId",
  procedure_name AS "procedureName", dicom_header AS "dicomHeader", meta,
  uploaded_at AS "uploadedAt"`;

imagesRouter.get('/patients/:patientId/requests/:requestId/images', async (req: Request, res: Response) => {
  const rows = await dbQuery<any>(
    `SELECT ${SELECT} FROM study_images WHERE request_id = $1 AND patient_id = $2 ORDER BY uploaded_at`, [req.params.requestId, req.params.patientId]);
  res.json(rows.map(withMeta));
});

imagesRouter.post('/patients/:patientId/requests/:requestId/images', Validators.imageCreate, async (req: Request, res: Response) => {
  const parent = await dbQuery<any>('SELECT id FROM imaging_requests WHERE id = $1 AND patient_id = $2',
    [req.params.requestId, req.params.patientId]);
  if (!parent[0]) return res.status(404).json({ error: 'Request not found' });
  const { cols, meta } = splitMeta<any>(req.body, [...COLS]);
  const id = 'img_' + crypto.randomBytes(5).toString('hex');
  const rows = await dbQuery<any>(
    `INSERT INTO study_images (id, request_id, patient_id, name, url, storage_path, procedure_id, procedure_name, dicom_header, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${SELECT}`,
    [id, req.params.requestId, req.params.patientId, cols.name, cols.url, cols.storagePath,
     cols.procedureId || null, cols.procedureName || null,
     cols.dicomHeader ? JSON.stringify(cols.dicomHeader) : null, JSON.stringify(meta)]
  );
  await dbQuery(
    `UPDATE imaging_requests SET status = 'Images Uploaded', uploaded_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [req.params.requestId]);
  await audit(req, 'IMAGE_ADD', `Added image ${id} to ${req.params.requestId}`, id);
  res.status(201).json(withMeta(rows[0]));
});

imagesRouter.delete('/patients/:patientId/requests/:requestId/images/:imageId', async (req: Request, res: Response) => {
  if (!['superadmin', 'facilityadmin', 'radiographer', 'sonographer'].includes(req.user!.role))
    return res.status(403).json({ error: 'Upload roles only' });
  const rows = await dbQuery('DELETE FROM study_images WHERE id = $1 AND request_id = $2 AND patient_id = $3 RETURNING id',
    [req.params.imageId, req.params.requestId, req.params.patientId]);
  if (!rows[0]) return res.status(404).json({ error: 'Image not found' });
  await audit(req, 'IMAGE_DELETE', `Deleted image ${req.params.imageId}`, req.params.imageId);
  res.status(204).send();
});
