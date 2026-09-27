/**
 * Removes exactly what seedDemo created (meta.demo = true + demo staff emails).
 * NEVER touches real rows. Cascades handle images/reports under demo requests.
 * Usage: npm run db:wipe:demo
 */
import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = (process.env.DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('[wipe:demo] FATAL: DATABASE_URL not set.');
  process.exit(1);
}
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

const DEMO_EMAILS = [
  'radiologist@kingsimaging.org', 'sonographer@kingsimaging.org',
  'radiographer@kingsimaging.org', 'receptionist@kingsimaging.org',
];

async function main() {
  const where = `meta->>'demo' = 'true'`;
  const reps = await pool.query(`DELETE FROM reports WHERE ${where}`);
  const imgs = await pool.query(`DELETE FROM study_images WHERE ${where}`);
  const us = await pool.query(`DELETE FROM ultrasound_reports WHERE request_id IN (SELECT id FROM imaging_requests WHERE ${where})`);
  const reqs = await pool.query(`DELETE FROM imaging_requests WHERE ${where}`);
  const pats = await pool.query(`DELETE FROM patients WHERE ${where}`);
  const users = await pool.query(`DELETE FROM users WHERE lower(email) = ANY($1)`, [DEMO_EMAILS.map((e) => e.toLowerCase())]);
  console.log(`[wipe:demo] removed reports=${reps.rowCount} images=${imgs.rowCount} worksheets=${us.rowCount} requests=${reqs.rowCount} patients=${pats.rowCount} users=${users.rowCount}`);
  console.log('[wipe:demo] DONE');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[wipe:demo] FAILED:', err.message);
  await pool.end();
  process.exit(1);
});
