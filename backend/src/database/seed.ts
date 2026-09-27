/**
 * STANDARD BUILD — schema migrate + seed.
 * Usage:  npm run db:seed   (runs schema.sql then seeds)
 * Env:    DATABASE_URL (Neon), SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { TEMPLATES } from '../ai/templates';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = (process.env.DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('[seed] FATAL: DATABASE_URL not set. See backend/README.md "Neon setup (5 min)".');
  process.exit(1);
}
const isNeon = connectionString.includes('neon.tech');
const pool = new Pool({
  connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined,
});

const FACILITY_ID = 'default-facility';
const PRICING: Array<[string, number]> = [
  ['Chest (Thorax)', 150], ['Abdomen (KUB)', 180], ['Cervical Spine', 120],
  ['Lumbar Spine', 130], ['Thoracic Spine', 130], ['Pelvis', 140],
  ['Skull (Cranium)', 160], ['Knee Joint', 110], ['Abdominal Ultrasound', 150],
  ['Pelvic Ultrasound', 120], ['Obstetric Ultrasound', 100],
  ['Echocardiography (Adult)', 400], ['ECG (12-Lead)', 80],
];

async function main() {
  // 1. Schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[seed] applying schema.sql ...');
  await pool.query(schema);
  console.log('[seed] schema ok');

  // 2. Facility
  await pool.query(
    `INSERT INTO facilities (id, name, phone, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, address = EXCLUDED.address`,
    [FACILITY_ID, "King's Diagnostic Imaging and Research Center", '+233 50 025 2793',
     'Saint Charles Road (Before Attaesibi Hotel), Tamale, Northern Region, Ghana']
  );

  // 3. Superadmin (real bcrypt password — NO bypass logins anymore)
  const email = (process.env.SEED_SUPERADMIN_EMAIL || 'admin@kingsimaging.org').toLowerCase();
  const plain = process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe123!';
  if (!process.env.SEED_SUPERADMIN_PASSWORD) {
    console.warn('[seed] WARNING: SEED_SUPERADMIN_PASSWORD not set — using temp "ChangeMe123!". Change it after first login.');
  }
  const password_hash = await bcrypt.hash(plain, 12);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, role, status, facility_id)
     VALUES ('superadmin-01', $1, $2, 'System Administrator', 'superadmin', 'active', $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active'`,
    [email, password_hash, FACILITY_ID]
  );
  console.log(`[seed] superadmin ok: ${email}`);

  // 4. Pricing
  for (const [partName, price] of PRICING) {
    await pool.query(
      `INSERT INTO facility_pricing (facility_id, part_name, price, currency, status)
       VALUES ($1, $2, $3, 'GHS', 'approved')
       ON CONFLICT (facility_id, part_name) DO NOTHING`,
      [FACILITY_ID, partName, price]
    );
  }
  console.log('[seed] pricing ok');

  // 5. AI reporting templates
  for (const t of TEMPLATES) {
    await pool.query(
      `INSERT INTO report_templates (id, modality, examination, sex, title, sections, impression_guidance)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, sections = EXCLUDED.sections,
         impression_guidance = EXCLUDED.impression_guidance, is_active = TRUE`,
      [t.id, t.modality, t.examination, t.sex, t.title, JSON.stringify(t.sections), t.impressionGuidance]
    );
  }
  console.log('[seed] templates ok');

  // 6. Global settings
  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ('global', $1)
     ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ facilityName: "King's Diagnostic Imaging and Research Center", theme: 'cyber', whatsappEnabled: true, emailEnabled: true })]
  );
  console.log('[seed] settings ok');
  console.log('[seed] DONE');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed] FAILED:', err.message);
  await pool.end();
  process.exit(1);
});
