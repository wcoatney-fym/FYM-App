-- Add reconciliation tracking columns to agency_rosters
-- Part of the FYM Direct roster reconciliation project

-- termination_date: when the agent was terminated (date only, no time)
ALTER TABLE agency_rosters
  ADD COLUMN IF NOT EXISTS termination_date date;

-- termination_reason: why the agent was terminated (free text)
ALTER TABLE agency_rosters
  ADD COLUMN IF NOT EXISTS termination_reason text;

-- status_changed_at: when the status field was last changed
ALTER TABLE agency_rosters
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- status_changed_by: who/what changed the status (user id or batch identifier)
ALTER TABLE agency_rosters
  ADD COLUMN IF NOT EXISTS status_changed_by text;

-- Backfill status_changed_at for the 9 existing terminated rows
UPDATE agency_rosters
  SET status_changed_at = updated_at
  WHERE status = 'terminated'
    AND status_changed_at IS NULL;

-- Index on status for the roster-map filter (.eq('status', 'active'))
CREATE INDEX IF NOT EXISTS idx_agency_rosters_status
  ON agency_rosters (status);
