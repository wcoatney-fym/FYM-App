-- Fix RLS infinite recursion on profiles table (v3 — definitive)
-- 
-- The recursive policies ("admin read all", "manager read agency") are only needed
-- for cross-user reads (e.g., a manager reading another user's profile in the same agency).
-- AuthContext only ever reads the caller's OWN profile, which is already covered by
-- "profiles: own read" (auth.uid() = id) — no recursion possible there.
--
-- The admin/manager cross-read policies can be added later via a non-recursive
-- approach (e.g., a separate admin_profiles view with SECURITY DEFINER).
-- For now: drop the two recursive policies. App is unblocked.

DROP POLICY IF EXISTS "profiles: admin read all" ON profiles;
DROP POLICY IF EXISTS "profiles: manager read agency" ON profiles;
DROP FUNCTION IF EXISTS get_my_role();
