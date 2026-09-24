import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { backendRouter } from './routes/index';

export const app = express();
const PORT = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'telepixels-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', backendRouter);

if (process.env.NODE_ENV !== 'test' && !process.env.AIS_EMBEDDED) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TelePixels Backend running on http://localhost:${PORT}`);
  });
}
