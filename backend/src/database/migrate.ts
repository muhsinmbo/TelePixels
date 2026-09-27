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
  await pool.end();
}

main().catch(async (err) => {
  console.error('[migrate] FAILED:', err.message);
  await pool.end();
  process.exit(1);
});
