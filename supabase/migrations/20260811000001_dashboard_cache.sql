-- Dashboard cache table — stores pre-computed dashboard data
-- Refreshed hourly by the dashboard-cache-refresh edge function.
-- Single row per cache_key; JSONB payload holds the full response.

CREATE TABLE IF NOT EXISTS dashboard_cache (
  cache_key    text PRIMARY KEY,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  elapsed_ms   integer
);

-- RLS: anyone authenticated can read; only service role can write
ALTER TABLE dashboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cache"
  ON dashboard_cache FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE dashboard_cache IS 'Pre-computed dashboard data. Refreshed hourly by dashboard-cache-refresh edge function. Keys: retention_summary, retention_cohorts, agency_production, monthly_production.';

-- NOTE: The hourly cron job must be registered via SQL editor after deploying
-- the edge function, since the service key cannot be stored in migration files.
-- See the PR description for the exact SQL to run.
