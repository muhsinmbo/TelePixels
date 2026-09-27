/**
 * STANDARD BUILD — real Postgres only (Neon free tier recommended).
 * No memory fallback in request paths. Fails fast when DATABASE_URL is
 * missing or unreachable so misconfig never silently serves mock data.
 *
 * Pool is created lazily: server.ts loads backend/.env AFTER imports are
 * hoisted, so reading env at module load would see nothing. First query
 * (or assertDbConnected) initializes the pool.
 *
 * Neon URLs look like:
 *   postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
 */
import { Pool } from 'pg';

let pool: Pool | null = null;

function ensurePool(): Pool {
  if (pool) return pool;
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    console.error(
      '[db] FATAL: DATABASE_URL is not set.\n' +
      '[db] Get a free one at https://neon.tech (Postgres, no card), then put it in backend/.env.\n' +
      '[db] See backend/README.md "Neon setup (5 min)".'
    );
    throw new Error('DATABASE_URL is not set');
  }
  const isNeon = connectionString.includes('neon.tech');
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Neon requires SSL; plain local Postgres does not
    ssl: isNeon ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err) => {
    console.error('[db] pool error:', err.message);
  });
  return pool;
}

export async function dbQuery<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await ensurePool().query(text, params);
  return res.rows as T[];
}

/** Boot check: verify we can reach Postgres before accepting traffic. */
export async function assertDbConnected(): Promise<void> {
  await ensurePool().query('SELECT 1');
  console.log('[db] connected: postgres');
}
