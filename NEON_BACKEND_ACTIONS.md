# Neon backend actions required from your friend

This project is already wired to a backend-compatible adapter in the frontend. The remaining work for the Neon backend is outside the app code and must be done in the database / deployment environment.

## 1) Use the correct Neon database URL

In the Neon dashboard, make sure the project has a live Postgres branch and copy the connection string into:

- backend/.env

Required values:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
JWT_SECRET="<32+ character secret>"
PORT=4500
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001
```

Important:
- The frontend was configured to talk to port 4500 locally.
- The backend app is already set up to run on 4500 and accept local Vite origins.

## 2) Run the database migration

From the backend folder:

```bash
cd backend
npm install
npm run db:migrate
```

This creates the schema used by the app, including users, patients, requests, reports, system settings, refresh tokens, and AI-related tables.

## 3) Seed the first superadmin account

Run:

```bash
npm run db:seed
```

Default seeded credentials:

```text
Email: admin@kingsimaging.org
Password: ChangeMe123!
```

After login, change the password immediately.

## 4) Validate the backend health

Test the service:

```bash
npm run dev
```

Then confirm:

```bash
curl http://localhost:4500/health
```

Expected response:

```json
{ "status": "ok", "service": "telepixels-backend" }
```

## 5) Validate login from the frontend

Once the backend is running, test the login endpoint with the seeded admin account.

If it succeeds, the frontend is compatible with the backend as-is.

## 6) Notes

- No Firebase database or Firebase project is required for the current app flow.
- The app uses a backend-compatible adapter layer in the frontend rather than direct Firebase calls.
- If this is being deployed to a real environment, the backend should still be run behind HTTPS and the Neon origin/CORS list should be updated to the production frontend URL.
