export type UserRole = 
  | 'superadmin' 
  | 'facilityadmin' 
  | 'radiologist' 
  | 'radiographer' 
  | 'sonographer' 
  | 'receptionist';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: 'active' | 'inactive';
  facilityId?: string;
  facilityName?: string;
  facilityLetterhead?: string;
  facilityLogo?: string;
  createdAt?: string | any;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
  patientEmailTemplate?: string;
  physicianEmailTemplate?: string;
  radiologistEmailTemplate?: string;
  systemTheme?: 'cyber' | 'teleradiology';
}

export interface Patient {
  id: string;
  name: string;
  age: number | string;
  gender: 'Male' | 'Female' | 'Other';
  phone?: string;
  contact?: string;
  address?: string;
  facilityId: string;
  nationalId?: string;
  accessCode?: string;
  mrn?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ImagingPriority = 'routine' | 'urgent' | 'STAT';
export type RequestStatus = 'Pending' | 'Images Uploaded' | 'In Progress' | 'Completed';

export interface ImagingRequest {
  id: string;
  patientId: string;
  modalities: string[];
  procedures: string[] | any[];
  clinicalInfo?: string;
  radiographerHistory?: string;
  status: RequestStatus;
  priority: ImagingPriority;
  needsReport: boolean;
  facilityId?: string;
  studyDescription?: string;
  createdAt: string;
  uploadedAt?: string;
  completedAt?: string;
  notificationSent?: boolean;
  notifiedAt?: string;
}

export interface StudyImage {
  id: string;
  name: string;
  url: string;
  data?: string;
  storagePath: string;
  procedureId?: string;
  procedureName?: string;
  dicomHeader?: Record<string, any>;
  uploadedAt: string;
}

export interface Report {
  id: string;
  findings: string;
  impression: string;
  pdfData?: string;
  radiologistId: string;
  radiologistName: string;
  isCritical?: boolean;
  createdAt: string;
  procedureId?: string;
  procedureName?: string;
  status?: string;
  comparison?: string;
  technique?: string;
}

export interface UltrasoundReport {
  id: string;
  patientId: string;
  requestId: string;
  sonographerId: string;
  sonographerName: string;
  findings: Record<string, any>;
  measurements?: Record<string, any>;
  clinicalImpression: string;
  savedAt: string;
}

export interface PricingItem {
  id?: string;
  partName: string;
  price: number;
  pendingPrice?: number;
  currency: string;
  status: 'pending' | 'approved';
  updatedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface SystemLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
  userRole?: string;
  facilityId?: string;
  targetId?: string;
  timestamp: string;
}

export interface SystemSettings {
  facilityName: string;
  facilityPhone?: string;
  facilityAddress?: string;
  theme?: 'cyber' | 'teleradiology';
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
}
