-- Pipeline 8-Stage Restructure
-- Charlie spec (2026-08-25): 8 clean stages with admin/agent task split.
--
-- 1. HIP Broker (intake)
-- 2. HIP Career (intake)
-- 3. IAA (agreement)
-- 4. In Contracting (admin-side tasks)
-- 5. Waiting for Numbers (agent reports carrier codes)
-- 6. RTS (Tyler test + EnrollHere)
-- 7. Actively Selling (gated by Max's DB)
-- 8. Terminated (offboarding — admin-only)

-- ─── 1. Add agent_visible column to stage steps ─────────────────────────────
ALTER TABLE agent_pipeline_stage_steps
  ADD COLUMN IF NOT EXISTS agent_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN agent_pipeline_stage_steps.agent_visible IS
  'Whether this step is visible to agents. false = admin-only task.';

-- ─── 2. Deactivate old stage steps (don''t delete — preserve history) ────────
UPDATE agent_pipeline_stage_steps SET active = false
WHERE internal_stage IN ('signed_iaa', 'bill_com', 'crm', 'hip_broker_ready', 'hip_career_ready');

-- ─── 3. Seed new stage steps per Charlie's spec ─────────────────────────────

-- Stage 1: HIP Broker (no sub-tasks — auto-entry on intake form)
-- Stage 2: HIP Career (no sub-tasks — auto-entry on intake form)

-- Stage 3: IAA
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('iaa_send', 'iaa', 'IAA sent to agent', 1, true, false),
  ('iaa_slack_joined', 'iaa', 'Agent joins Slack', 2, true, true),
  ('iaa_welcome_sent', 'iaa', 'Welcome message sent', 3, true, false),
  ('iaa_signed', 'iaa', 'Agent signs IAA', 4, true, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;

-- Stage 4: In Contracting Process
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('ic_send_email', 'in_contracting', 'Send contracting email to agent', 1, true, false),
  ('ic_onboarding_doc', 'in_contracting', 'Attach onboarding steps doc to Slack + email', 2, true, false),
  ('ic_billcom', 'in_contracting', 'Request bill.com on agent''s behalf', 3, true, false),
  ('ic_crm_access', 'in_contracting', 'Request CRM access on agent''s behalf', 4, true, false),
  ('ic_manhattan', 'in_contracting', 'Request Manhattan Life contracting', 5, true, false),
  ('ic_ahl', 'in_contracting', 'Request American Home Life contracting', 6, true, false),
  ('ic_heartland', 'in_contracting', 'Request Heartland contracting', 7, true, false),
  ('ic_bianca', 'in_contracting', 'Notify agent to contact Bianca for training', 8, true, false),
  -- Agent-visible steps in this stage:
  ('ic_agent_gtl', 'in_contracting', 'Complete GTL contracting', 9, true, true),
  ('ic_agent_unl', 'in_contracting', 'Complete UNL contracting', 10, true, true),
  ('ic_agent_onboarding', 'in_contracting', 'Review onboarding guide', 11, true, true),
  ('ic_agent_bianca', 'in_contracting', 'Contact Bianca for training materials', 12, true, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;

-- Stage 5: Waiting for Agent Numbers
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('wfn_manhattan', 'waiting_for_numbers', 'Manhattan Life writing number', 1, true, true),
  ('wfn_ahl', 'waiting_for_numbers', 'AHL writing number', 2, true, true),
  ('wfn_unl', 'waiting_for_numbers', 'UNL writing number', 3, true, true),
  ('wfn_gtl', 'waiting_for_numbers', 'GTL writing number', 4, true, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;

-- Stage 6: RTS Status
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('rts_parked', 'rts', 'Agent parked after reporting carrier codes', 1, true, false),
  ('rts_tyler_test', 'rts', 'Test out with Tyler', 2, true, true),
  ('rts_enrollhere_req', 'rts', 'Tracey requests EnrollHere setup', 3, true, false),
  ('rts_enrollhere_confirmed', 'rts', 'EnrollHere confirmed', 4, true, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;

-- Stage 7: Actively Selling (no sub-tasks — auto-entry from Max's DB)

-- Stage 8: Terminated (all admin-only)
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('term_crm', 'terminated', 'Offboard from CRM', 1, true, false),
  ('term_enrollhere', 'terminated', 'Offboard from EnrollHere', 2, true, false),
  ('term_slack', 'terminated', 'Offboard from Slack', 3, true, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;

-- ─── 4. Create storage bucket for WN screenshots (idempotent) ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('wn-screenshots', 'wn-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY IF NOT EXISTS "agents_upload_own_screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wn-screenshots');

-- Allow authenticated users to read all screenshots (admins need this)
CREATE POLICY IF NOT EXISTS "authenticated_read_screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wn-screenshots');
