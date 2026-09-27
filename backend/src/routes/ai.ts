/**
 * Context-aware AI-assisted reporting (human-in-the-loop).
 * The model only ever sees what these tools return — never the database.
 * Every AI call is audit-logged. Model routes 503 cleanly without a key.
 */
import { Router, Request, Response } from 'express';
import { facilityScope, requireRole } from '../middleware/auth';
import { audit, ah } from '../middleware/errors';
import { getStudyContext, getReportingTemplate, getPreviousReports } from '../ai/tools';
import { aiEnabled, draftSkeleton, polishFindings } from '../ai/gemini';

export const aiRouter = Router();

// GET /api/ai/context?patientId=&requestId=  → get_study_context
aiRouter.get('/ai/context', ah(async (req: Request, res: Response) => {
  const { patientId, requestId } = req.query as Record<string, string>;
  if (!patientId || !requestId) return res.status(400).json({ error: 'patientId and requestId required' });
  const ctx = await getStudyContext(patientId, requestId, facilityScope(req));
  if (!ctx) return res.status(404).json({ error: 'Study not found' });
  res.json(ctx);
}));

// GET /api/ai/templates?modality=&examination=&sex=  → get_reporting_template
aiRouter.get('/ai/templates', ah(async (req: Request, res: Response) => {
  const { modality, examination, sex } = req.query as Record<string, string>;
  if (!modality || !examination) return res.status(400).json({ error: 'modality and examination required' });
  const tpl = await getReportingTemplate(modality, examination, sex || null);
  if (!tpl) return res.status(404).json({ error: 'No template available' });
  res.json(tpl);
}));

// GET /api/ai/previous-reports?patientId=&excludeRequestId=&limit=  → supporting history
aiRouter.get('/ai/previous-reports', ah(async (req: Request, res: Response) => {
  const { patientId, excludeRequestId, limit } = req.query as Record<string, string>;
  if (!patientId || !excludeRequestId) return res.status(400).json({ error: 'patientId and excludeRequestId required' });
  const rows = await getPreviousReports(patientId, excludeRequestId, facilityScope(req), Number(limit) || 5);
  if (!rows) return res.status(404).json({ error: 'Patient not found' });
  res.json(rows);
}));

// POST /api/ai/draft { patientId, requestId } → structure skeleton (no invented findings)
aiRouter.post('/ai/draft', requireRole('radiologist', 'sonographer'), ah(async (req: Request, res: Response) => {
  const { patientId, requestId } = req.body || {};
  if (!patientId || !requestId) return res.status(400).json({ error: 'patientId and requestId required' });
  const ctx = await getStudyContext(patientId, requestId, facilityScope(req));
  if (!ctx) return res.status(404).json({ error: 'Study not found' });
  const tpl = await getReportingTemplate(ctx.modality, ctx.examination, ctx.patientSex);
  if (!tpl) return res.status(404).json({ error: 'No template available' });
  if (!aiEnabled()) {
    // Offline-friendly: return the structure so the UI flow is fully testable
    await audit(req, 'AI_DRAFT_TEMPLATE', `Template draft for ${requestId} (model disabled)`, requestId);
    return res.json({ template: tpl, context: ctx, skeleton: null, modelDisabled: true });
  }
  const skeleton = await draftSkeleton(ctx, tpl);
  await audit(req, 'AI_DRAFT', `AI skeleton for ${requestId} (${tpl.id})`, requestId);
  res.json({ template: tpl, context: ctx, skeleton, modelDisabled: false });
}));

// POST /api/ai/polish { patientId, requestId, findings, includePrevious? } → polished report
aiRouter.post('/ai/polish', requireRole('radiologist', 'sonographer'), ah(async (req: Request, res: Response) => {
  const { patientId, requestId, findings, includePrevious } = req.body || {};
  if (!patientId || !requestId || !findings) {
    return res.status(400).json({ error: 'patientId, requestId and findings required' });
  }
  const ctx = await getStudyContext(patientId, requestId, facilityScope(req));
  if (!ctx) return res.status(404).json({ error: 'Study not found' });
  const tpl = await getReportingTemplate(ctx.modality, ctx.examination, ctx.patientSex);
  let previousSummaries: string[] = [];
  if (includePrevious) {
    const prev = await getPreviousReports(patientId, requestId, facilityScope(req), 3);
    previousSummaries = (prev || []).map((p: any) => `Impression: ${p.impression}`);
  }
  const polished = await polishFindings(ctx, tpl?.title || 'General Imaging Report', findings, previousSummaries);
  await audit(req, 'AI_POLISH', `AI polish for ${requestId}`, requestId);
  res.json({ polished, templateId: tpl?.id || null });
}));
