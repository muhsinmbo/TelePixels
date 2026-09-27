import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { backendRouter } from './routes/index';
import { assertDbConnected } from './database/db';
import { notFound, errorHandler } from './middleware/errors';

export const app = express();
const PORT = Number(process.env.PORT || 4500);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, _res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') console.log(`[api] ${req.method} ${req.path}`);
  next();
});

// Local-disk uploads served here (R2/S3 later serves these URLs instead)
const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(path.resolve(uploadDir), {
  setHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes'); // Cornerstone byte-range streaming
  },
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'telepixels-backend', timestamp: new Date().toISOString() });
});

app.use('/api', backendRouter);
app.use(notFound);
app.use(errorHandler);

process.on('unhandledRejection', (reason: any) => {
  console.error('[api] unhandled rejection:', reason?.message || reason);
});

if (process.env.NODE_ENV !== 'test' && !process.env.AIS_EMBEDDED) {
  assertDbConnected().then(
    () => app.listen(PORT, '0.0.0.0', () => console.log(`TelePixels Backend (Postgres) on http://localhost:${PORT}`)),
    (err: any) => { console.error('[db] cannot start without Postgres:', err.message); process.exit(1); }
  );
}
