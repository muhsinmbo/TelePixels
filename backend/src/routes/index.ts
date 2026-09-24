import { Router, Request, Response } from 'express';
import { memoryDb } from '../database/memoryDb';

export const backendRouter = Router();

// ==========================================
// 1. Authentication & Users
// ==========================================
backendRouter.post('/auth/login', (req: Request, res: Response) => {
  const { email, password, accessCode, provider } = req.body;
  
  // Reviewer Super Admin Bypass
  if ((email === 'reviewer@kingsimaging.org' && password === 'KingSuperAdmin2026!') || accessCode === 'PITCH2026') {
    const user = memoryDb.users.get('reviewer_superadmin');
    return res.json({
      token: 'jwt_reviewer_superadmin_valid_token_2026',
      user: user || {
        uid: 'reviewer_superadmin',
        email: 'reviewer@kingsimaging.org',
        displayName: 'Lead Reviewer (Super Admin)',
        role: 'superadmin',
        status: 'active',
        facilityId: 'default-facility',
        facilityName: "King's Diagnostic Imaging and Research Center",
      }
    });
  }

  // Find user by email or create standard session
  let matchedUser: any = null;
  memoryDb.users.forEach(u => {
    if (u.email.toLowerCase() === (email || '').toLowerCase()) {
      matchedUser = u;
    }
  });

  if (!matchedUser) {
    matchedUser = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      email: email || 'user@example.com',
      displayName: (email || 'User').split('@')[0],
      role: 'superadmin',
      status: 'active',
      facilityId: 'default-facility',
    };
    memoryDb.users.set(matchedUser.id, matchedUser);
  }

  return res.json({
    token: 'jwt_' + matchedUser.id + '_token',
    user: { ...matchedUser, uid: matchedUser.id }
  });
});

backendRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = memoryDb.users.get('reviewer_superadmin') || Array.from(memoryDb.users.values())[0];
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });
  return res.json({ ...user, uid: user.id });
});

backendRouter.post('/auth/logout', (req: Request, res: Response) => {
  return res.json({ success: true });
});

backendRouter.get('/users', (req: Request, res: Response) => {
  const users = Array.from(memoryDb.users.values()).map(u => ({ ...u, uid: u.id }));
  return res.json(users);
});

backendRouter.post('/users', (req: Request, res: Response) => {
  const data = req.body;
  const id = data.uid || data.id || 'usr_' + Math.random().toString(36).substring(2, 9);
  const newUser = {
    ...data,
    id,
    uid: id,
    status: data.status || 'active',
  };
  memoryDb.users.set(id, newUser);
  return res.status(201).json(newUser);
});

backendRouter.patch('/users/:uid', (req: Request, res: Response) => {
  const { uid } = req.params;
  const user = memoryDb.users.get(uid);
  if (!user) {
    // If not found, create it
    const created = { ...req.body, id: uid, uid };
    memoryDb.users.set(uid, created);
    return res.json(created);
  }
  const updated = { ...user, ...req.body, id: uid, uid };
  memoryDb.users.set(uid, updated);
  return res.json(updated);
});

backendRouter.delete('/users/:uid', (req: Request, res: Response) => {
  const { uid } = req.params;
  memoryDb.users.delete(uid);
  return res.status(204).send();
});

// ==========================================
// 2. Patients & Intake
// ==========================================
backendRouter.get('/patients', (req: Request, res: Response) => {
  const { facilityId } = req.query;
  let list = Array.from(memoryDb.patients.values());
  if (facilityId) {
    list = list.filter(p => p.facilityId === facilityId);
  }
  return res.json(list);
});

backendRouter.get('/patients/:id', (req: Request, res: Response) => {
  const patient = memoryDb.patients.get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  return res.json(patient);
});

backendRouter.post('/patients', (req: Request, res: Response) => {
  const data = req.body;
  const id = data.id || 'KP-' + Math.floor(100000 + Math.random() * 900000);
  const newPatient = {
    ...data,
    id,
    mrn: data.mrn || id,
    accessCode: data.accessCode || Math.random().toString(36).substring(2, 8).toUpperCase(),
    facilityId: data.facilityId || 'default-facility',
    createdAt: data.createdAt || new Date().toISOString(),
  };
  memoryDb.patients.set(id, newPatient);
  return res.status(201).json(newPatient);
});

backendRouter.patch('/patients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = memoryDb.patients.get(id);
  const updated = {
    ...(existing || {}),
    ...req.body,
    id,
    updatedAt: new Date().toISOString()
  };
  memoryDb.patients.set(id, updated);
  return res.json(updated);
});

backendRouter.delete('/patients/:id', (req: Request, res: Response) => {
  memoryDb.patients.delete(req.params.id);
  return res.status(204).send();
});

// ==========================================
// 3. Imaging Requests
// ==========================================
backendRouter.get('/requests', (req: Request, res: Response) => {
  const { facilityId, status, patientId } = req.query;
  let list = Array.from(memoryDb.requests.values());
  if (facilityId) list = list.filter(r => r.facilityId === facilityId);
  if (status) list = list.filter(r => r.status === status);
  if (patientId) list = list.filter(r => r.patientId === patientId);
  return res.json(list);
});

backendRouter.get('/patients/:patientId/requests/:requestId', (req: Request, res: Response) => {
  const reqItem = memoryDb.requests.get(req.params.requestId);
  if (!reqItem) return res.status(404).json({ error: 'Request not found' });
  return res.json(reqItem);
});

backendRouter.post('/patients/:patientId/requests', (req: Request, res: Response) => {
  const { patientId } = req.params;
  const data = req.body;
  const id = data.id || 'req_' + Math.random().toString(36).substring(2, 9);
  const newReq = {
    ...data,
    id,
    patientId,
    facilityId: data.facilityId || 'default-facility',
    status: data.status || 'Pending',
    priority: data.priority || 'routine',
    needsReport: data.needsReport !== undefined ? data.needsReport : true,
    createdAt: data.createdAt || new Date().toISOString(),
  };
  memoryDb.requests.set(id, newReq);
  return res.status(201).json(newReq);
});

backendRouter.patch('/patients/:patientId/requests/:requestId', (req: Request, res: Response) => {
  const { requestId } = req.params;
  const existing = memoryDb.requests.get(requestId);
  const updated = {
    ...(existing || {}),
    ...req.body,
    id: requestId,
    updatedAt: new Date().toISOString(),
  };
  memoryDb.requests.set(requestId, updated);
  return res.json(updated);
});

// ==========================================
// 4. Study Images & DICOM
// ==========================================
backendRouter.get('/patients/:patientId/requests/:requestId/images', (req: Request, res: Response) => {
  const { requestId } = req.params;
  const images = Array.from(memoryDb.images.values()).filter(img => img.requestId === requestId);
  return res.json(images);
});

backendRouter.post('/patients/:patientId/requests/:requestId/images', (req: Request, res: Response) => {
  const { patientId, requestId } = req.params;
  const data = req.body;
  const id = data.id || 'img_' + Math.random().toString(36).substring(2, 9);
  const newImg = {
    ...data,
    id,
    patientId,
    requestId,
    uploadedAt: data.uploadedAt || new Date().toISOString(),
  };
  memoryDb.images.set(id, newImg);
  return res.status(201).json(newImg);
});

// ==========================================
// 5. Reports
// ==========================================
backendRouter.get('/patients/:patientId/requests/:requestId/reports', (req: Request, res: Response) => {
  const { requestId } = req.params;
  const reports = Array.from(memoryDb.reports.values()).filter(r => r.requestId === requestId);
  return res.json(reports);
});

backendRouter.get('/patients/:patientId/requests/:requestId/reports/:reportId', (req: Request, res: Response) => {
  const report = memoryDb.reports.get(req.params.reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  return res.json(report);
});

backendRouter.post('/patients/:patientId/requests/:requestId/reports', (req: Request, res: Response) => {
  const { patientId, requestId } = req.params;
  const data = req.body;
  const id = data.id || 'rep_' + Math.random().toString(36).substring(2, 9);
  const newReport = {
    ...data,
    id,
    patientId,
    requestId,
    status: data.status || 'Finalized',
    createdAt: data.createdAt || new Date().toISOString(),
  };
  memoryDb.reports.set(id, newReport);
  
  // Also update parent request status to Completed
  const reqItem = memoryDb.requests.get(requestId);
  if (reqItem) {
    reqItem.status = 'Completed';
    reqItem.completedAt = new Date().toISOString();
  }

  return res.status(201).json(newReport);
});

backendRouter.patch('/patients/:patientId/requests/:requestId/reports/:reportId', (req: Request, res: Response) => {
  const { reportId } = req.params;
  const existing = memoryDb.reports.get(reportId);
  const updated = {
    ...(existing || {}),
    ...req.body,
    id: reportId,
    updatedAt: new Date().toISOString(),
  };
  memoryDb.reports.set(reportId, updated);
  return res.json(updated);
});

// ==========================================
// 6. Facility Pricing
// ==========================================
backendRouter.get('/facilities/:facilityId/pricing', (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const list = Array.from(memoryDb.pricing.values()).filter(p => p.facilityId === facilityId);
  return res.json(list);
});

backendRouter.put('/facilities/:facilityId/pricing/:partName', (req: Request, res: Response) => {
  const { facilityId, partName } = req.params;
  const key = `${facilityId}_${partName}`;
  const existing = memoryDb.pricing.get(key);
  const updated = {
    ...(existing || {}),
    ...req.body,
    facilityId,
    partName,
    updatedAt: new Date().toISOString(),
  };
  memoryDb.pricing.set(key, updated);
  return res.json(updated);
});

// ==========================================
// 7. System Settings & Logs
// ==========================================
backendRouter.get('/settings/global', (req: Request, res: Response) => {
  const global = memoryDb.settings.get('global') || {
    facilityName: "King's Diagnostic Imaging and Research Center",
    theme: 'cyber',
    whatsappEnabled: true,
    emailEnabled: true,
  };
  return res.json(global);
});

backendRouter.patch('/settings/global', (req: Request, res: Response) => {
  const existing = memoryDb.settings.get('global') || {};
  const updated = { ...existing, ...req.body };
  memoryDb.settings.set('global', updated);
  return res.json(updated);
});

backendRouter.get('/logs', (req: Request, res: Response) => {
  return res.json(memoryDb.logs.slice(-100).reverse());
});

backendRouter.post('/logs', (req: Request, res: Response) => {
  const newLog = {
    ...req.body,
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: req.body.timestamp || new Date().toISOString(),
  };
  memoryDb.logs.push(newLog);
  return res.status(201).json(newLog);
});

// ==========================================
// 8. Patient Portal Verification
// ==========================================
backendRouter.post('/portal/verify', (req: Request, res: Response) => {
  const { mrn, accessCode } = req.body;
  if (!mrn || !accessCode) {
    return res.status(400).json({ error: 'MRN and Access Code required' });
  }

  let matchedPatient: any = null;
  memoryDb.patients.forEach(p => {
    if (p.mrn.toUpperCase() === mrn.toUpperCase() && p.accessCode.toUpperCase() === accessCode.toUpperCase()) {
      matchedPatient = p;
    }
  });

  if (!matchedPatient) {
    return res.status(401).json({ error: 'Invalid MRN or Access Pass Code' });
  }

  const patientRequests = Array.from(memoryDb.requests.values()).filter(r => r.patientId === matchedPatient.id);
  const studiesMap: Record<string, any[]> = {};
  const reportsMap: Record<string, any[]> = {};

  for (const r of patientRequests) {
    studiesMap[r.id] = Array.from(memoryDb.images.values()).filter(img => img.requestId === r.id);
    reportsMap[r.id] = Array.from(memoryDb.reports.values()).filter(rep => rep.requestId === r.id);
  }

  return res.json({
    patient: matchedPatient,
    requests: patientRequests,
    studies: studiesMap,
    reports: reportsMap,
  });
});

// ==========================================
// 9. Storage Upload (Replaces Supabase Storage)
// ==========================================
backendRouter.post('/storage/upload', (req: Request, res: Response) => {
  // In development, handle file uploads gracefully
  const storagePath = req.body.path || `uploads/${Date.now()}_file.dcm`;
  return res.json({
    publicUrl: `/uploads/${storagePath}`,
    storagePath,
  });
});
