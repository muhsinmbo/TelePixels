/**
 * Controlled AI tools — the ONLY data the model ever sees.
 * These map 1:1 to future MCP tools; the HTTP routes below are thin wrappers.
 * The model never gets DB access, only these shaped outputs.
 */
import { dbQuery } from '../database/db.js';
import { withMeta } from '../routes/patients.js';

export interface StudyContext {
  requestId: string; patientId: string;
  patientAge: number | null; patientSex: string | null;
  modality: string; examination: string; bodyPart: string | null;
  clinicalHistory: string | null; radiographerHistory: string | null;
  priority: string; status: string;
}

/** get_study_context: primary context for the current reporting task. */
export async function getStudyContext(patientId: string, requestId: string, facilityScope: string | null) {
  const reqs = await dbQuery<any>(
    `SELECT id, patient_id, modalities, procedures, clinical_info, radiographer_history,
            status, priority, study_description
     FROM imaging_requests WHERE id = $1 AND patient_id = $2`, [requestId, patientId]);
  const req = reqs[0];
  if (!req) return null;
  const pats = await dbQuery<any>('SELECT id, age, gender, facility_id FROM patients WHERE id = $1', [patientId]);
  const pat = pats[0];
  if (!pat) return null;
  if (facilityScope && pat.facility_id !== facilityScope) {
    const err: any = new Error('Cross-facility access denied');
    err.status = 403;
    throw err;
  }
  const modalities: string[] = req.modalities || [];
  const procedures: any[] = req.procedures || [];
  const firstProc = procedures[0];
  const examination = typeof firstProc === 'string' ? firstProc
    : (firstProc?.name || firstProc?.partName || firstProc?.procedureName || 'General');
  const ctx: StudyContext = {
    requestId: req.id, patientId: pat.id,
    patientAge: pat.age ?? null, patientSex: pat.gender ?? null,
    modality: modalities[0] || 'General', examination,
    bodyPart: req.study_description || examination,
    clinicalHistory: req.clinical_info || null,
    radiographerHistory: req.radiographer_history || null,
    priority: req.priority, status: req.status,
  };
  return ctx;
}

export interface MatchedTemplate {
  id: string; title: string; modality: string; examination: string;
  sections: Array<{ key: string; title: string; placeholder: string }>;
  impressionGuidance: string; matchLevel: 'exact' | 'modality-exam' | 'generic';
}

/** get_reporting_template: correct report structure for modality+exam+sex. */
export async function getReportingTemplate(modality: string, examination: string, sex: string | null) {
  const norm = (s: string) => String(s || '').trim().toLowerCase();
  const m = norm(modality), e = norm(examination);
  const sexNorm = ['female', 'male', 'other'].includes(norm(sex || '')) ? sex : 'Any';
  const rows = await dbQuery<any>(
    `SELECT id, modality, examination, sex, title, sections, impression_guidance AS "impressionGuidance"
     FROM report_templates WHERE is_active ORDER BY modality, examination`);
  const asTemplate = (r: any, level: MatchedTemplate['matchLevel']): MatchedTemplate => ({
    id: r.id, title: r.title, modality: r.modality, examination: r.examination,
    sections: r.sections || [], impressionGuidance: r.impressionGuidance || '', matchLevel: level,
  });
  const exact = rows.find((r: any) => norm(r.modality) === m && norm(r.examination) === e && norm(r.sex) === norm(sexNorm || 'any'));
  if (exact) return asTemplate(exact, 'exact');
  const fallback = rows.find((r: any) => norm(r.modality) === m && norm(r.examination) === e && norm(r.sex) === 'any');
  if (fallback) return asTemplate(fallback, 'modality-exam');
  const generic = rows.find((r: any) => norm(r.modality) === 'any');
  if (generic) return asTemplate(generic, 'generic');
  return null;
}

/** get_relevant_previous_reports: supporting history only — never changes current report type. */
export async function getPreviousReports(patientId: string, excludeRequestId: string, facilityScope: string | null, limit = 5) {
  const pats = await dbQuery<any>('SELECT id, facility_id FROM patients WHERE id = $1', [patientId]);
  if (!pats[0]) return null;
  if (facilityScope && pats[0].facility_id !== facilityScope) {
    const err: any = new Error('Cross-facility access denied');
    err.status = 403;
    throw err;
  }
  const rows = await dbQuery<any>(
    `SELECT r.id, r.request_id AS "requestId", r.findings, r.impression, r.comparison,
            r.radiologist_name AS "radiologistName", r.created_at AS "createdAt",
            q.modalities, q.procedures
     FROM reports r JOIN imaging_requests q ON q.id = r.request_id
     WHERE r.patient_id = $1 AND r.request_id <> $2
     ORDER BY r.created_at DESC LIMIT $3`, [patientId, excludeRequestId, Math.min(limit, 10)]);
  return rows.map(withMeta);
}
