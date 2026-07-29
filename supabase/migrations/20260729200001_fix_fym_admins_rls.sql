/*
  Fix: fym_admins RLS infinite recursion (500 on every page load)

  Root cause: The "FYM admins can manage fym_admins" policy uses
  `auth.uid() IN (SELECT user_id FROM fym_admins)` which triggers
  a SELECT on fym_admins, which re-evaluates the ALL policy (which
  also covers SELECT), creating infinite recursion → 500.

  Same pattern as the profiles RLS bug fixed in PR #6.

  Fix: Drop the recursive ALL policy and replace with separate
  INSERT/UPDATE/DELETE policies that use a security-definer helper
  function to check admin membership without triggering RLS.
*/

-- Helper function: check if a user is an FYM admin (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_fym_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM fym_admins WHERE user_id = check_user_id);
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "FYM admins can manage fym_admins" ON fym_admins;

-- Replace with non-recursive write policies using the helper
CREATE POLICY "FYM admins can insert fym_admins"
  ON fym_admins FOR INSERT
  TO authenticated
  WITH CHECK (public.is_fym_admin(auth.uid()));

CREATE POLICY "FYM admins can update fym_admins"
  ON fym_admins FOR UPDATE
  TO authenticated
  USING (public.is_fym_admin(auth.uid()))
  WITH CHECK (public.is_fym_admin(auth.uid()));

CREATE POLICY "FYM admins can delete fym_admins"
  ON fym_admins FOR DELETE
  TO authenticated
  USING (public.is_fym_admin(auth.uid()));
