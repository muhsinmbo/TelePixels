/**
 * Machine-readable API catalogue (P2). Hand-curated; update when routes change.
 * Public: safe for frontend codegen and onboarding without credentials.
 */
import { Router, Request, Response } from 'express';

export const docsRouter = Router();

const ENDPOINTS = [
  { method: 'GET', path: '/health', auth: false, desc: 'Liveness probe' },
  { method: 'POST', path: '/api/auth/login', auth: false, desc: 'Email+password → { token (15m), refreshToken (30d), user } (bcrypt, rate-limited)' },
  { method: 'POST', path: '/api/auth/refresh', auth: false, desc: 'Rotate pair; reuse of dead token locks the chain' },
  { method: 'GET', path: '/api/auth/me', auth: true, desc: 'Current user profile' },
  { method: 'POST', path: '/api/auth/revoke', auth: true, desc: 'Revoke one session ({refreshToken}) or all ({all:true})' },
  { method: 'POST', path: '/api/auth/logout', auth: true, desc: 'Revokes the session refresh token; client discards JWT' },
  { method: 'GET', path: '/api/users', auth: 'facilityadmin', desc: 'Staff list, facility-scoped (?limit=&offset=)' },
  { method: 'POST', path: '/api/users', auth: 'facilityadmin', desc: 'Provision staff (bcrypt password)' },
  { method: 'GET', path: '/api/users/:uid', auth: 'facilityadmin', desc: 'Single staff profile' },
  { method: 'PATCH', path: '/api/users/:uid', auth: true, desc: 'Update profile; roles need superadmin, password min 8 chars' },
  { method: 'DELETE', path: '/api/users/:uid', auth: 'superadmin', desc: 'Soft-deactivate (status=inactive)' },
  { method: 'GET', path: '/api/patients', auth: true, desc: 'Patient list (?facilityId=&limit=&offset=)' },
  { method: 'GET', path: '/api/patients/:id', auth: true, desc: 'Demographics incl. meta extras' },
  { method: 'POST', path: '/api/patients', auth: true, desc: 'Intake; honors client IDs, MRN unique' },
  { method: 'PATCH', path: '/api/patients/:id', auth: true, desc: 'Update; mrn/createdAt immutable' },
  { method: 'DELETE', path: '/api/patients/:id', auth: 'superadmin', desc: 'Cascades requests/images/reports' },
  { method: 'GET', path: '/api/requests', auth: true, desc: 'Worklists (?facilityId=&status=&patientId=&limit=&offset=)' },
  { method: 'GET', path: '/api/patients/:pId/requests/:rId', auth: true, desc: 'Single request' },
  { method: 'POST', path: '/api/patients/:pId/requests', auth: true, desc: 'New request; patient must exist in facility' },
  { method: 'PATCH', path: '/api/patients/:pId/requests/:rId', auth: true, desc: 'State machine enforced; Completed needs a report (or needsReport=false)' },
  { method: 'GET', path: '/api/patients/:pId/requests/:rId/images', auth: true, desc: 'Study images' },
  { method: 'POST', path: '/api/patients/:pId/requests/:rId/images', auth: true, desc: 'Image record; flips request to Images Uploaded' },
  { method: 'DELETE', path: '/api/patients/:pId/requests/:rId/images/:imageId', auth: 'uploader roles', desc: 'Remove image record' },
  { method: 'POST', path: '/api/storage/upload', auth: true, desc: 'Multipart DICOM/image/PDF → { publicUrl, storagePath }' },
  { method: 'GET', path: '/api/patients/:pId/requests/:rId/reports', auth: true, desc: 'Finalized reports' },
  { method: 'POST', path: '/api/patients/:pId/requests/:rId/reports', auth: 'radiologist', desc: 'Finalize; completes the request' },
  { method: 'PATCH', path: '/api/patients/:pId/requests/:rId/reports/:reportId', auth: 'radiologist', desc: 'Addendum' },
  { method: 'GET/POST', path: '/api/patients/:pId/requests/:rId/ultrasound-reports', auth: true, desc: 'Sonographer worksheets (writes: sonographer)' },
  { method: 'PATCH', path: '/api/patients/:pId/requests/:rId/ultrasound-reports/:id', auth: 'sonographer', desc: 'Amend worksheet' },
  { method: 'GET', path: '/api/facilities/:facId/pricing', auth: true, desc: 'Pricing catalog' },
  { method: 'PUT', path: '/api/facilities/:facId/pricing/:partName', auth: 'facilityadmin', desc: 'Propose price; {approve:true} needs superadmin' },
  { method: 'GET/PATCH', path: '/api/settings/global', auth: true, desc: 'Global settings (GET is public pre-login theming)' },
  { method: 'GET', path: '/api/logs', auth: 'superadmin', desc: 'Audit trail (?limit=&offset=)' },
  { method: 'POST', path: '/api/logs', auth: true, desc: 'Append log (server owns identity+timestamp)' },
  { method: 'POST', path: '/api/portal/verify', auth: false, desc: 'Public MRN+access code → studies+reports (rate-limited)' },
  { method: 'GET', path: '/api/ai/context', auth: true, desc: 'Controlled study context (?patientId=&requestId=)' },
  { method: 'GET', path: '/api/ai/templates', auth: true, desc: 'Report structure (?modality=&examination=&sex=)' },
  { method: 'GET', path: '/api/ai/previous-reports', auth: true, desc: 'Supporting history (?patientId=&excludeRequestId=)' },
  { method: 'POST', path: '/api/ai/draft', auth: 'radiologist/sonographer', desc: 'Structure skeleton (503 without GEMINI_API_KEY)' },
  { method: 'POST', path: '/api/ai/polish', auth: 'radiologist/sonographer', desc: 'Findings+Impression from clinician notes' },
  { method: 'GET', path: '/api/docs', auth: false, desc: 'This catalogue' },
];

docsRouter.get('/docs', (_req: Request, res: Response) => {
  res.json({
    name: 'telepixels-backend',
    version: '2.1.0',
    auth: 'Bearer JWT (15m) + rotating refresh tokens (30d). Public routes: POST /auth/login, POST /auth/refresh, POST /portal/verify, GET /settings/global, GET /docs.',
    pagination: 'List endpoints accept ?limit= (default 200, max 500) &offset= (default 0).',
    errors: '{ error: string } with HTTP status codes.',
    endpoints: ENDPOINTS,
  });
});
