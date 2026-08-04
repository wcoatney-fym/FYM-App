-- Recruiting / Meta Ads tables
-- Stores campaign, ad set, and daily spend data synced from Meta Marketing API

-- ── Campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiting_campaigns (
  id TEXT PRIMARY KEY,                    -- Meta campaign ID
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- ACTIVE, PAUSED, DELETED, ARCHIVED
  objective TEXT,
  daily_budget_cents BIGINT,              -- in cents (Meta returns cents string)
  lifetime_budget_cents BIGINT,
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  -- Aggregate metrics (updated on each sync)
  total_spend NUMERIC(12,2) DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks BIGINT DEFAULT 0,
  total_leads INT DEFAULT 0,
  cpl NUMERIC(10,2),
  ctr NUMERIC(8,6),
  cpc NUMERIC(10,4),
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Ad Sets ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiting_ad_sets (
  id TEXT PRIMARY KEY,                    -- Meta ad set ID
  campaign_id TEXT NOT NULL REFERENCES recruiting_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  -- Aggregate metrics
  total_spend NUMERIC(12,2) DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks BIGINT DEFAULT 0,
  total_leads INT DEFAULT 0,
  cpl NUMERIC(10,2),
  ctr NUMERIC(8,6),
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Daily Spend (time-series) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiting_daily_spend (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES recruiting_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  leads INT DEFAULT 0,
  cpl NUMERIC(10,2),
  UNIQUE(campaign_id, date)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recruiting_daily_spend_date ON recruiting_daily_spend(date);
CREATE INDEX IF NOT EXISTS idx_recruiting_daily_spend_campaign ON recruiting_daily_spend(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recruiting_ad_sets_campaign ON recruiting_ad_sets(campaign_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE recruiting_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_daily_spend ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users
CREATE POLICY "Authenticated read recruiting_campaigns"
  ON recruiting_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read recruiting_ad_sets"
  ON recruiting_ad_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read recruiting_daily_spend"
  ON recruiting_daily_spend FOR SELECT TO authenticated USING (true);

-- Service role can do everything (for edge function sync)
CREATE POLICY "Service role full access recruiting_campaigns"
  ON recruiting_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access recruiting_ad_sets"
  ON recruiting_ad_sets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access recruiting_daily_spend"
  ON recruiting_daily_spend FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Summary view (for dashboard KPIs) ──────────────────────────────────────
CREATE OR REPLACE VIEW recruiting_kpis AS
SELECT
  COALESCE(SUM(total_spend), 0) AS total_spend,
  COALESCE(SUM(total_impressions), 0) AS total_impressions,
  COALESCE(SUM(total_clicks), 0) AS total_clicks,
  COALESCE(SUM(total_leads), 0) AS total_leads,
  CASE WHEN SUM(total_leads) > 0
    THEN ROUND(SUM(total_spend) / SUM(total_leads), 2)
    ELSE NULL END AS cpl,
  CASE WHEN SUM(total_impressions) > 0
    THEN ROUND(SUM(total_clicks)::NUMERIC / SUM(total_impressions) * 100, 4)
    ELSE NULL END AS ctr
FROM recruiting_campaigns
WHERE status IN ('ACTIVE', 'PAUSED');
