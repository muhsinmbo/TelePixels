/**
 * Local-disk uploads (./uploads). Multer stores; Express serves via /uploads.
 * Swap to R2/S3 later by replacing diskStorage with an S3 client — same response shape.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';

export const storageRouter = Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });
const maxMB = Number(process.env.MAX_UPLOAD_MB || 50);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: maxMB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.dcm$|\.dicom$/i.test(file.originalname)) return cb(null, true);
    if (/^(image\/(png|jpeg)|application\/pdf)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only .dcm/.dicom, PNG/JPEG images, and PDFs allowed'));
  },
});

storageRouter.post('/storage/upload', upload.single('file'), (req: Request, res: Response) => {
  const f = (req as any).file;
  if (!f) return res.status(400).json({ error: 'file field required' });
  res.json({ publicUrl: `/uploads/${f.filename}`, storagePath: f.filename });
});
