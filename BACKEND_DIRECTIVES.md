# TelePixels — Master Backend Directives & Architecture Specification

> **Target Audience:** Backend Engineering Team & Systems Collaborators  
> **Document Status:** Official Production Blueprint  
> **Version:** 2.0.0  
> **Scope:** Complete Elimination of Firebase & Supabase; Implementation of Sovereign Self-Hosted Backend & Storage

---

## 1. Executive Summary & Architectural Vision

**TelePixels** is an enterprise-grade teleradiology and medical imaging platform facilitating clinical workflows across patient intake, PACS/DICOM visualization, AI-assisted reporting, and multi-facility teleradiology operations.

### The Objective
Previously, the prototype utilized Firebase (Auth & Firestore) and Supabase (Storage). **Both dependencies have been 100% eradicated from the codebase.** The frontend is now cleanly grouped under `/frontend`, consuming a decoupled API client (`frontend/src/api/apiClient.ts`). 

The backend team is tasked with implementing a scalable, sovereign REST API and Object Storage service in `/backend`. This document serves as your single source of truth for endpoints, database schemas, security constraints, and integration protocols.

---

## 2. Project Directory Structure

The repository is divided into clean, decoupled workspaces:

```
├── /frontend/                     # Client-Side Application (React 19, Vite, Tailwind CSS)
│   ├── src/
│   │   ├── api/                   # Decoupled API client, types & reactive store
│   │   │   ├── apiClient.ts       # Unified REST & Storage HTTP client
│   │   │   ├── types.ts           # Core TypeScript domain models
│   │   │   └── compat.ts          # Reactive state & event bus adapter
│   │   ├── components/            # UI components, modals, sidebar, DICOM viewport
│   │   ├── contexts/              # AuthContext & Session management
│   │   ├── pages/                 # Routing views (Intake, Worklists, DICOM Viewer, Reports)
│   │   ├── services/              # PDF generation, DICOM parsing, export services
│   │   ├── App.tsx                # Client routing & Protected routes
│   │   └── main.tsx               # Client entry point
│   └── index.css                  # Global themes (Cyber & Teleradiology)
│
├── /backend/                      # Backend Service Workspace (Node/Express, PostgreSQL)
│   ├── src/
│   │   ├── app.ts                 # Express application entry point
│   │   ├── database/
│   │   │   ├── schema.sql         # Production PostgreSQL DDL with indexes & triggers
│   │   │   └── memoryDb.ts        # Fast development in-memory store & seed engine
│   │   └── routes/
│   │       └── index.ts           # Modular REST API routes
│   ├── package.json               # Backend dependencies (express, pg, jsonwebtoken, bcryptjs)
│   ├── tsconfig.json              # NodeNext TypeScript configuration
│   ├── .env.example               # Configuration template
│   └── README.md                  # Quickstart guide
│
├── /BACKEND_DIRECTIVES.md         # This technical specification
├── /server.ts                     # Dev & production runner uniting frontend & API on port 3000
├── /index.html                    # Root HTML entry point
└── /package.json                  # Root monorepo configuration
```

---

## 3. Database Architecture (PostgreSQL DDL)

The complete SQL DDL is maintained at `backend/src/database/schema.sql`. Below is the entity relational diagram and constraint specification.

### 3.1 Relational Schema Map

```
+----------------+       1:N       +-------------------+       1:N       +----------------+
|   facilities   | <-------------- |     patients      | <-------------- | imaging_requests|
+----------------+                 +-------------------+                 +----------------+
        |                                                                         |
        | 1:N                                                                     | 1:N
        v                                                                         v
+----------------+                                                       +----------------+
|     users      |                                                       |  study_images  |
+----------------+                                                       +----------------+
        |                                                                         |
        | 1:N (Author)                                                            | 1:N
        v                                                                         v
+----------------+                                                       +----------------+
|    reports     | <---------------------------------------------------- |   DICOM / WADO |
+----------------+                                                       +----------------+
```

### 3.2 Core Table Specifications

#### 1. `facilities`
- `id` (VARCHAR(64), PK): Unique identifier (e.g. `'default-facility'`).
- `name` (VARCHAR(255), NOT NULL): Facility display name (e.g. `"King's Diagnostic Imaging and Research Center"`).
- `phone` (VARCHAR(64)), `address` (TEXT), `logo_url` (TEXT), `letterhead_url` (TEXT).

#### 2. `users`
- `id` (VARCHAR(64), PK): Unique staff user ID.
- `email` (VARCHAR(255), UNIQUE, NOT NULL): Staff email.
- `password_hash` (VARCHAR(255), NOT NULL): Argon2 or bcrypt hash.
- `display_name` (VARCHAR(255), NOT NULL).
- `role` (ENUM): `'superadmin' | 'facilityadmin' | 'radiologist' | 'radiographer' | 'sonographer' | 'receptionist'`.
- `status` (ENUM): `'active' | 'inactive'`.
- `facility_id` (FK -> `facilities.id`).
- `system_theme` (VARCHAR(32)): `'cyber' | 'teleradiology'`.

#### 3. `patients`
- `id` (VARCHAR(64), PK): Formatted Patient ID (e.g., `'KP-204891'`).
- `mrn` (VARCHAR(64), UNIQUE, NOT NULL): Medical Record Number.
- `access_code` (VARCHAR(32), NOT NULL): 6-character patient portal access code.
- `name` (VARCHAR(255), NOT NULL), `age` (INT), `gender` (`'Male' | 'Female' | 'Other'`).
- `phone` (VARCHAR(64)), `address` (TEXT), `national_id` (VARCHAR(64)).
- `facility_id` (FK -> `facilities.id`, NOT NULL).

#### 4. `imaging_requests`
- `id` (VARCHAR(64), PK): Request identifier.
- `patient_id` (FK -> `patients.id`, ON DELETE CASCADE).
- `facility_id` (FK -> `facilities.id`).
- `modalities` (JSONB): e.g. `["X-Ray", "Ultrasound"]`.
- `procedures` (JSONB): e.g. `["Chest (Thorax)", "Abdominal Ultrasound"]`.
- `clinical_info` (TEXT): Clinical history recorded at intake.
- `radiographer_history` (TEXT): Clinical observations entered by radiographer.
- `status` (ENUM): `'Pending' -> 'Images Uploaded' -> 'In Progress' -> 'Completed'`.
- `priority` (ENUM): `'routine' | 'urgent' | 'STAT'`.
- `needs_report` (BOOLEAN DEFAULT TRUE).
- `uploaded_at`, `completed_at`, `created_at`, `updated_at`.

#### 5. `study_images`
- `id` (VARCHAR(64), PK).
- `request_id` (FK -> `imaging_requests.id`, ON DELETE CASCADE).
- `patient_id` (FK -> `patients.id`, ON DELETE CASCADE).
- `name` (VARCHAR(255)): Original file name.
- `url` (TEXT): Publicly accessible or pre-signed URL for viewing.
- `storage_path` (TEXT): Object key in storage (e.g. `patientId/requestId/timestamp_file.dcm`).
- `procedure_id` (VARCHAR(64)), `procedure_name` (VARCHAR(255)).
- `dicom_header` (JSONB): Extracted DICOM tags (PatientName, Modality, SOPInstanceUID, StudyInstanceUID).

#### 6. `reports`
- `id` (VARCHAR(64), PK).
- `request_id` (FK -> `imaging_requests.id`, ON DELETE CASCADE).
- `patient_id` (FK -> `patients.id`).
- `radiologist_id` (FK -> `users.id`).
- `radiologist_name` (VARCHAR(255)).
- `findings` (TEXT), `impression` (TEXT), `comparison` (TEXT), `technique` (TEXT).
- `pdf_data` (TEXT): Base64 encoded or S3 URL to the rendered signed PDF.
- `is_critical` (BOOLEAN DEFAULT FALSE).
- `status` (VARCHAR(32) DEFAULT 'Finalized').

#### 7. `facility_pricing`
- `facility_id` (FK -> `facilities.id`), `part_name` (VARCHAR(255)).
- `price` (NUMERIC(12, 2)), `pending_price` (NUMERIC(12, 2)).
- `currency` (VARCHAR(10) DEFAULT 'GHS').
- `status` (`'pending' | 'approved'`), `approved_by` (FK -> `users.id`).

#### 8. `system_logs` (Strictly Append-Only)
- `id` (SERIAL PK), `action` (VARCHAR(64)), `details` (TEXT), `user_id` (VARCHAR(64)), `user_name` (VARCHAR(255)), `facility_id` (VARCHAR(64)), `created_at` (TIMESTAMP).

---

## 4. REST API Endpoint Specification

All endpoints are rooted under `/api`. Standard responses return JSON with appropriate HTTP status codes.

### 4.1 Authentication & Profile
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates via email/password or reviewer credentials. Returns `{ token, user }`. |
| `GET` | `/api/auth/me` | Bearer Token | Returns current authenticated user profile. |
| `POST` | `/api/auth/logout` | Bearer Token | Invalidates session/token. |

**Reviewer Super Admin Credentials (Built-in Demo Bypass):**
- Email: `reviewer@kingsimaging.org`
- Password: `KingSuperAdmin2026!`
- Access Code: `PITCH2026`

### 4.2 User & Staff Management
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Admin | Returns list of all facility/staff users. |
| `POST` | `/api/users` | Admin | Provisions a new staff user. |
| `PATCH` | `/api/users/:uid` | Admin/Self | Updates profile, role, status, or email templates. |
| `DELETE` | `/api/users/:uid` | SuperAdmin | Deactivates or removes a user. |

### 4.3 Patients & Intake
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/patients?facilityId=:id` | Staff | Returns patient list filtered by facility. |
| `GET` | `/api/patients/:id` | Staff | Returns full patient demographic record. |
| `POST` | `/api/patients` | Receptionist+ | Creates patient demographic record with MRN & access code. |
| `PATCH` | `/api/patients/:id` | Staff | Updates demographics or contact info. |
| `DELETE` | `/api/patients/:id` | SuperAdmin | Deletes patient record (audit logged). |

### 4.4 Imaging Requests & Worklists
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/requests` | Staff | Filter by `status` (`Pending`, `Images Uploaded`, etc.) and `facilityId`. |
| `GET` | `/api/patients/:pId/requests/:rId` | Staff | Returns specific imaging request details. |
| `POST` | `/api/patients/:pId/requests` | Receptionist+ | Creates imaging request for modalities/procedures. |
| `PATCH` | `/api/patients/:pId/requests/:rId`| Staff | Updates status, priority, or radiographer clinical history. |

### 4.5 Studies & DICOM Images
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/patients/:pId/requests/:rId/images` | Staff/Portal | Lists study images for viewport rendering. |
| `POST` | `/api/patients/:pId/requests/:rId/images` | Radiographer+ | Adds uploaded image/DICOM metadata record. |
| `POST` | `/api/storage/upload` | Staff | Multipart upload endpoint. Saves to storage & returns `{ publicUrl, storagePath }`. |

### 4.6 Radiology & Ultrasound Reports
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/patients/:pId/requests/:rId/reports` | Staff/Portal | Returns finalized reports for the study. |
| `POST` | `/api/patients/:pId/requests/:rId/reports` | Radiologist | Creates finalized radiology report and updates request to `Completed`. |
| `PATCH`| `/api/patients/:pId/requests/:rId/reports/:id`| Radiologist | Updates or adds addendum to report. |

### 4.7 Facility Pricing
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/facilities/:facId/pricing` | Staff | Retrieves procedure pricing catalog. |
| `PUT` | `/api/facilities/:facId/pricing/:part`| Admin | Submits pending price update or approves pricing. |

### 4.8 System Logs & Audit Trail
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/logs` | SuperAdmin | Returns chronological append-only audit trail. |
| `POST` | `/api/logs` | System/Staff | Appends an audit log entry. Updates and deletes are forbidden. |

### 4.9 Patient Portal Verification
| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/portal/verify` | Public | Body: `{ mrn, accessCode }`. Validates patient and returns studies and reports. |

---

## 5. Storage Architecture (Replacing Supabase Storage)

Supabase Storage has been completely decoupled. The backend must implement a robust object storage layer for:
1. **DICOM files (`.dcm`)**: Multi-megabyte binary datasets.
2. **Ultrasound snapshots (`.jpg`, `.png`)**.
3. **Rendered report PDFs (`.pdf`)**.

### Storage Providers Supported
- **Production:** Amazon S3, Cloudflare R2, MinIO, or Google Cloud Storage.
- **Local Development:** Local disk in `./uploads` served via static express middleware.

### Upload & Retrieval Workflow
```
[Frontend Client] 
       |
       | 1. POST /api/storage/upload (multipart/form-data)
       v
[Backend API] 
       |
       | 2. Streams binary to S3/MinIO bucket (or saves to ./uploads)
       v
[Object Storage]
       |
       | 3. Returns { publicUrl, storagePath }
       v
[Frontend Client] 
       |
       | 4. Saves StudyImage metadata with publicUrl into database
```

### Critical DICOM Header & CORS Configuration
Medical viewers (Cornerstone.js) use Web Workers and `fetch()` with byte-range requests. Your storage server or reverse proxy **MUST** return:
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Content-Type
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
Accept-Ranges: bytes
Content-Type: application/dicom (or image/png, image/jpeg, application/pdf)
```

---

## 6. Security Specification: Defending the "Dirty Dozen"

The backend must enforce strict business invariants to prevent the 12 canonical exploit payloads:

| # | Vulnerability | Backend Enforcement Directive |
| :--- | :--- | :--- |
| 1 | **Identity Spoofing** | Verify `req.user.id === requestedUserId` in token middleware. Reject mismatched payloads. |
| 2 | **Privilege Escalation** | Ensure user cannot modify their own `role`. Role changes require `role === 'superadmin'`. |
| 3 | **Orphaned Request** | Validate that `patientId` exists and belongs to the active `facilityId` before creating request. |
| 4 | **Cross-Facility Leaks** | Always scope queries with `WHERE facility_id = req.user.facilityId` (unless user is `superadmin`). |
| 5 | **Unauthorized Reporting** | Only users with `role === 'radiologist'` can write to `/api/.../reports`. |
| 6 | **Shadow Field Injection**| Use strict schema validation (e.g. Zod, Joi) to strip undeclared attributes. |
| 7 | **Resource Poisoning** | Limit string lengths: `patientId` max 64 chars, names max 255 chars, request body limit 50MB. |
| 8 | **Bypassing Verification**| Disallow unverified email updates or fake admin emails without cryptographic tokens. |
| 9 | **Log Tampering** | The `system_logs` table must be **append-only**. Block `UPDATE` and `DELETE` at the SQL level via trigger or revoking privileges. |
| 10 | **State Shortcutting** | Enforce state machine transitions: Requests cannot jump from `Pending` directly to `Completed` without uploaded images and a finalized report. |
| 11 | **Metadata Tampering** | Do not allow clients to specify `createdAt` on updates; enforce database server timestamps (`NOW()`). |
| 12 | **Unauthenticated Write**| Enforce authentication middleware across all data-modifying endpoints except `/api/portal/verify`. |

---

## 7. Role-Based Access Control (RBAC) Matrix

| Endpoint / Action | SuperAdmin | FacilityAdmin | Radiologist | Radiographer | Sonographer | Receptionist |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Register Patient / Intake | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| View Patient Worklist | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload DICOM / Scans | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Write Ultrasound Worksheet| ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Author Radiology Report | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Finalize & Sign Report | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Modify Pricing Matrix | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve Pricing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View System Audit Logs | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 8. Development & Collaboration Workflow

### Running Locally
1. Start the unified development server:
   ```bash
   npm run dev
   ```
   This launches `server.ts` on port 3000, serving the Vite frontend alongside the backend API router.
2. To run the standalone backend independently:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

### Connecting to Real PostgreSQL
1. Open `backend/.env` and update `DATABASE_URL`:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/telepixels_db
   ```
2. Execute the schema:
   ```bash
   psql -d telepixels_db -f backend/src/database/schema.sql
   ```
3. Swap the `memoryDb` queries in `backend/src/routes/index.ts` with your preferred ORM/query builder (Drizzle, Prisma, or standard `pg` pool).

---

## 9. Conclusion

The codebase is completely clean of third-party cloud lock-in (Firebase/Supabase). The frontend is cleanly partitioned under `/frontend`, and the backend team has a dedicated workspace in `/backend` with all required schemas, routes, types, and security directives.
