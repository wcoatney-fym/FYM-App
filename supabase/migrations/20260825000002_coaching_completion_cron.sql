-- Schedule coaching-completion to run nightly after coaching-trigger.
-- coaching-trigger: 10:30 UTC → coaching-completion: 11:00 UTC (6:00 AM CT)
-- This gives the trigger 30 minutes to create/resolve plans before
-- the completion engine checks attendance and auto-advances.
--
-- Also fires after live training sessions end (manual invoke via POST).

SELECT cron.schedule(
  'coaching-completion-nightly',
  '0 11 * * *',
  $$SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/coaching-completion',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <APP_SERVICE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
