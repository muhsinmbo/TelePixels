/**
 * STANDARD BUILD — live Firestore-compatible adapter over the real REST API.
 * Same function signatures as the old mock (compat.ts) so pages migrate by
 * changing ONE import. Every read/write below hits Postgres — except:
 *  - report drafts (isDraft !== false): local working copies in localStorage,
 *    promoted to POST /reports when finalized;
 *  - settings/pricing toggle: local UI preference.
 *
 * Realtime onSnapshot = instant refetch on local mutations + 12s poll
 * (true websocket sync is a later upgrade, not a hackathon blocker).
 */
import { api, eventBus, getAuthToken } from './apiClient';

// ---------------------------------------------------------------------------
// Refs (with parent chains so `doc.ref.parent.parent.id` keeps working)
// ---------------------------------------------------------------------------
export interface CollectionRef { type: 'collection'; path: string; isGroup?: boolean; parent: DocRef | null }
export interface DocRef { type: 'doc'; path: string; id: string; parent: CollectionRef | null }
export interface QueryFilter { field: string; op: string; value: any }
export interface QueryDef { type: 'query'; target: CollectionRef; filters: QueryFilter[]; orderBys: Array<{ field: string; direction: 'asc' | 'desc' }>; limitCount?: number }

function segs(path: string): string[] { return path.split('/').filter(Boolean); }

function collRef(path: string, isGroup = false): CollectionRef {
  const s = segs(path);
  const parent: DocRef | null = !isGroup && s.length >= 2
    ? { type: 'doc', path: s.slice(0, -1).join('/'), id: s[s.length - 2], parent: null }
    : null;
  if (parent) {
    const ps = segs(parent.path);
    parent.parent = ps.length >= 2
      ? { type: 'collection', path: ps.slice(0, -1).join('/'), parent: null }
      : null;
  }
  return { type: 'collection', path: s.join('/'), isGroup, parent };
}

function docRef(path: string): DocRef {
  const s = segs(path);
  const full = s.length % 2 === 0 ? s : [...s, 'id_' + Math.random().toString(36).slice(2, 10)];
  return {
    type: 'doc', path: full.join('/'), id: full[full.length - 1],
    parent: collRef(full.slice(0, -1).join('/')),
  };
}

export const db: any = { name: 'telepixels_live_postgres' };

export function doc(first: any, ...rest: string[]): DocRef {
  if (first && first.type === 'collection') {
    // doc(collectionRef) or doc(collectionRef, id)
    const base = segs(first.path);
    const extra = rest.filter(Boolean).flatMap((r) => segs(r));
    const all = [...base, ...extra];
    return docRef(all.join('/'));
  }
  const parts = rest.filter(Boolean).flatMap((r) => segs(r));
  return docRef(parts.join('/'));
}

export function collection(first: any, ...rest: string[]): CollectionRef {
  if (first && first.type === 'doc') {
    const extra = rest.filter(Boolean).flatMap((r) => segs(r));
    return collRef([first.path, ...extra].join('/'));
  }
  return collRef(rest.filter(Boolean).flatMap((r) => segs(r)).join('/'));
}

export function collectionGroup(_first: any, name: string): CollectionRef {
  return collRef(name, true);
}

export function where(field: string, op: string, value: any): QueryFilter { return { field, op, value }; }
export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') { return { field, direction }; }
export function limit(n: number) { return { limit: n }; }

export function query(coll: CollectionRef | QueryDef, ...modifiers: any[]): QueryDef {
  const target = coll.type === 'query' ? coll.target : coll;
  const filters: QueryFilter[] = coll.type === 'query' ? [...coll.filters] : [];
  const orderBys = coll.type === 'query' ? [...coll.orderBys] : [];
  let limitCount: number | undefined = coll.type === 'query' ? coll.limitCount : undefined;
  for (const mod of modifiers) {
    if (mod && 'op' in mod) filters.push(mod as QueryFilter);
    else if (mod && 'direction' in mod) orderBys.push(mod);
    else if (mod && 'limit' in mod) limitCount = mod.limit;
  }
  return { type: 'query', target, filters, orderBys, limitCount };
}

export function serverTimestamp() { return new Date().toISOString(); }

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  toDate() { return new Date(this.seconds * 1000); }
  static now() { return new Timestamp(Math.floor(Date.now() / 1000), 0); }
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime() / 1000), 0); }
}

// ---------------------------------------------------------------------------
// Local draft store (report working copies; finalized reports live in Postgres)
// ---------------------------------------------------------------------------
const DRAFT_KEY = 'tp_report_drafts_v1';
function readDrafts(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}
function writeDrafts(d: Record<string, any>) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
}
const draftKey = (pid: string, rid: string, id: string) => `${pid}/${rid}/${id}`;

// Legacy settings/pricing toggle (local UI preference)
const PRICING_TOGGLE = 'tp_settings_pricing';

// ---------------------------------------------------------------------------
// Session (synced from AuthContext; loggerService reads auth.currentUser)
// ---------------------------------------------------------------------------
export interface LiveUser {
  uid: string; email: string | null; displayName: string | null;
  emailVerified: boolean; isAnonymous: boolean; phoneNumber: null; photoURL: null;
  providerId: string; tenantId: null; providerData: any[];
  getIdToken: () => Promise<string>; getIdTokenResult: () => Promise<any>;
  delete: () => Promise<void>; reload: () => Promise<void>; toJSON: () => any;
}
let sessionUser: LiveUser | null = null;
const authListeners = new Set<(u: LiveUser | null) => void>();

export function syncSessionUser(u: { uid: string; email: string; displayName: string } | null) {
  sessionUser = u ? {
    uid: u.uid, email: u.email, displayName: u.displayName,
    emailVerified: true, isAnonymous: false, phoneNumber: null, photoURL: null,
    providerId: 'jwt', tenantId: null, providerData: [],
    getIdToken: async () => getAuthToken() || '',
    getIdTokenResult: async () => ({ token: getAuthToken() }),
    delete: async () => {}, reload: async () => {},
    toJSON: () => ({ uid: u.uid, email: u.email }),
  } : null;
  authListeners.forEach((cb) => { try { cb(sessionUser); } catch {} });
  eventBus.emit('auth_state_changed', u);
}

export const auth = {
  get currentUser() { return sessionUser; },
  onAuthStateChanged(cb: (u: LiveUser | null) => void) {
    authListeners.add(cb);
    setTimeout(() => { try { cb(sessionUser); } catch {} }, 0);
    return () => { authListeners.delete(cb); };
  },
};
export type User = LiveUser;
export type FirebaseUser = LiveUser;
export const onAuthStateChanged = (_authInstance: any, cb?: any) => {
  const fn = typeof _authInstance === 'function' ? _authInstance : cb;
  return auth.onAuthStateChanged(fn);
};
export const setPersistence = async () => {};
export const browserLocalPersistence = 'LOCAL';
export class GoogleAuthProvider {}
export const signInWithPopup = async () => { throw new Error('Google sign-in removed — use staff email login.'); };
export const loginWithGoogle = async () => { throw new Error('Google sign-in removed — use staff email login.'); };
export const logout = async () => { await api.auth.logout(); syncSessionUser(null); };
export const signOut = async () => logout();
export const initializeApp = () => ({ name: '[DEFAULT]', options: {} });
export const getAuth = () => auth;
export const initializeFirestore = () => db;
export const getStorage = () => ({});
export const ref = (_s: any, path: string) => ({ path });
export const uploadBytes = async () => { throw new Error('Use supabase.storage upload (live).'); };
export const getDownloadURL = async (r: any) => `/uploads/${String(r?.path || '').split('/').pop()}`;
export const createClient = () => supabase;

export enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow = false) {
  console.warn(`[live ${operationType}] ${path}:`, error instanceof Error ? error.message : error);
  if (shouldThrow) throw error;
}

// ---------------------------------------------------------------------------
// Supabase-storage-compatible uploader over POST /api/storage/upload
// ---------------------------------------------------------------------------
const urlByRequestedPath = new Map<string, string>();
export const BUCKET_NAME = 'studies';
export const supabase = {
  storage: {
    from: (_bucket: string) => ({
      async upload(path: string, file: File | Blob, _options?: { contentType?: string; upsert?: boolean }) {
        const res = await api.storage.upload(path, file);
        urlByRequestedPath.set(path, res.publicUrl);
        return { data: { path: res.storagePath }, error: null };
      },
      getPublicUrl(path: string) {
        const mapped = urlByRequestedPath.get(path);
        const base = String(path).split('/').pop();
        return { data: { publicUrl: mapped || `/uploads/${base}` } };
      },
    }),
  },
};

// ---------------------------------------------------------------------------
// Path routing → REST
// ---------------------------------------------------------------------------
interface Parsed { top: string; pid?: string; rid?: string; tail?: string; leaf?: string }

function parseDoc(path: string): Parsed {
  const s = segs(path);
  const out: Parsed = { top: s[0] };
  if (s[0] === 'patients') {
    if (s[1]) out.pid = s[1];
    if (s[2] === 'requests' && s[3]) out.rid = s[3];
    if (s[4] && (s[4] === 'images' || s[4] === 'reports')) out.tail = s[4];
    if (s[5]) out.leaf = s[5];
  }
  if (s[0] === 'users' && s[1]) out.leaf = s[1];
  if (s[0] === 'facilities' && s[1] === 'pricing' && s[2] !== undefined) { out.pid = s[1]; out.leaf = s.slice(2).join('/'); }
  return out;
}

// patient id-or-MRN resolution (portal uses MRN in paths)
let patientCache: { at: number; rows: any[] } = { at: 0, rows: [] };
async function allPatients(): Promise<any[]> {
  if (Date.now() - patientCache.at < 5000 && patientCache.rows.length) return patientCache.rows;
  try {
    const rows = await api.patients.list();
    patientCache = { at: Date.now(), rows };
    return rows;
  } catch { return patientCache.rows; }
}
function invalidateCaches() {
  patientCache = { at: 0, rows: [] };
  eventBus.emit('live_invalidate', true);
}
async function resolvePid(pidOrMrn: string): Promise<string> {
  try { await api.patients.get(pidOrMrn); return pidOrMrn; } catch {}
  const rows = await allPatients();
  const hit = rows.find((p) => String(p.mrn || '').toUpperCase() === String(pidOrMrn).toUpperCase()
    || String(p.id || '').toUpperCase() === String(pidOrMrn).toUpperCase());
  if (!hit) throw new Error('Patient not found');
  return hit.id;
}

// --- reads ---
async function fetchDoc(ref: DocRef): Promise<any | null> {
  const p = parseDoc(ref.path);
  if (p.top === 'patients' && p.pid && !p.rid) {
    try { return await api.patients.get(await resolvePid(p.pid)); } catch { return null; }
  }
  if (p.top === 'patients' && p.pid && p.rid && !p.tail) {
    const pid = await resolvePid(p.pid);
    try { return await api.requests.get(pid, p.rid); } catch { return null; }
  }
  if (p.top === 'patients' && p.pid && p.rid && p.tail === 'reports' && p.leaf) {
    const drafts = readDrafts();
    const pid = await resolvePid(p.pid);
    const dk = draftKey(pid, p.rid, p.leaf);
    if (drafts[dk]) return { id: p.leaf, ...drafts[dk] };
    try { return await api.reports.get(pid, p.rid, p.leaf); } catch { return null; }
  }
  if (p.top === 'users' && p.leaf) {
    const users = await api.auth.getAllUsers().catch(() => []);
    return users.find((u: any) => u.uid === p.leaf || (u as any).id === p.leaf) || null;
  }
  if (p.top === 'systemSettings') {
    try { return await api.settings.getGlobal(); } catch { return null; }
  }
  if (p.top === 'settings') {
    try { return { allowFacilityAccess: JSON.parse(localStorage.getItem(PRICING_TOGGLE) || 'false') }; } catch { return { allowFacilityAccess: false }; }
  }
  if (p.top === 'facilities' && p.pid && p.leaf) {
    const items = await api.pricing.list(p.pid).catch(() => []);
    const norm = (s: string) => String(s).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return items.find((i: any) => norm(i.partName) === norm(p.leaf!)) || null;
  }
  return null;
}

async function fetchCollection(coll: CollectionRef): Promise<Array<{ id: string; data: any; ref: DocRef }>> {
  const path = coll.path;
  const s = segs(path);
  const out: Array<{ id: string; data: any; ref: DocRef }> = [];
  const mkRef = (p: string) => docRef(p);
  if (coll.isGroup && s[0] === 'requests') {
    const rows = await api.requests.list().catch(() => []);
    for (const r of rows as any[]) {
      out.push({ id: r.id, data: r, ref: mkRef(`patients/${r.patientId}/requests/${r.id}`) });
    }
    return out;
  }
  if (s[0] === 'patients' && s.length === 1) {
    const rows = await allPatients();
    for (const r of rows) out.push({ id: r.id, data: r, ref: mkRef(`patients/${r.id}`) });
    return out;
  }
  if (s[0] === 'patients' && s[2] === 'requests' && s.length === 3) {
    const pid = await resolvePid(s[1]);
    const rows = await api.requests.list({ patientId: pid }).catch(() => []);
    for (const r of rows as any[]) out.push({ id: r.id, data: r, ref: mkRef(`patients/${pid}/requests/${r.id}`) });
    return out;
  }
  if (s[0] === 'patients' && s[2] === 'requests' && s[4] === 'images' && s.length === 5) {
    const pid = await resolvePid(s[1]);
    const rows = await api.studies.listImages(pid, s[3]).catch(() => []);
    for (const r of rows as any[]) out.push({ id: r.id, data: r, ref: mkRef(`${path}/${r.id}`) });
    return out;
  }
  if (s[0] === 'patients' && s[2] === 'requests' && s[4] === 'reports' && s.length === 5) {
    const pid = await resolvePid(s[1]);
    const rows = await api.reports.list(pid, s[3]).catch(() => []);
    for (const r of rows as any[]) out.push({ id: r.id, data: r, ref: mkRef(`${path}/${r.id}`) });
    // merge local drafts
    const drafts = readDrafts();
    const prefix = `${pid}/${s[3]}/`;
    for (const [k, v] of Object.entries(drafts)) {
      if (k.startsWith(prefix)) {
        const id = k.slice(prefix.length);
        if (!out.some((o) => o.id === id)) out.push({ id, data: { id, ...v }, ref: mkRef(`${path}/${id}`) });
      }
    }
    return out;
  }
  if (s[0] === 'users' && s.length === 1) {
    const rows = await api.auth.getAllUsers().catch(() => []);
    for (const r of rows as any[]) { const id = r.uid || r.id; out.push({ id, data: { ...r, id, uid: id }, ref: mkRef(`users/${id}`) }); }
    return out;
  }
  if (s[0] === 'logs' && s.length === 1) {
    const rows = await api.logs.list().catch(() => []);
    for (const r of rows as any[]) out.push({ id: r.id, data: r, ref: mkRef(`logs/${r.id}`) });
    return out;
  }
  if (s[0] === 'facilities' && s[2] === 'pricing' && s.length === 3) {
    const rows = await api.pricing.list(s[1]).catch(() => []);
    for (const r of rows as any[]) out.push({ id: r.partName, data: r, ref: mkRef(`${path}/${r.partName}`) });
    return out;
  }
  return out;
}

function applyQuery(items: Array<{ id: string; data: any; ref: DocRef }>, q: QueryDef) {
  let out = items;
  for (const f of q.filters) {
    out = out.filter((it) => {
      const val = it.data[f.field];
      const t = f.value;
      switch (f.op) {
        case '==': return val === t;
        case '!=': return val !== t;
        case '>': return val > t;
        case '>=': return val >= t;
        case '<': return val < t;
        case '<=': return val <= t;
        case 'in': return Array.isArray(t) && t.includes(val);
        case 'not-in': return Array.isArray(t) && !t.includes(val);
        case 'array-contains': return Array.isArray(val) && val.includes(t);
        case 'array-contains-any': return Array.isArray(val) && Array.isArray(t) && t.some((v) => val.includes(v));
        default: return true;
      }
    });
  }
  // accessCode lives on the patient, not the request (portal legacy filter)
  const accessF = q.filters.find((f) => f.field === 'accessCode' && f.op === '==');
  if (accessF && q.target.isGroup) {
    // handled below in fetchQuery via patient resolution
  }
  for (const o of q.orderBys) {
    out = [...out].sort((a, b) => {
      const va = a.data[o.field]; const vb = b.data[o.field];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return o.direction === 'asc' ? -1 : 1;
      if (va > vb) return o.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }
  if (typeof q.limitCount === 'number') out = out.slice(0, q.limitCount);
  return out;
}

async function fetchQuery(q: QueryDef) {
  // accessCode group filter: resolve via patients first
  const accessF = q.target.isGroup && q.target.path === 'requests'
    ? q.filters.find((f) => f.field === 'accessCode' && f.op === '==')
    : undefined;
  if (accessF) {
    const patients = await allPatients();
    const pids = new Set(
      patients.filter((p) => String(p.accessCode || '').toUpperCase() === String(accessF.value).toUpperCase())
        .map((p) => p.id)
    );
    const rest = { ...q, filters: q.filters.filter((f) => f !== accessF) };
    const items = await fetchCollection(q.target);
    return applyQuery(items.filter((it) => pids.has(it.data.patientId)), rest);
  }
  return applyQuery(await fetchCollection(q.target), q);
}

// --- snapshots ---
function docSnap(ref: DocRef, data: any) {
  return { id: ref.id, ref, exists: () => data !== null && data !== undefined, data: () => data || {} };
}

export async function getDoc(ref: DocRef) {
  return docSnap(ref, await fetchDoc(ref));
}
export async function getDocFromServer(ref: DocRef) { return getDoc(ref); }

export async function getDocs(qOrColl: CollectionRef | QueryDef) {
  const items = qOrColl.type === 'query' ? await fetchQuery(qOrColl) : await fetchCollection(qOrColl);
  const docs = items.map((it) => ({ id: it.id, ref: it.ref, data: () => it.data, exists: () => true }));
  return {
    empty: items.length === 0, size: items.length, docs,
    forEach: (fn: (d: any) => void) => docs.forEach(fn),
  };
}

// --- writes ---
export async function addDoc(coll: CollectionRef, data: any): Promise<DocRef> {
  const s = segs(coll.path);
  if (s[0] === 'logs' && s.length === 1) {
    const created = await api.logs.create({ action: data.action, details: data.details, targetId: data.targetId, facilityId: data.facilityId });
    invalidateCaches();
    return docRef(`logs/${(created as any).id}`);
  }
  if (s[0] === 'patients' && s.length === 1) {
    const { id: _drop, ...rest } = data || {};
    const created = await api.patients.create(rest);
    invalidateCaches();
    return docRef(`patients/${created.id}`);
  }
  if (s[0] === 'patients' && s[2] === 'requests' && s.length === 3) {
    const pid = await resolvePid(s[1]);
    const { id: _drop, ...rest } = data || {};
    const created = await api.requests.create(pid, rest);
    invalidateCaches();
    return docRef(`patients/${pid}/requests/${created.id}`);
  }
  if (s[0] === 'patients' && s[2] === 'requests' && s[4] === 'images') {
    const pid = await resolvePid(s[1]);
    const created = await api.studies.addImage(pid, s[3], data);
    invalidateCaches();
    return docRef(`${coll.path}/${created.id}`);
  }
  if (s[0] === 'patients' && s[2] === 'requests' && s[4] === 'reports') {
    const pid = await resolvePid(s[1]);
    if (data?.isDraft === false || data?.status === 'Finalized') {
      const created = await api.reports.create(pid, s[3], data);
      invalidateCaches();
      return docRef(`${coll.path}/${created.id}`);
    }
    const id = data?.id || 'draft_' + Math.random().toString(36).slice(2, 10);
    const drafts = readDrafts();
    drafts[draftKey(pid, s[3], id)] = { ...data, id };
    writeDrafts(drafts);
    invalidateCaches();
    return docRef(`${coll.path}/${id}`);
  }
  throw new Error(`addDoc: unsupported collection ${coll.path}`);
}

export async function setDoc(ref: DocRef, data: any, options?: { merge?: boolean }) {
  const p = parseDoc(ref.path);
  if (p.top === 'patients' && p.pid && !p.rid) {
    const pid = ref.id;
    try {
      const existing = await api.patients.get(pid);
      const merged = options?.merge ? { ...existing, ...data } : data;
      await api.patients.update(pid, merged);
    } catch {
      await api.patients.create({ id: pid, ...data });
    }
    invalidateCaches();
    return;
  }
  if (p.top === 'patients' && p.pid && p.rid && !p.tail) {
    const pid = await resolvePid(p.pid);
    try {
      const existing = await api.requests.get(pid, p.rid);
      const merged = options?.merge ? { ...existing, ...data } : data;
      await api.requests.update(pid, p.rid, merged);
    } catch {
      await api.requests.create(pid, { id: p.rid, ...data });
    }
    invalidateCaches();
    return;
  }
  if (p.top === 'patients' && p.pid && p.rid && p.tail === 'reports' && p.leaf) {
    const pid = await resolvePid(p.pid);
    const drafts = readDrafts();
    const dk = draftKey(pid, p.rid, p.leaf);
    const prev = drafts[dk] || {};
    const next = options?.merge ? { ...prev, ...data } : data;
    if (next.isDraft === false || next.status === 'Finalized') {
      delete drafts[dk]; writeDrafts(drafts);
      await api.reports.create(pid, p.rid, next);
    } else {
      drafts[dk] = { ...next, id: p.leaf };
      writeDrafts(drafts);
    }
    invalidateCaches();
    return;
  }
  if (p.top === 'patients' && p.pid && p.rid && p.tail === 'images') {
    const pid = await resolvePid(p.pid);
    await api.studies.addImage(pid, p.rid, data);
    invalidateCaches();
    return;
  }
  if (p.top === 'users' && p.leaf) {
    try { await api.auth.updateUser(p.leaf, options?.merge ? data : data); }
    catch { await api.auth.createUser({ ...data, uid: p.leaf } as any); }
    invalidateCaches();
    return;
  }
  if (p.top === 'systemSettings') {
    await api.settings.updateGlobal(data);
    invalidateCaches();
    return;
  }
  if (p.top === 'settings') {
    try { localStorage.setItem(PRICING_TOGGLE, JSON.stringify(!!data.allowFacilityAccess)); } catch {}
    invalidateCaches();
    return;
  }
  if (p.top === 'facilities' && p.pid && p.leaf) {
    await api.pricing.update(p.pid, data.partName || p.leaf, data);
    invalidateCaches();
    return;
  }
  throw new Error(`setDoc: unsupported path ${ref.path}`);
}

export async function updateDoc(ref: DocRef, data: any) {
  const p = parseDoc(ref.path);
  if (p.top === 'patients' && p.pid && p.rid && p.tail === 'reports' && p.leaf) {
    // Draft promotion: marking a draft finalized creates the real report
    const pid = await resolvePid(p.pid);
    const drafts = readDrafts();
    const dk = draftKey(pid, p.rid, p.leaf);
    if (drafts[dk]) {
      const next = { ...drafts[dk], ...data };
      if (next.isDraft === false || next.status === 'Finalized') {
        delete drafts[dk]; writeDrafts(drafts);
        await api.reports.create(pid, p.rid, next);
      } else {
        drafts[dk] = next; writeDrafts(drafts);
      }
      invalidateCaches();
      return;
    }
    await api.reports.update(pid, p.rid, p.leaf, data);
    invalidateCaches();
    return;
  }
  if (p.top === 'patients' && p.pid && p.rid && p.tail === 'images') {
    const pid = await resolvePid(p.pid);
    await api.studies.addImage(pid, p.rid, data);
    invalidateCaches();
    return;
  }
  return setDoc(ref, data, { merge: true });
}

export async function deleteDoc(ref: DocRef) {
  const p = parseDoc(ref.path);
  if (p.top === 'patients' && p.pid && !p.rid) {
    await api.patients.delete(p.pid);
    invalidateCaches();
    return;
  }
  if (p.top === 'users' && p.leaf) {
    await api.auth.deleteUser(p.leaf);
    invalidateCaches();
    return;
  }
  if (p.top === 'patients' && p.pid && p.rid && p.tail === 'reports' && p.leaf) {
    const pid = await resolvePid(p.pid);
    const drafts = readDrafts();
    const dk = draftKey(pid, p.rid, p.leaf);
    if (drafts[dk]) { delete drafts[dk]; writeDrafts(drafts); invalidateCaches(); return; }
  }
  throw new Error(`deleteDoc: unsupported path ${ref.path}`);
}

export function writeBatch(_db?: any) {
  const ops: Array<() => Promise<void>> = [];
  const batch = {
    set(ref: DocRef, data: any, options?: { merge?: boolean }) { ops.push(() => setDoc(ref, data, options)); return batch; },
    update(ref: DocRef, data: any) { ops.push(() => updateDoc(ref, data)); return batch; },
    delete(ref: DocRef) { ops.push(() => deleteDoc(ref)); return batch; },
    async commit() { for (const op of ops) await op(); },
  };
  return batch;
}

// --- realtime-ish subscriptions ---
export function onSnapshot(
  target: DocRef | CollectionRef | QueryDef,
  onNext: (snap: any) => void,
  onError?: (error: any) => void
): () => void {
  let cancelled = false;
  let timer: any = null;
  const run = async () => {
    if (cancelled) return;
    try {
      if ('type' in target && target.type === 'doc') {
        onNext(docSnap(target as DocRef, await fetchDoc(target as DocRef)));
      } else {
        const items = (target as any).type === 'query'
          ? await fetchQuery(target as QueryDef)
          : await fetchCollection(target as CollectionRef);
        if (cancelled) return;
        onNext({
          empty: items.length === 0, size: items.length,
          docs: items.map((it) => ({ id: it.id, ref: it.ref, data: () => it.data, exists: () => true })),
          forEach: (fn: (d: any) => void) => items.forEach((it) => fn({ id: it.id, ref: it.ref, data: () => it.data, exists: () => true })),
        });
      }
    } catch (err) { if (!cancelled) onError?.(err); }
  };
  run();
  timer = setInterval(run, 12000);
  const off = eventBus.on('live_invalidate', run);
  return () => { cancelled = true; if (timer) clearInterval(timer); off(); };
}
