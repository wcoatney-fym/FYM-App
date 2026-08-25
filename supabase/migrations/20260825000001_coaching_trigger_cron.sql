-- Schedule coaching-trigger to run nightly after policy sync + roster reconcile.
-- Policy sync: 09:00 UTC, Roster reconcile: 10:00 UTC
-- This fires at 10:30 UTC (5:30 AM CT) so both are complete before we evaluate flags.
--
-- The coaching-trigger edge function:
--   1. Reads thresholds from coaching_thresholds
--   2. Queries Max's prod DB for per-agent stats
--   3. Creates coaching_plans at 'flagged' stage for breaching agents
--   4. Auto-resolves stale 'flagged' plans when agents recover
--   5. Skips agents with existing active plans (idempotent)

SELECT cron.schedule(
  'coaching-trigger-nightly',
  '30 10 * * *',
  $$SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/coaching-trigger',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
