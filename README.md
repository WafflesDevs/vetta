# Vetta

Career coach app I built for job search: chat with an AI coach, browse live roles, practice interview questions, and edit your resume as a real PDF.

<p align="center">
  <img src="docs/screenshots/landing.png" alt="Vetta landing page" width="900" />
</p>

## What’s inside

| Area | What it does |
|------|----------------|
| **Chat** | Streaming coach for job market questions, fit scores, rewrites, cover letters |
| **Jobs** | Recommended / Liked / Applied / External hub (Adzuna first, free tier) |
| **Interview Quiz** | MCQs grounded in your resume and goals |
| **Resume** | Tell it what to change; preview is the actual multi-page PDF; download when ready |
| **Settings / Plans** | Preferences, upload, Free plan chip; paid tiers TBA |

<p align="center">
  <img src="docs/screenshots/features.png" alt="Features page with live previews" width="900" />
</p>

## Stack

- FastAPI + LangChain / LangGraph (`gpt-4o-mini`)
- React (Vite) UI, served from the same Render service in production
- Supabase auth + Postgres
- Jobs: Adzuna → JSearch → Tavily (Apify off by default)
- LangSmith tracing optional

## Run locally

```bash
cp .env.example .env
# fill OpenAI, Supabase, Tavily, Adzuna, LangSmith

uv sync
uv run uvicorn app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```

Open http://localhost:5173

Supabase: run `supabase/schema.sql` (and `job_saves.sql` if you need likes/applied). For local signup, turn off email confirm in Auth settings.

## Deploy on Render (free)

This repo is set up for **one free Web Service** via `render.yaml`.

1. Push to GitHub (see below)
2. [Render](https://dashboard.render.com) → **New** → **Blueprint** → select this repo
3. Confirm plan is **Free**
4. Paste env vars (same names as `.env.example`). Required: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, plus Adzuna / Tavily / LangSmith as you use them
5. Deploy. Health check: `/api/health`
6. In Supabase Auth → URL config, add `https://YOUR-APP.onrender.com`

Free Render sleeps after idle; first hit can take ~30s.

<p align="center">
  <img src="docs/screenshots/pricing.png" alt="Plans page" width="900" />
</p>

## Env

See `.env.example`. Never commit `.env`.

## Layout

```
app/           API + agent + resume PDF
frontend/      React app
supabase/      SQL
render.yaml    Free-tier Blueprint
docs/screenshots/
```

Built by [WafflesDevs](https://github.com/WafflesDevs).
