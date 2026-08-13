-- recruiting_stage_transitions: tracks every stage change for every recruiting contact
-- This is the backbone for date-filtered pipeline counts.
-- When the date filter is "This Month", we count contacts that entered a stage during that period.

CREATE TABLE IF NOT EXISTS recruiting_stage_transitions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id       uuid REFERENCES recruiting_leads(id) ON DELETE CASCADE,
  ghl_contact_id text NOT NULL,
  stage         text NOT NULL,           -- lead, attendee, hired, contracting, rts, producing, lost
  condition     text NOT NULL DEFAULT 'manual', -- tag_applied, pipeline_move, manual, backfill, auto_lost, re_entry
  previous_stage text,                   -- what stage they were in before
  metadata      jsonb DEFAULT '{}',      -- flexible: tag name, pipeline stage name, lost_reason, etc.
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for date-range queries (the primary use case)
CREATE INDEX idx_rst_stage_occurred ON recruiting_stage_transitions (stage, occurred_at);
CREATE INDEX idx_rst_lead_id ON recruiting_stage_transitions (lead_id);
CREATE INDEX idx_rst_ghl_contact ON recruiting_stage_transitions (ghl_contact_id);
CREATE INDEX idx_rst_occurred ON recruiting_stage_transitions (occurred_at);

-- RLS: authenticated users can read
ALTER TABLE recruiting_stage_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON recruiting_stage_transitions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON recruiting_stage_transitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- recruiting_backfill_log: tracks one-time backfill operations for CRM Command
CREATE TABLE IF NOT EXISTS recruiting_backfill_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title         text NOT NULL,
  description   text NOT NULL,
  backfill_type text NOT NULL,           -- writing_number, stage_sync, etc.
  status        text NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  stats         jsonb DEFAULT '{}',      -- { matched: 45, fuzzy: 12, unmatched: 8, total: 65 }
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id)
);

ALTER TABLE recruiting_backfill_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON recruiting_backfill_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON recruiting_backfill_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- lost_settings: configurable Lost parameters (threshold days, per-stage overrides)
CREATE TABLE IF NOT EXISTS recruiting_lost_settings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  setting_key   text UNIQUE NOT NULL,    -- e.g. 'default_threshold_days', 'stage:lead:threshold_days'
  setting_value text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id)
);

ALTER TABLE recruiting_lost_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON recruiting_lost_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON recruiting_lost_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default Lost threshold
INSERT INTO recruiting_lost_settings (setting_key, setting_value)
VALUES ('default_threshold_days', '60')
ON CONFLICT (setting_key) DO NOTHING;

-- Add writing_number collection point to recruiting_leads
-- (gathered during contracting, not intake)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recruiting_leads' AND column_name = 'writing_number_source'
  ) THEN
    ALTER TABLE recruiting_leads ADD COLUMN writing_number_source text;
    COMMENT ON COLUMN recruiting_leads.writing_number_source IS 'How the WN was obtained: contracting, backfill_exact, backfill_fuzzy, manual';
  END IF;
END $$;

-- Unique constraint on ghl_contact_id for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS recruiting_leads_ghl_contact_id_key
  ON recruiting_leads (ghl_contact_id);

-- Make lead_at nullable (contracting-only contacts may not have a lead date)
ALTER TABLE recruiting_leads ALTER COLUMN lead_at DROP NOT NULL;

-- View: date-filtered pipeline counts from the stage transition log
CREATE OR REPLACE VIEW recruiting_pipeline_by_period AS
SELECT
  stage,
  date_trunc('day', occurred_at) AS day,
  date_trunc('month', occurred_at) AS month,
  count(DISTINCT ghl_contact_id) AS contact_count
FROM recruiting_stage_transitions
WHERE condition != 'auto_lost'
GROUP BY stage, date_trunc('day', occurred_at), date_trunc('month', occurred_at);

-- RPC: cumulative pipeline counts (avoids Supabase JS client 1K row cap)
-- Each stage counts everyone who reached that level OR beyond.
-- e.g. "attendees" includes attended + hired + contracting + rts + producing
CREATE OR REPLACE FUNCTION get_pipeline_counts(
  start_date timestamptz DEFAULT '2026-02-01T00:00:00.000Z',
  end_date   timestamptz DEFAULT NULL
) RETURNS TABLE(stage text, contact_count bigint)
LANGUAGE sql STABLE AS $$
  WITH stage_contacts AS (
    SELECT DISTINCT ghl_contact_id, stage
    FROM recruiting_stage_transitions
    WHERE condition != 'auto_lost'
      AND occurred_at >= start_date
      AND (end_date IS NULL OR occurred_at <= end_date)
  ),
  highest_stage AS (
    SELECT ghl_contact_id,
      CASE
        WHEN bool_or(stage = 'producing')   THEN 6
        WHEN bool_or(stage = 'rts')         THEN 5
        WHEN bool_or(stage = 'contracting') THEN 4
        WHEN bool_or(stage = 'hired')       THEN 3
        WHEN bool_or(stage = 'attendee')    THEN 2
        WHEN bool_or(stage = 'lead')        THEN 1
        ELSE 0
      END AS max_stage
    FROM stage_contacts
    GROUP BY ghl_contact_id
  )
  SELECT s.stage, COUNT(*) as contact_count
  FROM (
    VALUES ('lead', 1), ('attendee', 2), ('hired', 3),
           ('contracting', 4), ('rts', 5), ('producing', 6)
  ) AS s(stage, ord)
  CROSS JOIN highest_stage h
  WHERE h.max_stage >= s.ord
  GROUP BY s.stage, s.ord
  ORDER BY s.ord;
$$;
