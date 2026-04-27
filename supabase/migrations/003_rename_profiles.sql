-- Migration 003: Rename profiles columns

alter table public.profiles
  rename column declared_gender to gender;

alter table public.profiles
  rename column interested_in to seeking;

-- Update RLS policies (though they use auth.uid() = id, column references are fine)
-- If there were column-specific checks, we'd update them here.
-- The check constraints are automatically preserved with the renamed columns.
