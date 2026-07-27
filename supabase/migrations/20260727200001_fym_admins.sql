-- FYM superadmin registry
-- Users in this table get org-wide unrestricted access regardless of their profile role.
CREATE TABLE IF NOT EXISTS fym_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS: only authenticated users can read (the app checks membership at login)
ALTER TABLE fym_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read fym_admins"
  ON fym_admins FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update/delete (managed via Settings UI through edge function or direct)
CREATE POLICY "Service role manages fym_admins"
  ON fym_admins FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- FYM admins can manage other fym_admins (add/remove) from the Settings UI
CREATE POLICY "FYM admins can manage fym_admins"
  ON fym_admins FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM fym_admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM fym_admins));
