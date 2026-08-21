-- Admin Google Calendars
-- Stores Google Calendar URLs/IDs for FYM admin users.
-- Multiple calendars per admin (primary + additional).

create table if not exists public.admin_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Primary',
  calendar_url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by admin user
create index if not exists idx_admin_calendars_user_id on public.admin_calendars(user_id);

-- Only one primary per user
create unique index if not exists idx_admin_calendars_one_primary
  on public.admin_calendars(user_id) where is_primary = true;

-- RLS: only FYM admins can read/write
alter table public.admin_calendars enable row level security;

create policy "FYM admins can view all admin calendars"
  on public.admin_calendars for select
  using (exists (select 1 from public.fym_admins where fym_admins.user_id = auth.uid()));

create policy "FYM admins can insert admin calendars"
  on public.admin_calendars for insert
  with check (exists (select 1 from public.fym_admins where fym_admins.user_id = auth.uid()));

create policy "FYM admins can update admin calendars"
  on public.admin_calendars for update
  using (exists (select 1 from public.fym_admins where fym_admins.user_id = auth.uid()));

create policy "FYM admins can delete admin calendars"
  on public.admin_calendars for delete
  using (exists (select 1 from public.fym_admins where fym_admins.user_id = auth.uid()));
