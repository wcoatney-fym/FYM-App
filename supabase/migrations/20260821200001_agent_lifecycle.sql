-- Agent Lifecycle table: single canonical source for agent status across FYM
-- Drives Daily Pulse, app access, and offboarding cascades
-- Charlie-approved 5-tier model: Pipeline → CRM Active → RTS → Producing → Terminated

-- ============================================================
-- 1. agent_lifecycle table
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_lifecycle (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (linked to portal)
  portal_agent_id     UUID NOT NULL UNIQUE,   -- logical FK → portal agents.id (cross-DB)
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  agency_id           UUID REFERENCES agencies(id),
  agency_name         TEXT,

  -- Lifecycle status: highest tier achieved (except terminated overrides all)
  lifecycle_status    TEXT NOT NULL DEFAULT 'pipeline'
    CHECK (lifecycle_status IN ('pipeline','crm_active','rts','producing','terminated')),

  -- Tier 1: Pipeline
  pipeline_stage      TEXT,                   -- current contracting stage (synced from portal)
  pipeline_entered_at TIMESTAMPTZ,
  app_access          BOOLEAN NOT NULL DEFAULT true,

  -- Tier 2: CRM Active (flag — can be set at any pipeline stage)
  crm_active          BOOLEAN NOT NULL DEFAULT false,
  crm_activated_at    TIMESTAMPTZ,
  ghl_contact_id      TEXT,                   -- GHL CRM contact reference

  -- Tier 3: RTS (driven by pipeline stage 'rts')
  rts_confirmed       BOOLEAN NOT NULL DEFAULT false,
  rts_at              TIMESTAMPTZ,
  checkin_active      BOOLEAN NOT NULL DEFAULT false,   -- drives Daily Pulse

  -- Tier 4: Producing (auto-detected from Max's DB)
  writing_number      TEXT,
  first_policy_at     TIMESTAMPTZ,
  is_producing        BOOLEAN NOT NULL DEFAULT false,

  -- Tier 5: Terminated
  terminated_at       TIMESTAMPTZ,
  termination_reason  TEXT,

  -- Offboarding tracking
  offboarding_steps   JSONB DEFAULT '[]'::jsonb,  -- tracks substep completion
  offboarding_complete BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at      TIMESTAMPTZ
);

-- Indexes for downstream consumers
CREATE INDEX IF NOT EXISTS idx_lifecycle_checkin
  ON agent_lifecycle (checkin_active) WHERE checkin_active = true;

CREATE INDEX IF NOT EXISTS idx_lifecycle_app_access
  ON agent_lifecycle (app_access) WHERE app_access = true;

CREATE INDEX IF NOT EXISTS idx_lifecycle_producing
  ON agent_lifecycle (is_producing) WHERE is_producing = true;

CREATE INDEX IF NOT EXISTS idx_lifecycle_writing_number
  ON agent_lifecycle (writing_number) WHERE writing_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_status
  ON agent_lifecycle (lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_lifecycle_agency
  ON agent_lifecycle (agency_id);

-- Updated-at trigger (uses moddatetime if available, otherwise manual trigger)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'moddatetime') THEN
    CREATE TRIGGER set_lifecycle_updated_at
      BEFORE UPDATE ON agent_lifecycle
      FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
  ELSE
    CREATE OR REPLACE FUNCTION set_lifecycle_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    CREATE TRIGGER set_lifecycle_updated_at
      BEFORE UPDATE ON agent_lifecycle
      FOR EACH ROW EXECUTE FUNCTION set_lifecycle_updated_at();
  END IF;
END
$$;

-- ============================================================
-- 2. Lifecycle audit log — tracks every status change
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_lifecycle_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_id    UUID NOT NULL REFERENCES agent_lifecycle(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,           -- 'status_change', 'crm_activated', 'rts_confirmed', 'terminated', 'offboarding_step', 'producing_detected'
  old_status      TEXT,
  new_status      TEXT,
  details         JSONB DEFAULT '{}'::jsonb,
  performed_by    TEXT,                    -- 'system', 'admin:<user_id>', 'sync'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_log_lifecycle
  ON agent_lifecycle_log (lifecycle_id);

CREATE INDEX IF NOT EXISTS idx_lifecycle_log_action
  ON agent_lifecycle_log (action);

-- ============================================================
-- 3. RLS policies — service_role full access, anon read-only
-- ============================================================
ALTER TABLE agent_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_lifecycle_log ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY lifecycle_service_all ON agent_lifecycle
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY lifecycle_log_service_all ON agent_lifecycle_log
  FOR ALL USING (auth.role() = 'service_role');

-- Anon/authenticated: read-only
CREATE POLICY lifecycle_read ON agent_lifecycle
  FOR SELECT USING (true);

CREATE POLICY lifecycle_log_read ON agent_lifecycle_log
  FOR SELECT USING (true);

-- ============================================================
-- 4. Terminated offboarding substeps in Contracting Pipeline
--    (Portal DB — added via Management API, not migration)
--    These are documented here for reference:
--
--    Stage: terminated
--    Substeps:
--      1. Remove from GHL CRM (manual)
--      2. Revoke app access (auto)
--      3. Remove from Daily Pulse (auto)
--      4. Remove from agency roster (auto)
--      5. Post Slack offboarding notice (auto)
--      6. Notify agency owner (manual)
--      7. Archive production data (manual)
-- ============================================================
