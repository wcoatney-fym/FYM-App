-- Fix: Workboard views return raw agency_id UUIDs instead of agency names.
-- Both views now JOIN against agencies table to resolve tracker_id → name.
-- DROP + CREATE required because the new column changes column order.

DROP VIEW IF EXISTS manager_at_risk_board CASCADE;
DROP VIEW IF EXISTS agency_retention_summary CASCADE;

-- 1. manager_at_risk_board — add agency_name
CREATE OR REPLACE VIEW manager_at_risk_board AS
SELECT
  pc.policy_number,
  pc.agency_id,
  COALESCE(ag.name, pc.agency_id) AS agency_name,
  pc.agent_id,
  pc.product_type,
  pc.plan_premium,
  pc.flag_type,
  pc.paid_to_date,
  pc.policy_effective_date,
  pc.draft_count,
  pc.is_at_risk,
  pc.synced_at,
  CURRENT_DATE - pc.paid_to_date AS days_since_draft,
  t.id            AS task_id,
  t.status        AS task_status,
  t.assigned_to   AS task_assigned_to,
  t.due_date      AS task_due_date,
  t.created_at    AS task_created_at
FROM policy_cache pc
LEFT JOIN agencies ag ON pc.agency_id = ag.tracker_id
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

-- 2. agency_retention_summary — add agency_name
CREATE OR REPLACE VIEW agency_retention_summary AS
SELECT
  pc.agency_id,
  COALESCE(ag.name, pc.agency_id) AS agency_name,
  COUNT(*) FILTER (WHERE pc.status = 'active')                          AS active_policies,
  ROUND(SUM(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0)    AS active_premium,
  COUNT(*) FILTER (WHERE pc.is_at_risk AND pc.status = 'active')        AS at_risk_count,
  COUNT(*) FILTER (
    WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
      AND pc.draft_count >= 3
  )                                                                      AS retained_90d,
  COUNT(*) FILTER (
    WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
      AND pc.draft_count >= 1
  )                                                                      AS eligible_90d,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
        AND pc.draft_count >= 3
    ) / NULLIF(COUNT(*) FILTER (
      WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
        AND pc.draft_count >= 1
    ), 0)
  , 1)                                                                   AS retention_pct
FROM policy_cache pc
LEFT JOIN agencies ag ON pc.agency_id = ag.tracker_id
WHERE pc.product_type IN ('HI', 'HHC')
  AND pc.agency_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY pc.agency_id, ag.name;
