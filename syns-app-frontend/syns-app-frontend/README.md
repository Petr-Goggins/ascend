# Ascend

React, TypeScript, Vite, Supabase, and FastAPI fitness tracking application.

## Frontend setup

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```powershell
Set-Location syns-app-frontend\syns-app-frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.
The default Vite proxy forwards `/api` requests to `http://127.0.0.1:8000`.

Run the production build and type check with:

```powershell
npm run build
npx tsc --noEmit
```

## Backend setup

Requirements: Python 3.10+.

```powershell
Set-Location syns-app-backend\back\backend
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000
```

Set `OPENROUTER_API_KEY` in the backend `.env`. Configure `CORS_ORIGINS` as a
comma-separated allowlist for the deployed frontend origins. Health check:
`http://localhost:8000/health`; API documentation: `http://localhost:8000/docs`.

## Product catalog

Product search currently uses the user's Supabase catalog. If no local product
matches, add the item manually with its nutrition values. External supermarket
search attempts the configured VkusVill MCP endpoint first and falls back to
the local catalog and manual entry. Configure
`VITE_VKUSVILL_API_URL=https://mcp001.vkusvill.ru/mcp` in the frontend
environment; the backend accepts only the official VkusVill MCP hosts. The
MCP server currently replies with an OAuth authorization challenge when called
without an access token, so the URL alone may not authorize catalogue search.
Pyaterochka is not configured.

## Supabase

Apply the SQL migrations in `supabase/migrations` to the Supabase project before
using the application. The browser uses the public anon key; row-level security
must be enabled and policies applied for every user-owned table.

For a Supabase project that already has the earlier schema but is missing the
profile name, sleep date, nutrition diary, weight history, or chat table, apply
`supabase/migrations/20261005150000_repair_live_app_schema.sql` in the Supabase
SQL Editor (or apply pending migrations with the linked Supabase CLI). Reload
the app after the migration completes.

The coach assessment and body-measurement report require
`supabase/migrations/20261008090000_add_assessment_and_body_measurements.sql`.
Apply it before saving questionnaire data or body measurements. Calorie and
macro targets use the adult Mifflin–St Jeor estimate and are informational,
not medical advice.
