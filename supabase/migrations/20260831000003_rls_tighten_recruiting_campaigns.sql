-- ============================================================================
-- RLS Tightening — Phase 3 final: Lock recruiting_campaigns UPDATE
-- to admin/fym_admin only + tighten onboarding_agencies
-- ============================================================================

-- ─── 1. recruiting_campaigns — restrict UPDATE to admin/manager ─────────────
-- Currently: ANY authenticated user can UPDATE (qual=true)
-- Reality: only meta-ads-sync edge function writes (service_role, bypasses RLS)
--   and the recruiting dashboard toggle (admin-only page)
-- ROLLBACK: DROP POLICY IF EXISTS "recruiting_campaigns_admin_update" ON recruiting_campaigns; CREATE POLICY "Authenticated update feed_recruiting" ON recruiting_campaigns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update feed_recruiting" ON recruiting_campaigns;

CREATE POLICY "recruiting_campaigns_admin_update" ON recruiting_campaigns
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 2. onboarding_agencies — restrict authenticated ALL to admin/manager ───
-- Currently: ANY authenticated user has ALL (qual=true)
-- Anon access for select+update on active records is intentional (public
-- onboarding flow) and remains unchanged.
-- ROLLBACK: DROP POLICY IF EXISTS "onboarding_agencies_admin_all" ON onboarding_agencies; CREATE POLICY "authenticated_all" ON onboarding_agencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON onboarding_agencies;

CREATE POLICY "onboarding_agencies_admin_all" ON onboarding_agencies
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );
