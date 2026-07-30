-- Expand atrisk_status enum to match the Activity Tracker's 8-stage manager pipeline.
-- Existing values: new, assigned, contacted, saved, lost
-- Adding: responded, manager_outreach, agent_outreach, code_red, agent_saved_pending
-- Table is currently empty so no data migration needed.

ALTER TYPE atrisk_status ADD VALUE IF NOT EXISTS 'responded' AFTER 'new';
ALTER TYPE atrisk_status ADD VALUE IF NOT EXISTS 'manager_outreach' AFTER 'responded';
ALTER TYPE atrisk_status ADD VALUE IF NOT EXISTS 'agent_outreach' AFTER 'manager_outreach';
ALTER TYPE atrisk_status ADD VALUE IF NOT EXISTS 'code_red' AFTER 'agent_outreach';
ALTER TYPE atrisk_status ADD VALUE IF NOT EXISTS 'agent_saved_pending' AFTER 'code_red';

-- Add notes column for stage transition context
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS notes text;

-- Add stage transition timestamp tracking
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz DEFAULT now();
