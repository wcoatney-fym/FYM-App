-- Enable extensions required for policy cache sync cron job
-- pg_cron: job scheduler
-- pg_net: HTTP calls from Postgres (used to invoke edge function)
-- Both must be enabled in Supabase dashboard before this migration runs.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Daily policy cache sync job
-- Fires at 09:00 UTC (4:00 AM CT) — after UNL nightly file lands
-- Invokes the sync-policy-cache edge function via HTTP POST
-- NOTE: Replace <APP_SERVICE_KEY> with the rcbzag sb_secret_ key before running
-- on a fresh DB. In production, the key is already embedded from the initial setup.
SELECT cron.schedule(
  'sync-policy-cache-daily',
  '0 9 * * *',
  $$SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/sync-policy-cache',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
