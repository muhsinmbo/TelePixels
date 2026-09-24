/**
 * In-Memory Database & Seed Engine for Instant Development
 * Backend collaborators can easily replace this with PostgreSQL / Prisma / Drizzle / TypeORM.
 */

export interface Facility {
  id: string;
  name: string;
  phone: string;
  address: string;
  logoUrl?: string;
  letterheadUrl?: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'superadmin' | 'facilityadmin' | 'radiologist' | 'radiographer' | 'sonographer' | 'receptionist';
  status: 'active' | 'inactive';
  facilityId: string;
  systemTheme?: 'cyber' | 'teleradiology';
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
  patientEmailTemplate?: string;
  physicianEmailTemplate?: string;
  radiologistEmailTemplate?: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  phone?: string;
  contact?: string;
  address?: string;
  facilityId: string;
  nationalId?: string;
  accessCode: string;
  mrn: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ImagingRequest {
  id: string;
  patientId: string;
  facilityId: string;
  modalities: string[];
  procedures: any[];
  clinicalInfo?: string;
  radiographerHistory?: string;
  status: 'Pending' | 'Images Uploaded' | 'In Progress' | 'Completed';
  priority: 'routine' | 'urgent' | 'STAT';
  needsReport: boolean;
  studyDescription?: string;
  notificationSent?: boolean;
  notifiedAt?: string;
  createdAt: string;
  uploadedAt?: string;
  completedAt?: string;
}

export interface StudyImage {
  id: string;
  requestId: string;
  patientId: string;
  name: string;
  url: string;
  storagePath: string;
  procedureId?: string;
  procedureName?: string;
  dicomHeader?: Record<string, any>;
  uploadedAt: string;
}

export interface Report {
  id: string;
  requestId: string;
  patientId: string;
  radiologistId: string;
  radiologistName: string;
  findings: string;
  impression: string;
  comparison?: string;
  technique?: string;
  pdfData?: string;
  isCritical?: boolean;
  procedureId?: string;
  procedureName?: string;
  status?: string;
  createdAt: string;
}

export interface Pricing {
  facilityId: string;
  partName: string;
  price: number;
  pendingPrice?: number;
  currency: string;
  status: 'pending' | 'approved';
  updatedAt: string;
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

class MemoryDatabase {
  facilities = new Map<string, Facility>();
  users = new Map<string, User>();
  patients = new Map<string, Patient>();
  requests = new Map<string, ImagingRequest>();
  images = new Map<string, StudyImage>();
  reports = new Map<string, Report>();
  pricing = new Map<string, Pricing>();
  logs: SystemLog[] = [];
  settings = new Map<string, any>();

  constructor() {
    this.seedDefaults();
  }

  seedDefaults() {
    // 1. Default Facility
    const facId = 'default-facility';
    this.facilities.set(facId, {
      id: facId,
      name: "King's Diagnostic Imaging and Research Center",
      phone: "+233 50 025 2793",
      address: "Saint Charles Road (Before Attaesibi Hotel), Tamale, Northern Region, Ghana",
    });

    // 2. Default Global Settings
    this.settings.set('global', {
      facilityName: "King's Diagnostic Imaging and Research Center",
      facilityPhone: "+233 50 025 2793",
      facilityAddress: "Saint Charles Road (Before Attaesibi Hotel), Tamale, Northern Region, Ghana",
      theme: "cyber",
      whatsappEnabled: true,
      emailEnabled: true,
    });

    // 3. Default Reviewer Super Admin
    this.users.set('reviewer_superadmin', {
      id: 'reviewer_superadmin',
      email: 'reviewer@kingsimaging.org',
      displayName: 'Lead Reviewer (Super Admin)',
      role: 'superadmin',
      status: 'active',
      facilityId: facId,
      systemTheme: 'cyber',
      whatsappEnabled: true,
      emailEnabled: true,
    });

    // 4. Default Pricing
    const defaultProcedures = [
      { partName: "Chest (Thorax)", price: 150 },
      { partName: "Abdomen (KUB)", price: 180 },
      { partName: "Cervical Spine", price: 120 },
      { partName: "Lumbar Spine", price: 130 },
      { partName: "Thoracic Spine", price: 130 },
      { partName: "Pelvis", price: 140 },
      { partName: "Skull (Cranium)", price: 160 },
      { partName: "Knee Joint", price: 110 },
      { partName: "Abdominal Ultrasound", price: 150 },
      { partName: "Pelvic Ultrasound", price: 120 },
      { partName: "Obstetric Ultrasound", price: 100 },
      { partName: "Echocardiography (Adult)", price: 400 },
      { partName: "ECG (12-Lead)", price: 80 }
    ];

    for (const item of defaultProcedures) {
      const key = `${facId}_${item.partName}`;
      this.pricing.set(key, {
        facilityId: facId,
        partName: item.partName,
        price: item.price,
        currency: 'GHS',
        status: 'approved',
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

export const memoryDb = new MemoryDatabase();
