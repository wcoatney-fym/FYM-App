-- Phase 1: at-risk workboard
-- Stores task assignment state, status, and notes for at-risk policies.
-- Raw policy data lives in the tracker DB (lryxx); this table owns the workflow layer only.

create type public.atrisk_status as enum ('new', 'assigned', 'contacted', 'saved', 'lost');

create table public.atrisk_tasks (
  id              uuid primary key default gen_random_uuid(),
  policy_number   text not null,          -- FK by value to tracker DB form_submissions.policy_number
  agency_id       text not null,          -- agency slug
  assigned_to     uuid references public.profiles(id) on delete set null,
  assigned_by     uuid references public.profiles(id) on delete set null,
  status          public.atrisk_status not null default 'new',
  flag_type       text,                   -- 'payment_failed' | 'no_contact' | 'rate_action' | etc.
  due_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.atrisk_tasks(agency_id);
create index on public.atrisk_tasks(assigned_to);
create index on public.atrisk_tasks(policy_number);
create index on public.atrisk_tasks(status);

create table public.atrisk_notes (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.atrisk_tasks(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index on public.atrisk_notes(task_id);

-- RLS
alter table public.atrisk_tasks enable row level security;
alter table public.atrisk_notes enable row level security;

-- Admins: full access
create policy "atrisk_tasks: admin all"
  on public.atrisk_tasks for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Managers: see and edit their agency's tasks
create policy "atrisk_tasks: manager agency"
  on public.atrisk_tasks for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'manager'
        and p.agency_id = atrisk_tasks.agency_id
    )
  );

-- Agents: see only tasks assigned to them
create policy "atrisk_tasks: agent assigned"
  on public.atrisk_tasks for select
  using (assigned_to = auth.uid());

-- Agents: update status on their own tasks
create policy "atrisk_tasks: agent update own"
  on public.atrisk_tasks for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- Notes: same agency access pattern
create policy "atrisk_notes: admin all"
  on public.atrisk_notes for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "atrisk_notes: manager agency"
  on public.atrisk_notes for all
  using (
    exists (
      select 1 from public.profiles p
      join public.atrisk_tasks t on t.id = atrisk_notes.task_id
      where p.id = auth.uid()
        and p.role = 'manager'
        and p.agency_id = t.agency_id
    )
  );

create policy "atrisk_notes: agent task"
  on public.atrisk_notes for all
  using (
    exists (
      select 1 from public.atrisk_tasks t
      where t.id = atrisk_notes.task_id
        and t.assigned_to = auth.uid()
    )
  );

-- updated_at trigger
create trigger atrisk_tasks_updated_at
  before update on public.atrisk_tasks
  for each row execute procedure public.set_updated_at();
