-- Run in Supabase SQL Editor. Enable Anonymous sign-ins under Authentication → Providers.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  gender text not null
    check (gender in ('male', 'female', 'other')),
  birth_year int not null
    check (
      birth_year >= 1900
      and birth_year <= extract(year from current_date)::int
    ),
  seeking text not null
    check (seeking in ('male', 'female', 'both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Allow users to read their profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Allow users to insert their profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Allow users to update their profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
