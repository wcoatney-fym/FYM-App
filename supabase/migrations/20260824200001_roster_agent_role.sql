-- Add role column to agency_rosters for Manager/Admin assignment
ALTER TABLE public.agency_rosters
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'agent'
  CHECK (role IN ('agent', 'manager', 'admin'));

-- Backfill: set existing is_manager=true rows to 'manager'
UPDATE public.agency_rosters SET role = 'manager' WHERE is_manager = true AND role = 'agent';

-- Comment
COMMENT ON COLUMN public.agency_rosters.role IS 'Agent role: agent (default), manager, or admin';
