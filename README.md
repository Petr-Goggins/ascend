# Ascend

Fitness tracking application: React, TypeScript, Vite, Supabase, and FastAPI.

## Frontend

```powershell
Set-Location syns-app-frontend\syns-app-frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the local `.env`.
The development server proxies `/api` to `http://127.0.0.1:8000`.

## Backend

```powershell
Set-Location syns-app-backend\back\backend
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000
```

Configure `OPENROUTER_API_KEY` in the local backend `.env`. Set `CORS_ORIGINS`
to a comma-separated allowlist for the frontend origins used in each deployment.
Health check: `http://localhost:8000/health`; API docs: `http://localhost:8000/docs`.

The product catalog currently supports Supabase local search and manual entry.
External supermarket search is unavailable until official provider access is configured.