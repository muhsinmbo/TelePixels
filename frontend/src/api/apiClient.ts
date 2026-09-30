import { 
  UserProfile, 
  Patient, 
  ImagingRequest, 
  StudyImage, 
  Report, 
  PricingItem, 
  SystemLog, 
  SystemSettings 
} from './types';

type Listener = (data: any) => void;

export interface AIStudyContext {
  requestId: string; patientId: string;
  patientAge: number | null; patientSex: string | null;
  modality: string; examination: string; bodyPart: string | null;
  clinicalHistory: string | null; radiographerHistory: string | null;
  priority: string; status: string;
}

export interface AIReportTemplate {
  id: string; title: string; modality: string; examination: string;
  sections: Array<{ key: string; title: string; placeholder: string }>;
  impressionGuidance: string; matchLevel: 'exact' | 'modality-exam' | 'generic';
}

export interface AIPreviousReport {
  id: string; requestId: string; findings: string; impression: string;
  comparison?: string; radiologistName: string; createdAt: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const resolveApiUrl = (endpoint: string) => {
  if (!endpoint) return endpoint;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  }
  return endpoint;
};

class ApiEventEmitter {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(channel: string, listener: Listener) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);
    return () => {
      this.listeners.get(channel)?.delete(listener);
    };
  }

  emit(channel: string, data: any) {
    this.listeners.get(channel)?.forEach(fn => {
      try {
        fn(data);
      } catch (err) {
        console.error(`Error in event listener for channel ${channel}:`, err);
      }
    });
  }
}

export const eventBus = new ApiEventEmitter();

// Token & Session Storage Helpers
const TOKEN_KEY = 'tp_auth_token';
const REFRESH_KEY = 'tp_refresh_token';

export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAuthToken = (token: string | null) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (err) {
    console.warn('Failed to set auth token:', err);
  }
};

export const getRefreshToken = (): string | null => {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
};

export const setRefreshToken = (token: string | null) => {
  try {
    if (token) {
      localStorage.setItem(REFRESH_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  } catch (err) {
    console.warn('Failed to set refresh token:', err);
  }
};

// Single-flight silent refresh: concurrent 401s share one rotation.
let refreshPromise: Promise<string> | null = null;

// In-flight GET request deduplication cache
const inFlightGetCache = new Map<string, Promise<any>>();

function isRefreshable(endpoint: string): boolean {
  return !endpoint.startsWith('/api/auth/') && endpoint !== '/api/portal/verify';
}

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const rt = getRefreshToken();
      if (!rt) throw new Error('No session — please log in again');
      const res = await fetch(resolveApiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        setAuthToken(null);
        setRefreshToken(null);
        eventBus.emit('auth_state_changed', null);
        throw new Error('Session expired — please log in again');
      }
      const data = await res.json();
      setAuthToken(data.token);
      setRefreshToken(data.refreshToken);
      eventBus.emit('auth_state_changed', data.user || null);
      return data.token as string;
    })();
    refreshPromise.catch(() => {}).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

// Generic HTTP Request Handler (auto-retries once after silent refresh)
async function request<T>(endpoint: string, options: RequestInit = {}, retried = false): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const cacheKey = `${method}:${endpoint}`;

  // Deduplicate concurrent GET requests
  if (isGet) {
    const existing = inFlightGetCache.get(cacheKey);
    if (existing) return existing as Promise<T>;
  }

  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const promise = (async () => {
    const response = await fetch(resolveApiUrl(endpoint), {
      ...options,
      headers,
    });

    if (response.status === 401 && !retried && isRefreshable(endpoint)) {
      try {
        await refreshAccessToken();
        return request<T>(endpoint, options, true);
      } catch {
        // Refresh failed — fall through to the standard error below
      }
    }

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.error || errJson.message) {
          errorMsg = errJson.error || errJson.message;
        }
      } catch {
        // Use status text if json parsing fails
      }
      throw new Error(errorMsg);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  })();

  if (isGet) {
    inFlightGetCache.set(cacheKey, promise);
    promise.finally(() => inFlightGetCache.delete(cacheKey));
  }

  return promise;
}

// Full REST API Client
export const api = {
  // Authentication & Users
  auth: {
    async loginWithToken(credentials: { email?: string; password?: string; accessCode?: string; provider?: string }) {
      const res = await request<{ token: string; refreshToken?: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      setAuthToken(res.token);
      if (res.refreshToken) setRefreshToken(res.refreshToken);
      eventBus.emit('auth_state_changed', res.user);
      return res;
    },

    async getMe(): Promise<UserProfile | null> {
      try {
        return await request<UserProfile>('/api/auth/me');
      } catch (err) {
        return null;
      }
    },

    async logout(): Promise<void> {
      const rt = getRefreshToken();
      try {
        await request('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify(rt ? { refreshToken: rt } : {}),
        });
      } finally {
        setAuthToken(null);
        setRefreshToken(null);
        eventBus.emit('auth_state_changed', null);
      }
    },

    async revokeAllSessions(): Promise<void> {
      await request('/api/auth/revoke', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
      });
      setAuthToken(null);
      setRefreshToken(null);
      eventBus.emit('auth_state_changed', null);
    },

    async getAllUsers(): Promise<UserProfile[]> {
      return request<UserProfile[]>('/api/users');
    },

    async updateUser(uid: string, data: Partial<UserProfile>): Promise<UserProfile> {
      const updated = await request<UserProfile>(`/api/users/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      eventBus.emit(`user_${uid}`, updated);
      eventBus.emit('users_updated', updated);
      return updated;
    },

    async createUser(user: Partial<UserProfile>): Promise<UserProfile> {
      const created = await request<UserProfile>('/api/users', {
        method: 'POST',
        body: JSON.stringify(user),
      });
      eventBus.emit('users_updated', created);
      return created;
    },

    async deleteUser(uid: string): Promise<void> {
      await request(`/api/users/${uid}`, { method: 'DELETE' });
      eventBus.emit('users_updated', { deletedUid: uid });
    }
  },

  // Patients & Demographics
  patients: {
    async list(facilityId?: string): Promise<Patient[]> {
      const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
      return request<Patient[]>(`/api/patients${query}`);
    },

    async get(id: string): Promise<Patient> {
      return request<Patient>(`/api/patients/${encodeURIComponent(id)}`);
    },

    async create(patient: Partial<Patient>): Promise<Patient> {
      const created = await request<Patient>('/api/patients', {
        method: 'POST',
        body: JSON.stringify(patient),
      });
      eventBus.emit('patients_updated', created);
      return created;
    },

    async update(id: string, data: Partial<Patient>): Promise<Patient> {
      const updated = await request<Patient>(`/api/patients/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      eventBus.emit(`patient_${id}`, updated);
      eventBus.emit('patients_updated', updated);
      return updated;
    },

    async delete(id: string): Promise<void> {
      await request(`/api/patients/${encodeURIComponent(id)}`, { method: 'DELETE' });
      eventBus.emit('patients_updated', { deletedId: id });
    }
  },

  // Imaging Requests & Worklists
  requests: {
    async list(filter?: { facilityId?: string; status?: string; patientId?: string }): Promise<ImagingRequest[]> {
      const params = new URLSearchParams();
      if (filter?.facilityId) params.set('facilityId', filter.facilityId);
      if (filter?.status) params.set('status', filter.status);
      if (filter?.patientId) params.set('patientId', filter.patientId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request<ImagingRequest[]>(`/api/requests${qs}`);
    },

    async get(patientId: string, requestId: string): Promise<ImagingRequest> {
      return request<ImagingRequest>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}`);
    },

    async create(patientId: string, requestData: Partial<ImagingRequest>): Promise<ImagingRequest> {
      const created = await request<ImagingRequest>(`/api/patients/${encodeURIComponent(patientId)}/requests`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      eventBus.emit('requests_updated', created);
      return created;
    },

    async update(patientId: string, requestId: string, data: Partial<ImagingRequest>): Promise<ImagingRequest> {
      const updated = await request<ImagingRequest>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      eventBus.emit(`request_${requestId}`, updated);
      eventBus.emit('requests_updated', updated);
      return updated;
    }
  },

  // Studies & DICOM Images
  studies: {
    async listImages(patientId: string, requestId: string): Promise<StudyImage[]> {
      return request<StudyImage[]>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/images`);
    },

    async addImage(patientId: string, requestId: string, image: Partial<StudyImage>): Promise<StudyImage> {
      const created = await request<StudyImage>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/images`, {
        method: 'POST',
        body: JSON.stringify(image),
      });
      eventBus.emit(`images_${requestId}`, created);
      return created;
    }
  },

  // Storage Upload (Replaces Supabase Storage)
  storage: {
    async upload(path: string, file: File | Blob, options?: { contentType?: string }): Promise<{ publicUrl: string; storagePath: string }> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      if (options?.contentType) {
        formData.append('contentType', options.contentType);
      }

      const res = await request<{ publicUrl: string; storagePath: string }>('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      return res;
    }
  },

  // Reports
  reports: {
    async list(patientId: string, requestId: string): Promise<Report[]> {
      return request<Report[]>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/reports`);
    },

    async get(patientId: string, requestId: string, reportId: string): Promise<Report> {
      return request<Report>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/reports/${encodeURIComponent(reportId)}`);
    },

    async create(patientId: string, requestId: string, report: Partial<Report>): Promise<Report> {
      const created = await request<Report>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/reports`, {
        method: 'POST',
        body: JSON.stringify(report),
      });
      eventBus.emit(`report_${requestId}`, created);
      eventBus.emit('reports_updated', created);
      return created;
    },

    async update(patientId: string, requestId: string, reportId: string, data: Partial<Report>): Promise<Report> {
      const updated = await request<Report>(`/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/reports/${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      eventBus.emit(`report_${requestId}`, updated);
      eventBus.emit('reports_updated', updated);
      return updated;
    }
  },

  // Pricing
  pricing: {
    async list(facilityId = 'default-facility'): Promise<PricingItem[]> {
      return request<PricingItem[]>(`/api/facilities/${encodeURIComponent(facilityId)}/pricing`);
    },

    async update(facilityId: string, partName: string, data: Partial<PricingItem>): Promise<PricingItem> {
      const updated = await request<PricingItem>(`/api/facilities/${encodeURIComponent(facilityId)}/pricing/${encodeURIComponent(partName)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      eventBus.emit('pricing_updated', updated);
      return updated;
    }
  },

  // System Settings & Logs
  settings: {
    async getGlobal(): Promise<SystemSettings> {
      return request<SystemSettings>('/api/settings/global');
    },

    async updateGlobal(settings: Partial<SystemSettings>): Promise<SystemSettings> {
      const updated = await request<SystemSettings>('/api/settings/global', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      eventBus.emit('settings_global', updated);
      return updated;
    }
  },

  logs: {
    async list(): Promise<SystemLog[]> {
      return request<SystemLog[]>('/api/logs');
    },

    async create(log: Partial<SystemLog>): Promise<SystemLog> {
      return request<SystemLog>('/api/logs', {
        method: 'POST',
        body: JSON.stringify(log),
      });
    }
  },

  // Patient Portal Access
  portal: {
    async verify(mrn: string, accessCode: string, requestId?: string) {
      return request<{
        patient: Patient;
        requests: ImagingRequest[];
        studies: Record<string, StudyImage[]>;
        reports: Record<string, Report[]>;
      }>('/api/portal/verify', {
        method: 'POST',
        body: JSON.stringify({ mrn, accessCode, requestId }),
      });
    }
  },

  // Context-aware AI-assisted reporting (human-in-the-loop)
  ai: {
    async context(patientId: string, requestId: string): Promise<AIStudyContext> {
      return request<AIStudyContext>(`/api/ai/context?patientId=${encodeURIComponent(patientId)}&requestId=${encodeURIComponent(requestId)}`);
    },

    async template(modality: string, examination: string, sex?: string | null): Promise<AIReportTemplate> {
      const q = new URLSearchParams({ modality, examination });
      if (sex) q.set('sex', sex);
      return request<AIReportTemplate>(`/api/ai/templates?${q.toString()}`);
    },

    async previousReports(patientId: string, excludeRequestId: string, limit = 5): Promise<AIPreviousReport[]> {
      const q = new URLSearchParams({ patientId, excludeRequestId, limit: String(limit) });
      return request<AIPreviousReport[]>(`/api/ai/previous-reports?${q.toString()}`);
    },

    async draft(patientId: string, requestId: string): Promise<{ template: AIReportTemplate; context: AIStudyContext; skeleton: string | null; modelDisabled: boolean }> {
      return request<{ template: AIReportTemplate; context: AIStudyContext; skeleton: string | null; modelDisabled: boolean }>('/api/ai/draft', {
        method: 'POST',
        body: JSON.stringify({ patientId, requestId }),
      });
    },

    async polish(patientId: string, requestId: string, findings: string, includePrevious = false) {
      return request<{ polished: string; templateId: string | null }>('/api/ai/polish', {
        method: 'POST',
        body: JSON.stringify({ patientId, requestId, findings, includePrevious }),
      });
    }
  }
};
