-- ============================================================================
-- RLS Tightening — Phase 3b: Restrict roster + coaching table writes
-- to admin/manager roles only
-- ============================================================================
-- All affected frontend pages are behind RoleGuard allow={['admin','manager']}.
-- Edge functions use service_role keys (bypass RLS). Safe to restrict.
-- Each section has ROLLBACK SQL in comments.
-- ============================================================================

-- ─── 1. agency_roster_uploads — admin/manager write only ────────────────────
-- Currently: ANY authenticated user has INSERT/UPDATE/DELETE (qual=true)
-- Frontend: AgencyRosterPage behind RoleGuard(['admin','manager'])
-- ROLLBACK: DROP POLICY IF EXISTS "roster_uploads_admin_insert" ON agency_roster_uploads; DROP POLICY IF EXISTS "roster_uploads_admin_update" ON agency_roster_uploads; DROP POLICY IF EXISTS "roster_uploads_admin_delete" ON agency_roster_uploads; CREATE POLICY "Authenticated users can insert roster uploads" ON agency_roster_uploads FOR INSERT TO authenticated WITH CHECK (true); CREATE POLICY "Authenticated users can update roster uploads" ON agency_roster_uploads FOR UPDATE TO authenticated USING (true) WITH CHECK (true); CREATE POLICY "Authenticated users can delete roster uploads" ON agency_roster_uploads FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert roster uploads" ON agency_roster_uploads;
DROP POLICY IF EXISTS "Authenticated users can update roster uploads" ON agency_roster_uploads;
DROP POLICY IF EXISTS "Authenticated users can delete roster uploads" ON agency_roster_uploads;

CREATE POLICY "roster_uploads_admin_insert" ON agency_roster_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "roster_uploads_admin_update" ON agency_roster_uploads
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

CREATE POLICY "roster_uploads_admin_delete" ON agency_roster_uploads
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 2. agency_rosters — admin/manager write only ───────────────────────────
-- Currently: ANY authenticated user has INSERT/UPDATE/DELETE (qual=true)
-- Frontend: AgencyRosterPage behind RoleGuard(['admin','manager'])
-- ROLLBACK: DROP POLICY IF EXISTS "rosters_admin_insert" ON agency_rosters; DROP POLICY IF EXISTS "rosters_admin_update" ON agency_rosters; DROP POLICY IF EXISTS "rosters_admin_delete" ON agency_rosters; CREATE POLICY "Authenticated users can insert rosters" ON agency_rosters FOR INSERT TO authenticated WITH CHECK (true); CREATE POLICY "Authenticated users can update rosters" ON agency_rosters FOR UPDATE TO authenticated USING (true) WITH CHECK (true); CREATE POLICY "Authenticated users can delete rosters" ON agency_rosters FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert rosters" ON agency_rosters;
DROP POLICY IF EXISTS "Authenticated users can update rosters" ON agency_rosters;
DROP POLICY IF EXISTS "Authenticated users can delete rosters" ON agency_rosters;

CREATE POLICY "rosters_admin_insert" ON agency_rosters
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "rosters_admin_update" ON agency_rosters
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

CREATE POLICY "rosters_admin_delete" ON agency_rosters
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 3. agency_writing_numbers — admin/manager write only ───────────────────
-- Currently: ALL true for authenticated + SELECT true (redundant)
-- Frontend: AgenciesPage + AgencyDetailPanel behind RoleGuard(['admin','manager'])
-- ROLLBACK: DROP POLICY IF EXISTS "writing_numbers_admin_write" ON agency_writing_numbers; CREATE POLICY "agency_writing_numbers_write" ON agency_writing_numbers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agency_writing_numbers_write" ON agency_writing_numbers;

CREATE POLICY "writing_numbers_admin_write" ON agency_writing_numbers
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


-- ─── 4. coaching_plans — admin/manager write only ───────────────────────────
-- Currently: INSERT/UPDATE/DELETE all true for authenticated
-- Frontend: coaching/api.ts — admin/manager operations (create plan,
--   update stage, delete plan). Coaching pages are admin/manager only.
-- ROLLBACK: DROP POLICY IF EXISTS "coaching_plans_admin_insert" ON coaching_plans; DROP POLICY IF EXISTS "coaching_plans_admin_update" ON coaching_plans; DROP POLICY IF EXISTS "coaching_plans_admin_delete" ON coaching_plans; CREATE POLICY "coaching_plans_insert" ON coaching_plans FOR INSERT TO authenticated WITH CHECK (true); CREATE POLICY "coaching_plans_update" ON coaching_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true); CREATE POLICY "coaching_plans_delete" ON coaching_plans FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "coaching_plans_insert" ON coaching_plans;
DROP POLICY IF EXISTS "coaching_plans_update" ON coaching_plans;
DROP POLICY IF EXISTS "coaching_plans_delete" ON coaching_plans;

CREATE POLICY "coaching_plans_admin_insert" ON coaching_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "coaching_plans_admin_update" ON coaching_plans
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

CREATE POLICY "coaching_plans_admin_delete" ON coaching_plans
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 5. coaching_requirements — admin/manager write only ────────────────────
-- ROLLBACK: similar pattern to coaching_plans above

DROP POLICY IF EXISTS "coaching_requirements_insert" ON coaching_requirements;
DROP POLICY IF EXISTS "coaching_requirements_update" ON coaching_requirements;
DROP POLICY IF EXISTS "coaching_requirements_delete" ON coaching_requirements;

CREATE POLICY "coaching_requirements_admin_insert" ON coaching_requirements
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "coaching_requirements_admin_update" ON coaching_requirements
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

CREATE POLICY "coaching_requirements_admin_delete" ON coaching_requirements
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 6. coaching_notes — admin/manager insert only ──────────────────────────
-- Currently: INSERT true for authenticated (no update/delete policies)
-- ROLLBACK: DROP POLICY IF EXISTS "coaching_notes_admin_insert" ON coaching_notes; CREATE POLICY "coaching_notes_insert" ON coaching_notes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "coaching_notes_insert" ON coaching_notes;

CREATE POLICY "coaching_notes_admin_insert" ON coaching_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 7. coaching_stage_history — admin/manager insert only ──────────────────
-- Currently: INSERT true for authenticated
-- ROLLBACK: DROP POLICY IF EXISTS "coaching_stage_history_admin_insert" ON coaching_stage_history; CREATE POLICY "coaching_stage_history_insert" ON coaching_stage_history FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "coaching_stage_history_insert" ON coaching_stage_history;

CREATE POLICY "coaching_stage_history_admin_insert" ON coaching_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 8. atrisk_stage_history — admin/manager insert only ────────────────────
-- Currently: INSERT true for authenticated
-- ROLLBACK: DROP POLICY IF EXISTS "atrisk_stage_history_admin_insert" ON atrisk_stage_history; CREATE POLICY "Authenticated insert stage history" ON atrisk_stage_history FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated insert stage history" ON atrisk_stage_history;

CREATE POLICY "atrisk_stage_history_admin_insert" ON atrisk_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );
