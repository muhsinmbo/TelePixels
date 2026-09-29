/**
 * Uploads. Local disk (./uploads) by default; S3 API (B2/R2/Neon) when
 * STORAGE_DRIVER=s3. Same response shape either way: { publicUrl, storagePath }.
 * With S3, storagePath is the object KEY and publicUrl a fresh presigned link;
 * GET /images re-signs on every read so links never go stale.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { isS3, s3Upload, s3ReadUrl, safeKey } from '../storage/s3.js';
import { ah } from '../middleware/errors.js';

export const storageRouter = Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const maxMB = Number(process.env.MAX_UPLOAD_MB || 50);

const ALLOWED_EXT = /\.dcm$|\.dicom$/i;
const ALLOWED_MIME = /^(image\/(png|jpeg)|application\/pdf)$/;

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_EXT.test(file.originalname)) return cb(null, true);
  if (ALLOWED_MIME.test(file.mimetype)) return cb(null, true);
  cb(new Error('Only .dcm/.dicom, PNG/JPEG images, and PDFs allowed'));
}

const disk = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage: isS3 ? multer.memoryStorage() : disk,
  limits: { fileSize: maxMB * 1024 * 1024 },
  fileFilter,
});

storageRouter.post('/storage/upload', upload.single('file'), ah(async (req: Request, res: Response) => {
  const f = (req as any).file as Express.Multer.File | undefined;
  if (!f) return res.status(400).json({ error: 'file field required' });
  if (isS3) {
    const key = safeKey(f.originalname);
    await s3Upload(key, f.buffer, f.mimetype || 'application/octet-stream');
    const publicUrl = await s3ReadUrl(key);
    return res.json({ publicUrl, storagePath: key });
  }
  return res.json({ publicUrl: `/uploads/${f.filename}`, storagePath: f.filename });
}));
