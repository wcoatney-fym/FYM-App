-- Recruiting Pipeline — Agent recruiting funnel tracking
-- Flow: FB Ad → Lead → Attendee → Hired → Contracting → RTS → Producing
-- Each lead tracks stage transitions with timestamps for time-in-stage analytics

-- ── Recruiting Leads (Agent Pipeline) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiting_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  stage TEXT NOT NULL DEFAULT 'lead',       -- lead, attendee, hired, contracting, rts, producing, lost
  campaign_id TEXT REFERENCES recruiting_campaigns(id) ON DELETE SET NULL,
  ad_set_id TEXT REFERENCES recruiting_ad_sets(id) ON DELETE SET NULL,
  npn TEXT,                                  -- NPN gathered during onboarding
  writing_number TEXT,                       -- Writing number once contracting completes
  -- Stage transition timestamps
  lead_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attendee_at TIMESTAMPTZ,
  hired_at TIMESTAMPTZ,
  contracting_at TIMESTAMPTZ,
  rts_at TIMESTAMPTZ,
  producing_at TIMESTAMPTZ,                  -- First sale date
  lost_at TIMESTAMPTZ,
  lost_stage TEXT,                            -- Stage at which they dropped
  lost_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recruiting_leads_stage ON recruiting_leads(stage);
CREATE INDEX IF NOT EXISTS idx_recruiting_leads_campaign ON recruiting_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recruiting_leads_lead_at ON recruiting_leads(lead_at);
CREATE INDEX IF NOT EXISTS idx_recruiting_leads_npn ON recruiting_leads(npn) WHERE npn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruiting_leads_writing_number ON recruiting_leads(writing_number) WHERE writing_number IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE recruiting_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read recruiting_leads"
  ON recruiting_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access recruiting_leads"
  ON recruiting_leads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Funnel summary view (date-filterable via WHERE on lead_at) ─────────────
CREATE OR REPLACE VIEW recruiting_funnel_summary AS
SELECT
  COUNT(*) FILTER (WHERE stage != 'lost') AS total_leads,
  COUNT(*) FILTER (WHERE stage IN ('attendee','hired','contracting','rts','producing') OR attendee_at IS NOT NULL) AS attendees,
  COUNT(*) FILTER (WHERE stage IN ('hired','contracting','rts','producing') OR hired_at IS NOT NULL) AS hired,
  COUNT(*) FILTER (WHERE stage IN ('contracting','rts','producing') OR contracting_at IS NOT NULL) AS contracting,
  COUNT(*) FILTER (WHERE stage IN ('rts','producing') OR rts_at IS NOT NULL) AS rts,
  COUNT(*) FILTER (WHERE stage = 'producing' OR producing_at IS NOT NULL) AS producing,
  COUNT(*) FILTER (WHERE stage = 'lost') AS lost,
  -- Avg days between stages (for leads that have passed through)
  ROUND(AVG(EXTRACT(EPOCH FROM (attendee_at - lead_at)) / 86400) FILTER (WHERE attendee_at IS NOT NULL), 1) AS avg_days_lead_to_attendee,
  ROUND(AVG(EXTRACT(EPOCH FROM (hired_at - attendee_at)) / 86400) FILTER (WHERE hired_at IS NOT NULL AND attendee_at IS NOT NULL), 1) AS avg_days_attendee_to_hired,
  ROUND(AVG(EXTRACT(EPOCH FROM (contracting_at - hired_at)) / 86400) FILTER (WHERE contracting_at IS NOT NULL AND hired_at IS NOT NULL), 1) AS avg_days_hired_to_contracting,
  ROUND(AVG(EXTRACT(EPOCH FROM (rts_at - contracting_at)) / 86400) FILTER (WHERE rts_at IS NOT NULL AND contracting_at IS NOT NULL), 1) AS avg_days_contracting_to_rts,
  ROUND(AVG(EXTRACT(EPOCH FROM (producing_at - rts_at)) / 86400) FILTER (WHERE producing_at IS NOT NULL AND rts_at IS NOT NULL), 1) AS avg_days_rts_to_producing,
  ROUND(AVG(EXTRACT(EPOCH FROM (rts_at - lead_at)) / 86400) FILTER (WHERE rts_at IS NOT NULL), 1) AS avg_days_lead_to_rts,
  ROUND(AVG(EXTRACT(EPOCH FROM (producing_at - lead_at)) / 86400) FILTER (WHERE producing_at IS NOT NULL), 1) AS avg_days_lead_to_first_sale
FROM recruiting_leads;
