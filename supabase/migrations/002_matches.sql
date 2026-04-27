-- Migration 002: Match logging and skip tracking

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_1_id uuid not null references public.profiles(id),
  user_2_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;

-- Only service role or admins can read/write logs directly for all users
-- Users may read their own logs
create policy "Users can read their own match logs"
  on public.matches for select
  using (auth.uid() = user_1_id or auth.uid() = user_2_id);

create table if not exists public.skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  skipped_at timestamptz not null default now()
);

alter table public.skips enable row level security;

create policy "Users can read their own skip logs"
  on public.skips for select
  using (auth.uid() = user_id);

-- RPC function to log match (more convenient for server / client)
create or replace function public.log_match_data(
  p_user_1_id uuid,
  p_user_2_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds int
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.matches (user_1_id, user_2_id, started_at, ended_at, duration_seconds)
  values (p_user_1_id, p_user_2_id, p_started_at, p_ended_at, p_duration_seconds);
end;
$$;

create or replace function public.log_skip(
  p_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.skips (user_id)
  values (p_user_id);
end;
$$;
