-- ====================================================================
-- TelePixels Teleradiology & DICOM Workflow Database Schema (PostgreSQL)
-- ====================================================================

-- 1. Facilities
CREATE TABLE IF NOT EXISTS facilities (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(64),
    address TEXT,
    logo_url TEXT,
    letterhead_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users & Staff Members
CREATE TYPE user_role_enum AS ENUM (
    'superadmin', 
    'facilityadmin', 
    'radiologist', 
    'radiographer', 
    'sonographer', 
    'receptionist'
);

CREATE TYPE user_status_enum AS ENUM ('active', 'inactive');

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'receptionist',
    status user_status_enum NOT NULL DEFAULT 'active',
    facility_id VARCHAR(64) REFERENCES facilities(id) ON DELETE SET NULL,
    system_theme VARCHAR(32) DEFAULT 'cyber',
    whatsapp_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    patient_email_template TEXT,
    physician_email_template TEXT,
    radiologist_email_template TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_facility ON users(facility_id);

-- 3. Patients Demographics
CREATE TYPE gender_enum AS ENUM ('Male', 'Female', 'Other');

CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 0 AND age <= 150),
    gender gender_enum NOT NULL,
    phone VARCHAR(64),
    contact VARCHAR(64),
    address TEXT,
    national_id VARCHAR(64),
    access_code VARCHAR(32) NOT NULL,
    mrn VARCHAR(64) UNIQUE NOT NULL,
    facility_id VARCHAR(64) NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_facility ON patients(facility_id);
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn);
CREATE INDEX IF NOT EXISTS idx_patients_access_code ON patients(access_code);

-- 4. Imaging Requests
CREATE TYPE request_status_enum AS ENUM (
    'Pending', 
    'Images Uploaded', 
    'In Progress', 
    'Completed'
);

CREATE TYPE priority_enum AS ENUM ('routine', 'urgent', 'STAT');

CREATE TABLE IF NOT EXISTS imaging_requests (
    id VARCHAR(64) PRIMARY KEY,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    facility_id VARCHAR(64) NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    modalities JSONB NOT NULL DEFAULT '[]'::jsonb,
    procedures JSONB NOT NULL DEFAULT '[]'::jsonb,
    clinical_info TEXT,
    radiographer_history TEXT,
    status request_status_enum NOT NULL DEFAULT 'Pending',
    priority priority_enum NOT NULL DEFAULT 'routine',
    needs_report BOOLEAN DEFAULT TRUE,
    study_description VARCHAR(255),
    notification_sent BOOLEAN DEFAULT FALSE,
    notified_at TIMESTAMP WITH TIME ZONE,
    uploaded_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_patient ON imaging_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON imaging_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_facility ON imaging_requests(facility_id);

-- 5. Study Images & DICOM Series
CREATE TABLE IF NOT EXISTS study_images (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL REFERENCES imaging_requests(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    procedure_id VARCHAR(64),
    procedure_name VARCHAR(255),
    dicom_header JSONB,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_study_images_request ON study_images(request_id);

-- 6. Radiology Reports
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL REFERENCES imaging_requests(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    radiologist_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    radiologist_name VARCHAR(255) NOT NULL,
    findings TEXT NOT NULL,
    impression TEXT NOT NULL,
    comparison TEXT,
    technique TEXT,
    pdf_data TEXT,
    is_critical BOOLEAN DEFAULT FALSE,
    procedure_id VARCHAR(64),
    procedure_name VARCHAR(255),
    status VARCHAR(32) DEFAULT 'Finalized',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_request ON reports(request_id);
CREATE INDEX IF NOT EXISTS idx_reports_radiologist ON reports(radiologist_id);

-- 7. Ultrasound Reports / Worksheets
CREATE TABLE IF NOT EXISTS ultrasound_reports (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL REFERENCES imaging_requests(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    sonographer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sonographer_name VARCHAR(255) NOT NULL,
    findings JSONB NOT NULL DEFAULT '{}'::jsonb,
    measurements JSONB DEFAULT '{}'::jsonb,
    clinical_impression TEXT NOT NULL,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Facility Pricing
CREATE TABLE IF NOT EXISTS facility_pricing (
    id SERIAL PRIMARY KEY,
    facility_id VARCHAR(64) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    part_name VARCHAR(255) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    pending_price NUMERIC(12, 2),
    currency VARCHAR(10) DEFAULT 'GHS',
    status VARCHAR(32) DEFAULT 'approved' CHECK (status IN ('pending', 'approved')),
    approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, part_name)
);

-- 9. Append-Only System Audit Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    details TEXT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(64),
    facility_id VARCHAR(64),
    target_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_logs_action ON system_logs(action);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

-- 10. System Settings (Global Key-Value or Facility Configuration)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
