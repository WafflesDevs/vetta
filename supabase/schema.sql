-- Run this in Supabase: SQL Editor → New query → Paste → Run

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  target_roles text default '',
  locations text default '',
  goals text default '',
  resume_text text default '',
  resume_filename text default '',
  plan text default 'free',
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Existing DBs created before plan / Stripe columns were added:
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists stripe_customer_id text;
-- Optional: unique index for webhook lookups by Stripe customer
create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists chats_user_id_idx on public.chats(user_id);
create index if not exists messages_chat_id_idx on public.messages(chat_id);

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

-- Profiles: users can only see/edit their own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Chats
create policy "chats_select_own" on public.chats
  for select using (auth.uid() = user_id);
create policy "chats_insert_own" on public.chats
  for insert with check (auth.uid() = user_id);
create policy "chats_update_own" on public.chats
  for update using (auth.uid() = user_id);
create policy "chats_delete_own" on public.chats
  for delete using (auth.uid() = user_id);

-- Messages
create policy "messages_select_own" on public.messages
  for select using (auth.uid() = user_id);
create policy "messages_insert_own" on public.messages
  for insert with check (auth.uid() = user_id);
create policy "messages_delete_own" on public.messages
  for delete using (auth.uid() = user_id);

-- When someone signs up, make an empty profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Jobright-style job tracking
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
