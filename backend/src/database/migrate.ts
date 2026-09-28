/**
 * STANDARD BUILD — apply schema.sql only (no seed data).
 * Usage: npm run db:migrate
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = (process.env.DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('[migrate] FATAL: DATABASE_URL not set.');
  process.exit(1);
}
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('[migrate] schema applied');
  // Post-launch enum values: single-statement queries (ADD VALUE cannot run
  // inside a multi-statement transaction block).
  await pool.query(`ALTER TYPE request_status_enum ADD VALUE IF NOT EXISTS 'Partially Reported'`)
    .catch((e) => {
      if (e.code === '55000' || /already exists/i.test(e.message)) {
        console.log('[migrate] enum value already present');
        return;
      }
      throw e;
    });
  console.log('[migrate] enums ok');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[migrate] FAILED:', err.message);
  await pool.end();
  process.exit(1);
});
