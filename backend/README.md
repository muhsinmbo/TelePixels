# TelePixels Backend — STANDARD BUILD (real Postgres, no mocks)

## Stack (free, no Docker needed)
| Need | Choice | Free tier |
|---|---|---|
| Postgres (local + shared testing anywhere) | **Neon** (`neon.tech`) | 3 projects, 0.5 GB each |
| File uploads (DICOM/images/PDFs) | Local disk `./uploads` | unlimited local |
| Object storage later (prod) | Cloudflare R2 | 10 GB free |
| Auth | bcrypt + JWT (own code, zero vendor) | free forever |

Why not Supabase: same Postgres power via Neon without the BaaS lock-in; storage stays a plain
disk folder locally and becomes R2 (S3 API) in prod — identical `GET /uploads/:file` shape.

## Neon setup (5 min, one time)
1. Sign up at `https://neon.tech` → New Project → name `telepixels`, region closest to you.
2. Dashboard → **Connection Details** → copy the **pooled** connection string. Keep `?sslmode=require`.
3. `Copy-Item .env.example .env`, then set:
   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx.aws.neon.tech/telepixels_db?sslmode=require
   JWT_SECRET=<32+ random hex: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   SEED_SUPERADMIN_EMAIL=admin@kingsimaging.org
   SEED_SUPERADMIN_PASSWORD=<strong temp password>
   ```
4. Migrate + seed:
   ```powershell
   cd backend
   npm install
   npm run db:seed
   ```
   Expected: `[seed] schema ok / superadmin ok / pricing ok / settings ok / DONE`.
5. Run:
   ```powershell
   npx tsx src/app.ts   # → http://localhost:4500/health
   ```
   Anyone, anywhere, points their own `DATABASE_URL` at the same Neon project and gets the same data.
   Change the superadmin password right after first login (`PATCH /api/users/superadmin-01`).

## Layout
```
backend/
├── src/
│   ├── app.ts                 # entry: CORS, /uploads static, /health, error handler
│   ├── database/
│   │   ├── schema.sql         # Postgres DDL (source of truth)
│   │   ├── db.ts              # pg Pool (Neon SSL auto), fail-fast, NO memory fallback
│   │   ├── migrate.ts         # npm run db:migrate (schema only)
│   │   ├── seed.ts            # npm run db:seed (schema + facility + superadmin + pricing)
│   │   └── memoryDb.ts        # LEGACY, unused by routes — delete after frontend migrates off compat.ts
│   ├── middleware/
│   │   ├── auth.ts            # requireAuth (JWT) + requireRole + facilityScope — no bypasses
│   │   ├── validate.ts        # allowlist validators (shadow-field / length / enum / state guards)
│   │   └── errors.ts          # { error } shape + audit() append-only logger
│   └── routes/
│       ├── index.ts           # aggregator only
│       ├── auth.ts            # login (bcrypt) / me / logout
│       ├── users.ts           # staff CRUD (admin provision, superadmin role changes)
│       ├── patients.ts        # intake CRUD (facility-scoped, mrn unique+immutable)
│       ├── requests.ts        # worklists (patient must exist; Completed only via report)
│       ├── images.ts          # study-image records (flips request → Images Uploaded)
│       ├── reports.ts         # radiology (radiologist-only) + ultrasound worksheets (sonographer)
│       ├── pricing.ts         # propose (admin) / approve (superadmin)
│       ├── system.ts          # settings/global + append-only logs (superadmin read)
│       ├── portal.ts          # public MRN+code verify (rate-limited) — the ONLY open route
│       └── storage.ts         # multer disk uploads → { publicUrl, storagePath }
└── scripts/test-api.ps1       # end-to-end workflow test, no frontend needed
```

## Test the whole workflow (no frontend)
```powershell
cd backend
$env:API='http://localhost:4500'; $env:EMAIL='admin@kingsimaging.org'; $env:PASS='<your seed password>'
.\scripts\test-api.ps1
```
Covers: health → login → me → bad-token 401 → patient → request → image →
request flips → report finalize → request Completed → portal verify → audit logs.

## API quick map
`POST /api/auth/login` · `GET /api/auth/me` · `GET/POST /api/users` · `PATCH/DELETE /api/users/:uid`
`GET/POST /api/patients` · `GET/PATCH/DELETE /api/patients/:id`
`GET /api/requests` · `GET/POST /api/patients/:pId/requests` · `GET/PATCH /api/patients/:pId/requests/:rId`
`GET/POST /api/patients/:pId/requests/:rId/images` · `POST /api/storage/upload`
`GET/POST/PATCH .../reports` (+ `:reportId`) · `GET/POST .../ultrasound-reports`
`GET/PUT /api/facilities/:facId/pricing/:partName` · `GET/PATCH /api/settings/global`
`GET/POST /api/logs` · `POST /api/portal/verify` (public)

## AI-assisted reporting (human-in-the-loop, key-optional)
The model only sees what the controlled tools return — never the database
(`backend/src/ai/tools.ts` maps 1:1 to future MCP tools). Every AI call is audited.
Without `GEMINI_API_KEY` (free at `https://aistudio.google.com/apikey`), data routes
work and `/ai/draft` returns the template structure; model routes answer `503`.

`GET /api/ai/context?patientId=&requestId=` · `GET /api/ai/templates?modality=&examination=&sex=`
`GET /api/ai/previous-reports?patientId=&excludeRequestId=` (secondary history, never primary)
`POST /api/ai/draft { patientId, requestId }` (structure skeleton, no invented findings)
`POST /api/ai/polish { patientId, requestId, findings, includePrevious? }` (Findings + Impression)
Draft/polish require `radiologist` or `sonographer` role. The clinician always reviews and finalizes.
