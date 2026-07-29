-- EXTRA: run this if you already ran schema.sql once
-- Jobright-style Liked / Applied / External tracking

create table if not exists public.job_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('liked', 'applied', 'external')),
  title text default '',
  company text default '',
  location text default '',
  salary text default '',
  url text not null,
  description text default '',
  job_type text default '',
  posted_at text default '',
  created_at timestamptz default now(),
  unique (user_id, url)
);

create index if not exists job_saves_user_status_idx
  on public.job_saves(user_id, status);

alter table public.job_saves enable row level security;

create policy "job_saves_select_own" on public.job_saves
  for select using (auth.uid() = user_id);
create policy "job_saves_insert_own" on public.job_saves
  for insert with check (auth.uid() = user_id);
create policy "job_saves_update_own" on public.job_saves
  for update using (auth.uid() = user_id);
create policy "job_saves_delete_own" on public.job_saves
  for delete using (auth.uid() = user_id);
