-- Fix 3: Add daily cron for meta-ads-sync edge function.
-- The function was working but had no cron — someone ran it manually on Aug 4
-- and it was never triggered again, leaving ad spend KPIs frozen for 13 days.
--
-- Schedule: daily at 06:00 UTC (1:00 AM CT / 12:00 AM CT during CDT).
-- This runs before the team's morning review and after Meta's daily data lands.
--
-- Auth pattern matches recruiting-pipeline-sync cron (service role JWT in header).

SELECT cron.schedule(
  'meta-ads-sync-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjYnphZ2p5aHlya3V3dmxybG5mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDIzMTQxNiwiZXhwIjoyMDk5ODA3NDE2fQ.ywbvfRRsgOAgENXg__K-2mocQdTBVCS5q_W_YVVJpwY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
