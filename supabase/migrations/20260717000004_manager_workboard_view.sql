-- Phase 3: Manager workboard views
-- manager_at_risk_board: at-risk policies joined with open tasks
-- agency_retention_summary: per-agency retention for the manager coaching panel

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
WHERE pc.is_at_risk = true
  AND pc.status = 'active';

-- Per-agency cohort retention — last 6 eligible months only
CREATE OR REPLACE VIEW agency_retention_summary AS
SELECT
  agency_id,
  COUNT(*) FILTER (WHERE status = 'active')                          AS active_policies,
  ROUND(SUM(plan_premium) FILTER (WHERE status = 'active'), 0)       AS active_premium,
  COUNT(*) FILTER (WHERE is_at_risk AND status = 'active')           AS at_risk_count,
  -- 90-day retention: policies eligible (eff <= today - 90d) that drafted 3x
  COUNT(*) FILTER (
    WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
      AND draft_count >= 3
  )                                                                   AS retained_90d,
  COUNT(*) FILTER (
    WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
      AND draft_count >= 1
  )                                                                   AS eligible_90d,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
        AND draft_count >= 3
    ) / NULLIF(COUNT(*) FILTER (
      WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '90 days'
        AND draft_count >= 1
    ), 0)
  , 1)                                                                AS retention_pct
FROM policy_cache
WHERE product_type IN ('HI', 'HHC')
GROUP BY agency_id;
