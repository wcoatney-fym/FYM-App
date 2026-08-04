-- Manager Notes: managers/admins can leave notes on policies or agents.
-- Notes are visible to the agent and audit-logged per PRD spec.

create table if not exists public.manager_notes (
  id uuid primary key default gen_random_uuid(),
  -- Who wrote the note
  author_id uuid not null references auth.users(id),
  author_name text,
  -- Target: either a policy_number, an agent writing_number, or both
  policy_number text,
  agent_writing_number text,
  agent_name text,
  -- Note content
  body text not null,
  -- Whether the agent was notified immediately
  notify_agent boolean not null default true,
  -- Agent acknowledgement
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete
  deleted_at timestamptz,

  -- At least one target must be set
  constraint manager_notes_target_check check (
    policy_number is not null or agent_writing_number is not null
  )
);

-- Indexes for common lookups
create index if not exists idx_manager_notes_policy on public.manager_notes(policy_number) where deleted_at is null;
create index if not exists idx_manager_notes_agent on public.manager_notes(agent_writing_number) where deleted_at is null;
create index if not exists idx_manager_notes_author on public.manager_notes(author_id) where deleted_at is null;
create index if not exists idx_manager_notes_created on public.manager_notes(created_at desc) where deleted_at is null;

-- RLS
alter table public.manager_notes enable row level security;

-- Managers and admins can read all notes
create policy "Authenticated users can read notes"
  on public.manager_notes for select
  to authenticated
  using (deleted_at is null);

-- Managers and admins can insert notes
create policy "Authenticated users can insert notes"
  on public.manager_notes for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Authors can update their own notes
create policy "Authors can update own notes"
  on public.manager_notes for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Agents can acknowledge notes targeted at them (update acknowledged_at)
create policy "Agents can acknowledge notes"
  on public.manager_notes for update
  to authenticated
  using (deleted_at is null)
  with check (acknowledged_by = auth.uid());
