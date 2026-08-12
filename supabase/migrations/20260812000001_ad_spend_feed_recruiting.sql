-- Add feed_recruiting flag to recruiting_campaigns
-- When true, this campaign's data is surfaced in the Recruiting tab.
-- CRM Ops Ad Spend tab shows ALL campaigns; Recruiting tab shows only flagged ones.

ALTER TABLE recruiting_campaigns
  ADD COLUMN IF NOT EXISTS feed_recruiting BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient filtering in Recruiting tab queries
CREATE INDEX IF NOT EXISTS idx_recruiting_campaigns_feed_recruiting
  ON recruiting_campaigns(feed_recruiting) WHERE feed_recruiting = true;

-- Authenticated users can update the feed_recruiting flag (CRM Ops toggle)
CREATE POLICY "Authenticated update feed_recruiting"
  ON recruiting_campaigns FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Update the recruiting_kpis view to only include feed_recruiting campaigns
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
WHERE status IN ('ACTIVE', 'PAUSED')
  AND feed_recruiting = true;
