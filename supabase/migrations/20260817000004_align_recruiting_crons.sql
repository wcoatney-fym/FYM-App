-- Align all recruiting-tab crons to the same 3-hour cycle.
-- Previously: recruiting-pipeline-sync ran every 3h, meta-ads-sync ran daily.
-- Now: both run every 3 hours, offset by 5 minutes so they don't collide.
--
-- recruiting-pipeline-sync: :00 every 3h (unchanged)
-- meta-ads-sync:            :05 every 3h (was daily at 06:00 UTC)

-- Drop the daily schedule
SELECT cron.unschedule('meta-ads-sync-daily');

-- Re-register on a 3-hour cycle, 5 min offset from pipeline sync
SELECT cron.schedule(
  'meta-ads-sync-3h',
  '5 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbG…JpwY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
