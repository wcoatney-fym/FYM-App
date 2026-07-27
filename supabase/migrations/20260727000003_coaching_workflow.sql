-- Stage 5: Coaching escalation pipeline
-- Extends atrisk_tasks with Kanban-style pipeline columns and adds a
-- consolidated coaching_pipeline view joining task + policy + agency + profile data.

-- 1. Add coaching workflow columns to atrisk_tasks
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new';
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id);
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS last_contact_date date;
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE atrisk_tasks ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

-- 2. Create a view for the coaching pipeline
CREATE OR REPLACE VIEW coaching_pipeline AS
SELECT
  t.id AS task_id,
  t.policy_number,
  t.agency_id,
  a.name AS agency_name,
  t.stage,
  t.status,
  t.priority,
  t.assigned_to,
  p_assigned.full_name AS assigned_name,
  t.notes,
  t.last_contact_date,
  t.resolution,
  t.escalated_at,
  t.flag_type,
  t.due_date,
  t.created_at,
  t.updated_at,
  pc.product_type,
  pc.plan_premium,
  pc.paid_to_date,
  pc.draft_count,
  pc.policy_effective_date,
  pc.agent_id,
  p_agent.full_name AS agent_name,
  pc.is_at_risk,
  CASE WHEN pc.paid_to_date IS NOT NULL
    THEN current_date - pc.paid_to_date
    ELSE NULL
  END AS days_since_paid
FROM atrisk_tasks t
LEFT JOIN policy_cache pc ON pc.policy_number = t.policy_number
LEFT JOIN agencies a ON a.tracker_id = t.agency_id
LEFT JOIN profiles p_assigned ON p_assigned.id = t.assigned_to
LEFT JOIN profiles p_agent ON p_agent.id = pc.agent_id
ORDER BY
  CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  t.updated_at DESC;
