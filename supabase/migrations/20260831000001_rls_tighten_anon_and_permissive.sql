-- ============================================================================
-- RLS Tightening — Phase 3a: Remove unnecessary anon access + tighten
-- overly permissive write policies on gamification & checkin tables
-- ============================================================================
-- REVERSIBLE: each section has a corresponding ROLLBACK comment block.
-- To revert, run the rollback SQL for the affected section.
-- ============================================================================

-- ─── 1. Remove anon read from atrisk_tasks ─────────────────────────────────
-- Currently: anon can read ALL atrisk_tasks with no auth.
-- Fix: drop the anon policy. Authenticated users can still read via
-- the existing "atrisk_tasks: authenticated read" policy.
-- ROLLBACK: CREATE POLICY "atrisk_tasks: anon read" ON atrisk_tasks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "atrisk_tasks: anon read" ON atrisk_tasks;


-- ─── 2. Remove anon read from fym_admins ────────────────────────────────────
-- Currently: anon can read the entire fym_admins table.
-- Fix: drop the anon policy. Authenticated users still have read access
-- via "Authenticated users can read fym_admins" and "authenticated_read_fym_admins".
-- ROLLBACK: CREATE POLICY "anon_read_fym_admins" ON fym_admins FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_read_fym_admins" ON fym_admins;


-- ─── 3. Remove anon read from recruiting_agent_production ───────────────────
-- Currently: anon can read all recruiting agent production data.
-- Fix: drop the anon policy. Authenticated read remains.
-- ROLLBACK: CREATE POLICY "allow_anon_read" ON recruiting_agent_production FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "allow_anon_read" ON recruiting_agent_production;


-- ─── 4. Tighten battles — admin/manager write only ──────────────────────────
-- Currently: ANY authenticated user has ALL (insert/update/delete).
-- Fix: read for all authenticated, write for admin/manager only.
-- ROLLBACK: DROP POLICY "battles_admin_write" ON battles; CREATE POLICY "battles_write" ON battles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "battles_write" ON battles;

CREATE POLICY "battles_admin_write" ON battles
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


-- ─── 5. Tighten battle_participants — admin/manager write only ──────────────
-- ROLLBACK: DROP POLICY "battle_participants_admin_write" ON battle_participants; CREATE POLICY "battle_participants_write" ON battle_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "battle_participants_write" ON battle_participants;

CREATE POLICY "battle_participants_admin_write" ON battle_participants
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


-- ─── 6. Tighten challenges — admin/manager write only ───────────────────────
-- ROLLBACK: DROP POLICY "challenges_admin_write" ON challenges; CREATE POLICY "challenges_write" ON challenges FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "challenges_write" ON challenges;

CREATE POLICY "challenges_admin_write" ON challenges
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


-- ─── 7. Tighten challenge_participants — admin/manager write only ───────────
-- ROLLBACK: DROP POLICY "challenge_participants_admin_write" ON challenge_participants; CREATE POLICY "challenge_participants_write" ON challenge_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "challenge_participants_write" ON challenge_participants;

CREATE POLICY "challenge_participants_admin_write" ON challenge_participants
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


-- ─── 8. Tighten checkin_managers — admin/manager write only ─────────────────
-- ROLLBACK: see original policies above (INSERT/UPDATE/DELETE all true)

DROP POLICY IF EXISTS "checkin_managers_insert" ON checkin_managers;
DROP POLICY IF EXISTS "checkin_managers_update" ON checkin_managers;
DROP POLICY IF EXISTS "checkin_managers_delete" ON checkin_managers;

CREATE POLICY "checkin_managers_admin_insert" ON checkin_managers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "checkin_managers_admin_update" ON checkin_managers
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

CREATE POLICY "checkin_managers_admin_delete" ON checkin_managers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );


-- ─── 9. Tighten checkin_recipients — admin/manager write only ───────────────
-- ROLLBACK: see original policies (INSERT/UPDATE/DELETE all true)

DROP POLICY IF EXISTS "checkin_recipients_insert" ON checkin_recipients;
DROP POLICY IF EXISTS "checkin_recipients_update" ON checkin_recipients;
DROP POLICY IF EXISTS "checkin_recipients_delete" ON checkin_recipients;

CREATE POLICY "checkin_recipients_admin_insert" ON checkin_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "checkin_recipients_admin_update" ON checkin_recipients
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

CREATE POLICY "checkin_recipients_admin_delete" ON checkin_recipients
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
  );
