# TelePixels Backend Workspace

Welcome to the backend workspace for **TelePixels**!
All Firebase and Supabase dependencies have been completely removed from this repository. The frontend has been cleanly grouped in `/frontend` and decoupled via a clean REST/Storage API client in `frontend/src/api/`.

## Directory Overview
```
backend/
├── src/
│   ├── database/
│   │   ├── schema.sql      # Full PostgreSQL schema with DDL, constraints & indexes
│   │   └── memoryDb.ts     # In-memory mock engine with default seed data
│   ├── routes/
│   │   └── index.ts        # Modular Express REST API routes
│   └── app.ts              # Standalone Express app entry point
├── .env.example            # Environment variables template
├── package.json            # Backend dependencies and scripts
└── tsconfig.json           # Backend TypeScript configuration
```

## Quick Start for Backend Collaborators
1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Run the PostgreSQL schema:
   ```bash
   psql -d telepixels_db -f src/database/schema.sql
   ```
4. Start backend in development mode:
   ```bash
   npm run dev
   ```

Refer to `/BACKEND_DIRECTIVES.md` at the project root for the complete API catalog, payload schemas, storage architecture, and RBAC matrix.
