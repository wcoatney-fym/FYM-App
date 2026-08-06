-- Migration: Add FYM App login credential columns to agencies table
--
-- Context: Each agency gets auto-provisioned Supabase Auth credentials
-- so they can log into the FYM App and see their scoped data.
-- Credentials are stored on the agencies row so FYM admins can look them up
-- in Settings when agencies forget their password or need troubleshooting.

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS app_login_email text,
  ADD COLUMN IF NOT EXISTS app_login_password text;

-- Index for quick lookups by login email
CREATE INDEX IF NOT EXISTS idx_agencies_app_login_email
  ON public.agencies (app_login_email)
  WHERE app_login_email IS NOT NULL;

COMMENT ON COLUMN public.agencies.app_login_email IS 'Auto-generated email for FYM App login (e.g. agency-slug@app.teamfym.com)';
COMMENT ON COLUMN public.agencies.app_login_password IS 'Auto-generated password for FYM App login — visible to FYM admins in Settings';
