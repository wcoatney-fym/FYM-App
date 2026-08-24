-- Roster reconciliation run history + nightly cron job
-- Stores results from each roster-reconcile invocation for admin visibility.

-- ============================================================
-- 1. roster_reconcile_runs — one row per reconcile execution
-- ============================================================
CREATE TABLE IF NOT EXISTS roster_reconcile_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier           TEXT NOT NULL DEFAULT 'unl',
  mode              TEXT NOT NULL DEFAULT 'dry-run',  -- dry-run | apply
  agency_id         UUID,                             -- null = all agencies

  -- Counts
  roster_total      INT NOT NULL DEFAULT 0,
  roster_active     INT NOT NULL DEFAULT 0,
  roster_terminated INT NOT NULL DEFAULT 0,
  writing_numbers_checked INT NOT NULL DEFAULT 0,
  prod_agents_found INT NOT NULL DEFAULT 0,
  issues_found      INT NOT NULL DEFAULT 0,

  -- Issue breakdown
  active_prod_terminated  INT NOT NULL DEFAULT 0,
  active_prod_missing     INT NOT NULL DEFAULT 0,
  terminated_prod_active  INT NOT NULL DEFAULT 0,

  -- Apply-mode results
  applied           INT,
  lifecycle_cascades INT,
  reinstatement_flags INT,

  -- Full issue list (JSON array of ReconcileIssue objects)
  issues            JSONB DEFAULT '[]'::jsonb,

  -- Errors
  errors            JSONB,

  -- Timing
  elapsed_ms        INT,
  triggered_by      TEXT NOT NULL DEFAULT 'manual',   -- manual | cron | api
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_reconcile_runs_started
  ON roster_reconcile_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconcile_runs_carrier
  ON roster_reconcile_runs (carrier);

-- RLS: service_role full, authenticated read-only (admins read via app)
ALTER TABLE roster_reconcile_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY reconcile_runs_service_all ON roster_reconcile_runs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY reconcile_runs_read ON roster_reconcile_runs
  FOR SELECT USING (true);

-- ============================================================
-- 2. Nightly cron: roster-reconcile in dry-run mode
--    Fires at 10:00 UTC (5:00 AM CT) — after policy cache sync
--    Runs dry-run across all carriers sequentially
--    NOTE: Replace <APP_SERVICE_KEY> with rcbzag service key
-- ============================================================
SELECT cron.schedule(
  'roster-reconcile-nightly',
  '0 10 * * *',
  $$
  -- UNL reconcile (dry-run — results stored for admin review)
  SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/roster-reconcile?mode=dry-run&carrier=unl&persist=true&triggered_by=cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  -- GTL reconcile
  SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/roster-reconcile?mode=dry-run&carrier=gtl&persist=true&triggered_by=cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  -- AHL reconcile
  SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/roster-reconcile?mode=dry-run&carrier=ahl&persist=true&triggered_by=cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  -- Manhattan reconcile
  SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/roster-reconcile?mode=dry-run&carrier=manhattan&persist=true&triggered_by=cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
