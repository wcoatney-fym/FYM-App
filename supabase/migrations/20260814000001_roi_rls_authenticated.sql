-- Fix: ROI tab shows 0 data for authenticated users
-- recruiting_agent_production only had an anon RLS policy.
-- Authenticated users (logged-in dashboard users) were blocked by RLS.
CREATE POLICY "authenticated_read" ON recruiting_agent_production
  FOR SELECT TO authenticated USING (true);
