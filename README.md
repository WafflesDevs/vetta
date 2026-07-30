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
| **Settings / Plans** | Preferences, upload, Stripe Checkout for Expert/Pro, Customer Portal |

<p align="center">
  <img src="docs/screenshots/features.png" alt="Features page with live previews" width="900" />
</p>

## Stack

- FastAPI + LangChain / LangGraph (`claude-sonnet-4-5`)
- React (Vite) UI, served from the same Render service in production
- Supabase auth + Postgres
- Jobs: Adzuna → JSearch → Tavily (Apify off by default)
- Stripe Checkout + Customer Portal (subscriptions)
- LangSmith tracing optional

## Run locally

```bash
cp .env.example .env
# fill Anthropic, Supabase, Tavily, Adzuna, LangSmith, Stripe

uv sync
uv run uvicorn app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```

Open http://localhost:5173

Supabase: run `supabase/schema.sql` (and `job_saves.sql` if you need likes/applied). For local signup, turn off email confirm in Auth settings.

### Stripe (test mode)

1. Put `STRIPE_SECRET_KEY`, product/price IDs, and `APP_URL=http://localhost:5173` in `.env`.
2. Ensure Supabase has `profiles.plan` (+ optional `stripe_customer_id`):

```sql
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists stripe_customer_id text;
```

3. Forward webhooks locally:

```bash
stripe listen --forward-to localhost:8000/api/stripe/webhook
```

Copy the printed `whsec_…` into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the API.

4. In the app: **Plans** or **Pricing** → Upgrade to Expert/Pro. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. Webhook (and `POST /api/stripe/sync` on checkout success / Plans / Settings) sets `profiles.plan` to `careerexpert` or `careerpro`. Cancel via **Settings → Manage subscription** (Customer Portal); returning to Settings syncs back to `free` and deletes that user’s chats/messages (resume + prefs kept). Upgrading switches the existing Stripe subscription in place (no double charge).

Endpoints: `POST /api/stripe/checkout`, `POST /api/stripe/portal`, `POST /api/stripe/sync`, `POST /api/stripe/webhook`. Requires `SUPABASE_SECRET_KEY` (service role) so plan writes bypass RLS.

## Deploy on Render (free)

This repo is set up for **one free Web Service** via `render.yaml`.

1. Push to GitHub (see below)
2. [Render](https://dashboard.render.com) → **New** → **Blueprint** → select this repo
3. Confirm plan is **Free**
4. Paste env vars (same names as `.env.example`). Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, plus Adzuna / Tavily / LangSmith as you use them
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
