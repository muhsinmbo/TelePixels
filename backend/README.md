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
   npx tsx src/app.ts   # → http://localhost:4000/health
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
  │   │   └── (no mocks — deleted memoryDb.ts / compat.ts; every read/write is Postgres)
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

## Demo data (team click-through + hackathon)
```powershell
npm run db:seed:demo   # idempotent: skips existing, resets demo requests to Pending
npm run db:wipe:demo   # removes exactly the demo rows, never touches real data
```
Staff (all password `Demo123!`, override with `DEMO_PASSWORD=`):
`radiologist@` / `sonographer@` / `radiographer@` / `receptionist@kingsimaging.org`.
Showcase patients: **Amina Yusuf 32F pelvic US** (live AI-demo case, `DEMO-0001`/`AMINA1`),
Kwame Mensah 55M urgent chest X-ray, Efua Owusu 28F obstetric US, Yaw Boateng 40M with a
completed history report + fresh study (previous-reports demo, `DEMO-0004`/`YAW004`).

## Sessions (hotel key cards)
Access tokens live 15 minutes (`ACCESS_TOKEN_TTL`); refresh tokens 30 days
(`REFRESH_TOKEN_TTL_DAYS`), rotate on every use, and reusing a dead token burns
the whole chain. `POST /api/auth/refresh` is public (body token);
`POST /api/auth/revoke` kills one or all sessions. The frontend retries once
after silent refresh, so users never notice rotation.

## Storage (Backblaze B2 live)
`STORAGE_DRIVER=s3` + `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY`
(bucket `telepixel`, eu-central). Uploads `PutObject` by key; only the key is
stored in Postgres; reads return fresh presigned URLs (private bucket, expiring
links, no stale URLs). Deleting an image record deletes its object too.
`STORAGE_DRIVER=local` keeps the `./uploads` fallback with identical API shape.

## Hardening (P2)
- **Headers**: helmet (CORP cross-origin so split-mode frontends render uploads).
- **Rate limits**: 300/15min global, 30/15min login, 30/min portal (`RATE_LIMIT_*` overrides, `TRUST_PROXY=true` behind a proxy).
- **Pagination**: lists take `?limit=` (default 200, max 500) `&offset=`.
- **Tests**: `npm test` — 13 unit checks (validators, auth gate, pagination, meta), no DB needed. CI runs backend + frontend typecheck, tests, and build on every push.
- **Docs**: `GET /api/docs` — full endpoint catalogue, public.

## Test the whole workflow (no frontend)
```powershell
cd backend
$env:API='http://localhost:4000'; $env:EMAIL='admin@kingsimaging.org'; $env:PASS='<your seed password>'
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

## MCP server (the 3 controlled tools, real MCP protocol)
```powershell
npm run mcp   # stdio server: get_study_context, get_reporting_template, get_relevant_previous_reports
```
Same functions as `/api/ai/*`, audited as `mcp-service`. Add to any MCP client:
```json
{ "mcpServers": { "telepixels": {
  "command": "npx", "args": ["tsx", "src/mcp/server.ts"], "cwd": "<repo>/backend" } } }
```
