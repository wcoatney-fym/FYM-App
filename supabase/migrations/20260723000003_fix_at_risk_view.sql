-- Fix: manager_at_risk_board was filtering on is_at_risk = true,
-- but the sync function never populated that flag (60-day threshold too high).
--
-- New logic: derive at-risk directly from paid_to_date lag on active policies.
-- A policy is at-risk if it's active and paid_to_date is before today
-- (meaning premium is overdue). This matches the lifecycle evaluator's
-- definition: active + paid_to_date < today = at risk.

CREATE OR REPLACE VIEW manager_at_risk_board AS
SELECT
  pc.policy_number,
  pc.agency_id,
  pc.agent_id,
  pc.product_type,
  pc.plan_premium,
  pc.flag_type,
  pc.paid_to_date,
  pc.policy_effective_date,
  pc.draft_count,
  pc.is_at_risk,
  pc.synced_at,
  -- days since last draft (proxy for urgency)
  CURRENT_DATE - pc.paid_to_date AS days_since_draft,
  -- open task info (NULL if no task opened yet)
  t.id            AS task_id,
  t.status        AS task_status,
  t.assigned_to   AS task_assigned_to,
  t.due_date      AS task_due_date,
  t.created_at    AS task_created_at
FROM policy_cache pc
LEFT JOIN LATERAL (
  SELECT id, status, assigned_to, due_date, created_at
  FROM atrisk_tasks
  WHERE atrisk_tasks.policy_number = pc.policy_number
  ORDER BY created_at DESC
  LIMIT 1
) t ON true
WHERE pc.status = 'active'
  AND pc.paid_to_date IS NOT NULL
  AND pc.paid_to_date < CURRENT_DATE;
