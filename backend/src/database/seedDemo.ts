/**
 * Demo seed for click-through + hackathon demo. Idempotent: re-runs skip
 * existing demo rows (matched by email / fixed IDs). All demo rows carry
 * meta.demo = true so `npm run db:wipe:demo` removes exactly these.
 *
 * Staff password: Demo123! (change any time via PATCH /users/:uid).
 * Env overrides: DEMO_PASSWORD.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = (process.env.DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('[seed:demo] FATAL: DATABASE_URL not set.');
  process.exit(1);
}
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

const FACILITY = 'default-facility';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo123!';
const DEMO_META = JSON.stringify({ demo: true });

const STAFF = [
  { id: 'demo-radiologist', email: 'radiologist@kingsimaging.org', name: 'Dr. Demo Radiologist', role: 'radiologist' },
  { id: 'demo-sonographer', email: 'sonographer@kingsimaging.org', name: 'Demo Sonographer', role: 'sonographer' },
  { id: 'demo-radiographer', email: 'radiographer@kingsimaging.org', name: 'Demo Radiographer', role: 'radiographer' },
  { id: 'demo-receptionist', email: 'receptionist@kingsimaging.org', name: 'Demo Receptionist', role: 'receptionist' },
];

interface DemoPatient {
  id: string; name: string; age: number; gender: string; mrn: string; accessCode: string;
}
const PATIENTS: DemoPatient[] = [
  { id: 'KP-DEMO01', name: 'Amina Yusuf', age: 32, gender: 'Female', mrn: 'DEMO-0001', accessCode: 'AMINA1' },
  { id: 'KP-DEMO02', name: 'Kwame Mensah', age: 55, gender: 'Male', mrn: 'DEMO-0002', accessCode: 'KWAME2' },
  { id: 'KP-DEMO03', name: 'Efua Owusu', age: 28, gender: 'Female', mrn: 'DEMO-0003', accessCode: 'EFUA03' },
  { id: 'KP-DEMO04', name: 'Yaw Boateng', age: 40, gender: 'Male', mrn: 'DEMO-0004', accessCode: 'YAW004' },
];

interface DemoRequest {
  id: string; patientId: string; modalities: string[]; procedures: any[];
  clinicalInfo: string; priority: string; status: 'Pending';
}
const REQUESTS: DemoRequest[] = [
  {
    id: 'req_demo_pelvic', patientId: 'KP-DEMO01',
    modalities: ['Ultrasound'], procedures: [{ name: 'Pelvic Ultrasound', needsReport: true }],
    clinicalInfo: 'Lower abdominal pain', priority: 'routine', status: 'Pending',
  },
  {
    id: 'req_demo_chest', patientId: 'KP-DEMO02',
    modalities: ['X-Ray'], procedures: [{ name: 'Chest (Thorax)', needsReport: true }],
    clinicalInfo: 'Persistent cough, fever', priority: 'urgent', status: 'Pending',
  },
  {
    id: 'req_demo_ob', patientId: 'KP-DEMO03',
    modalities: ['Ultrasound'], procedures: [{ name: 'Obstetric Ultrasound', needsReport: false }],
    clinicalInfo: 'Routine antenatal scan', priority: 'routine', status: 'Pending',
  },
  {
    id: 'req_demo_old', patientId: 'KP-DEMO04',
    modalities: ['Ultrasound'], procedures: [{ name: 'Abdominal Ultrasound', needsReport: true }],
    clinicalInfo: 'Right upper quadrant pain', priority: 'routine', status: 'Pending',
  },
  {
    id: 'req_demo_new', patientId: 'KP-DEMO04',
    modalities: ['X-Ray'], procedures: [{ name: 'Chest (Thorax)', needsReport: true }],
    clinicalInfo: 'Pre-employment medicals', priority: 'routine', status: 'Pending',
  },
];

const OLD_REPORT = {
  id: 'rep_demo_old', requestId: 'req_demo_old', patientId: 'KP-DEMO04',
  findings: 'The liver is normal in size and echogenicity. No focal lesion. Gallbladder thin-walled with no stones. Common bile duct not dilated. Both kidneys normal in size and echogenicity with no hydronephrosis.',
  impression: 'Normal abdominal ultrasound.',
};

async function main() {
  // Staff (skip existing; never touch existing passwords)
  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const s of STAFF) {
    const exists = await pool.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [s.email]);
    if (exists.rows[0]) { console.log(`[seed:demo] staff exists: ${s.email}`); continue; }
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, status, facility_id, meta)
       VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`,
      [s.id, s.email.toLowerCase(), hash, s.name, s.role, FACILITY, DEMO_META]
    );
    console.log(`[seed:demo] staff created: ${s.email} (${s.role})`);
  }

  // Patients (skip existing IDs)
  for (const p of PATIENTS) {
    const exists = await pool.query('SELECT 1 FROM patients WHERE id = $1', [p.id]);
    if (exists.rows[0]) { console.log(`[seed:demo] patient exists: ${p.id}`); continue; }
    await pool.query(
      `INSERT INTO patients (id, name, age, gender, mrn, access_code, facility_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.id, p.name, p.age, p.gender, p.mrn, p.accessCode, FACILITY, DEMO_META]
    );
    console.log(`[seed:demo] patient created: ${p.id} (${p.name})`);
  }

  // Requests (skip existing IDs; force back to Pending for a clean demo slate)
  for (const r of REQUESTS) {
    const exists = await pool.query('SELECT 1 FROM imaging_requests WHERE id = $1', [r.id]);
    if (exists.rows[0]) {
      await pool.query(
        `UPDATE imaging_requests SET status = 'Pending', uploaded_at = NULL, completed_at = NULL,
           meta = meta || $2::jsonb WHERE id = $1`,
        [r.id, DEMO_META]
      );
      console.log(`[seed:demo] request reset to Pending: ${r.id}`);
      continue;
    }
    await pool.query(
      `INSERT INTO imaging_requests (id, patient_id, facility_id, modalities, procedures, clinical_info, priority, status, needs_report, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending',TRUE,$8)`,
      [r.id, r.patientId, FACILITY, JSON.stringify(r.modalities), JSON.stringify(r.procedures),
       r.clinicalInfo, r.priority, DEMO_META]
    );
    console.log(`[seed:demo] request created: ${r.id}`);
  }

  // Completed history case: finalize the old Yaw Boateng study with a demo report
  const repExists = await pool.query('SELECT 1 FROM reports WHERE id = $1', [OLD_REPORT.id]);
  if (!repExists.rows[0]) {
    await pool.query(
      `INSERT INTO reports (id, request_id, patient_id, radiologist_id, radiologist_name, findings, impression, status, meta)
       VALUES ($1,$2,$3,'demo-radiologist','Dr. Demo Radiologist',$4,$5,'Finalized',$6)`,
      [OLD_REPORT.id, OLD_REPORT.requestId, OLD_REPORT.patientId, OLD_REPORT.findings, OLD_REPORT.impression, DEMO_META]
    );
    await pool.query(
      `UPDATE imaging_requests SET status = 'Completed', completed_at = NOW(), uploaded_at = COALESCE(uploaded_at, NOW())
       WHERE id = $1`, [OLD_REPORT.requestId]
    );
    console.log('[seed:demo] history report finalized: rep_demo_old');
  } else {
    console.log('[seed:demo] history report exists: rep_demo_old');
  }

  console.log('[seed:demo] DONE — staff password for all demo accounts: ' + PASSWORD);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed:demo] FAILED:', err.message);
  await pool.end();
  process.exit(1);
});
