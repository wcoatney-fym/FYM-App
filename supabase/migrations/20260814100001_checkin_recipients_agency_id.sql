-- Add agency_id to checkin_recipients for manager-scoped Daily Pulse queries.
-- Backfill from agency_rosters join (portal_agent_id → agency_rosters.id → agency_id).
-- Remaining NULLs will be backfilled by name matching.

ALTER TABLE checkin_recipients
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id);

-- Backfill via portal_agent_id → agency_rosters
UPDATE checkin_recipients cr
SET agency_id = ar.agency_id
FROM agency_rosters ar
WHERE cr.portal_agent_id = ar.id
  AND cr.agency_id IS NULL
  AND ar.agency_id IS NOT NULL;

-- Backfill remaining by name match (case-insensitive)
UPDATE checkin_recipients cr
SET agency_id = ar.agency_id
FROM agency_rosters ar
WHERE lower(cr.first_name) = lower(ar.first_name)
  AND lower(cr.last_name) = lower(ar.last_name)
  AND cr.agency_id IS NULL
  AND ar.agency_id IS NOT NULL;

-- Index for scoped queries
CREATE INDEX IF NOT EXISTS idx_checkin_recipients_agency_id
  ON checkin_recipients(agency_id) WHERE active = true;
