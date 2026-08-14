-- Add GHL sync support columns for two-way Workboard ↔ GHL pipeline sync.
--
-- 1. source column on atrisk_stage_history — tracks who initiated each stage change
--    ('app' | 'ghl' | 'manual'). Used as loop guard: if source='ghl', skip push back.
-- 2. ghl_contact_id on atrisk_tasks — maps policy to GHL contact for API calls.
-- 3. ghl_opportunity_id on atrisk_tasks — maps to GHL opportunity for stage moves.

-- Source column on stage history (loop guard + audit trail)
ALTER TABLE atrisk_stage_history
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';

COMMENT ON COLUMN atrisk_stage_history.source IS
  'Who initiated the stage change: app (workboard UI), ghl (inbound webhook), manual (admin override). Used as loop guard to prevent echo pushes.';

-- GHL identifiers on tasks
ALTER TABLE atrisk_tasks
  ADD COLUMN IF NOT EXISTS ghl_contact_id text;

ALTER TABLE atrisk_tasks
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id text;

COMMENT ON COLUMN atrisk_tasks.ghl_contact_id IS
  'GHL contact ID for this policy holder in the agency GHL sub-account.';

COMMENT ON COLUMN atrisk_tasks.ghl_opportunity_id IS
  'GHL opportunity ID for this at-risk case in the agency GHL pipeline.';

-- Index for webhook lookups (GHL → App needs to find task by ghl_opportunity_id)
CREATE INDEX IF NOT EXISTS idx_atrisk_tasks_ghl_opportunity
  ON atrisk_tasks(ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atrisk_tasks_ghl_contact
  ON atrisk_tasks(ghl_contact_id)
  WHERE ghl_contact_id IS NOT NULL;

-- Update the manager_at_risk_board view to include GHL IDs
DROP VIEW IF EXISTS public.manager_at_risk_board;
CREATE VIEW public.manager_at_risk_board AS
SELECT
  pc.policy_number,
  pc.client_name,
  pc.agency_id,
  COALESCE(ag.name, pc.agency_id) AS agency_name,
  pc.agent_id,
  p.full_name AS agent_name,
  p.writing_number,
  pc.product_type,
  pc.plan_premium,
  pc.flag_type,
  pc.paid_to_date,
  pc.policy_effective_date,
  pc.draft_count,
  pc.is_at_risk,
  pc.synced_at,
  CURRENT_DATE - pc.paid_to_date AS days_since_draft,
  t.id AS task_id,
  t.status AS task_status,
  t.assigned_to AS task_assigned_to,
  t.due_date AS task_due_date,
  t.created_at AS task_created_at,
  t.ghl_contact_id,
  t.ghl_opportunity_id
FROM policy_cache pc
LEFT JOIN agencies ag ON pc.agency_id = ag.tracker_id
LEFT JOIN profiles p ON p.id = pc.agent_id
LEFT JOIN LATERAL (
  SELECT id, status, assigned_to, due_date, created_at, ghl_contact_id, ghl_opportunity_id
  FROM atrisk_tasks
  WHERE policy_number = pc.policy_number
  ORDER BY created_at DESC
  LIMIT 1
) t ON true
WHERE pc.status = 'active'
  AND pc.paid_to_date IS NOT NULL
  AND pc.paid_to_date < CURRENT_DATE;
