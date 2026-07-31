-- Align retention view definitions with quality-metrics-direct logic.
--
-- Root cause: agency_retention_summary and cohort_retention used estimated
-- draft_count (computed from date-diff at sync time) instead of direct
-- paid_to_date comparisons against policy_effective_date. This caused
-- retention numbers to diverge from Max's DB (the source of truth).
--
-- Fix: all retention calculations now use the same formula as
-- quality-metrics-direct in hi-sales-tracker:
--   - "Drafted first" = paid_to_date >= policy_effective_date + 1 month
--   - "Retained 90d"  = monthly (billing_mode='1' or NULL):
--                          paid_to_date >= policy_effective_date + 3 months
--                        non-monthly (3/6/12): single successful draft covers 90+ days
--                          paid_to_date >= policy_effective_date + 1 month
--   - Eligibility window: policy_effective_date <= CURRENT_DATE - 3 months
--     (for monthly) or - 1 month (for non-monthly)
--
-- Also updates at-risk view to prefer Max's at_risk_policy flag (now synced
-- directly to is_at_risk) over client-side paid_to_date lag detection.

-- 1. agency_retention_summary — powers Dashboard KPI cards and coaching panel
CREATE OR REPLACE VIEW agency_retention_summary AS
SELECT
  agency_id,
  COUNT(*) FILTER (WHERE status = 'active')                          AS active_policies,
  ROUND(SUM(plan_premium) FILTER (WHERE status = 'active'), 0)       AS active_premium,
  COUNT(*) FILTER (WHERE is_at_risk AND status = 'active')           AS at_risk_count,
  -- 90-day retention: same formula as quality-metrics-direct
  COUNT(*) FILTER (
    WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
      AND (
        (COALESCE(billing_mode, '1') = '1'
          AND paid_to_date >= policy_effective_date + INTERVAL '3 months')
        OR (COALESCE(billing_mode, '1') != '1'
          AND paid_to_date >= policy_effective_date + INTERVAL '1 month')
      )
  )                                                                   AS retained_90d,
  COUNT(*) FILTER (
    WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
      AND paid_to_date >= policy_effective_date + INTERVAL '1 month'
  )                                                                   AS eligible_90d,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
        AND (
          (COALESCE(billing_mode, '1') = '1'
            AND paid_to_date >= policy_effective_date + INTERVAL '3 months')
          OR (COALESCE(billing_mode, '1') != '1'
            AND paid_to_date >= policy_effective_date + INTERVAL '1 month')
        )
    ) / NULLIF(COUNT(*) FILTER (
      WHERE policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
        AND paid_to_date >= policy_effective_date + INTERVAL '1 month'
    ), 0)
  , 1)                                                                AS retention_pct
FROM policy_cache
WHERE product_type IN ('HI', 'HHC')
  -- Only include real agency UUIDs, not person-name fallbacks
  AND agency_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY agency_id;

-- 2. cohort_retention — powers the retention trend chart
CREATE OR REPLACE VIEW cohort_retention AS
SELECT
  product_type,
  DATE_TRUNC('month', policy_effective_date) AS cohort_month,
  COUNT(*) AS cohort_size,
  COUNT(*) FILTER (
    WHERE paid_to_date >= policy_effective_date + INTERVAL '1 month'
  ) AS drafted_first,
  COUNT(*) FILTER (
    WHERE (
      (COALESCE(billing_mode, '1') = '1'
        AND paid_to_date >= policy_effective_date + INTERVAL '3 months')
      OR (COALESCE(billing_mode, '1') != '1'
        AND paid_to_date >= policy_effective_date + INTERVAL '1 month')
    )
  ) AS retained,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE (
        (COALESCE(billing_mode, '1') = '1'
          AND paid_to_date >= policy_effective_date + INTERVAL '3 months')
        OR (COALESCE(billing_mode, '1') != '1'
          AND paid_to_date >= policy_effective_date + INTERVAL '1 month')
      )
    ) / NULLIF(COUNT(*) FILTER (
      WHERE paid_to_date >= policy_effective_date + INTERVAL '1 month'
    ), 0)
  , 1) AS retention_pct,
  ROUND(SUM(plan_premium) FILTER (WHERE status = 'active'), 0) AS active_premium
FROM policy_cache
WHERE product_type IN ('HI', 'HHC')
  AND policy_effective_date IS NOT NULL
  AND (
    (COALESCE(billing_mode, '1') = '1'
      AND policy_effective_date <= CURRENT_DATE - INTERVAL '3 months')
    OR (COALESCE(billing_mode, '1') != '1'
      AND policy_effective_date <= CURRENT_DATE - INTERVAL '1 month')
  )
GROUP BY product_type, DATE_TRUNC('month', policy_effective_date)
ORDER BY cohort_month DESC, product_type;

-- 3. agent_production — add retention aligned with quality-metrics-direct
CREATE OR REPLACE VIEW agent_production AS
SELECT
  pc.agent_id,
  p.full_name AS agent_name,
  p.writing_number,
  pc.agency_id,
  a.name AS agency_name,
  count(*) AS total_policies,
  count(*) FILTER (WHERE pc.status = 'active') AS active_policies,
  count(*) FILTER (WHERE pc.status = 'terminated') AS terminated_policies,
  count(*) FILTER (WHERE pc.status = 'pending') AS pending_policies,
  count(*) FILTER (WHERE pc.is_at_risk) AS at_risk_policies,
  round(sum(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_monthly_premium,
  round(sum(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS active_annual_premium,
  round(avg(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS avg_annual_premium,
  count(*) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date)) AS policies_this_month,
  round(sum(pc.plan_premium * 12) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date)), 0) AS ap_this_month,
  -- Retention: same formula as quality-metrics-direct
  count(*) FILTER (
    WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
      AND (
        (COALESCE(pc.billing_mode, '1') = '1'
          AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '3 months')
        OR (COALESCE(pc.billing_mode, '1') != '1'
          AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month')
      )
  ) AS retained_policies,
  count(*) FILTER (
    WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
      AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month'
  ) AS ever_drafted,
  CASE WHEN count(*) FILTER (
    WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
      AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month'
  ) > 0
    THEN round(100.0 * count(*) FILTER (
      WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
        AND (
          (COALESCE(pc.billing_mode, '1') = '1'
            AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '3 months')
          OR (COALESCE(pc.billing_mode, '1') != '1'
            AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month')
        )
    ) / count(*) FILTER (
      WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
        AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month'
    ), 1)
    ELSE NULL
  END AS retention_pct
FROM policy_cache pc
LEFT JOIN profiles p ON p.id = pc.agent_id
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC')
GROUP BY pc.agent_id, p.full_name, p.writing_number, pc.agency_id, a.name
ORDER BY active_annual_premium DESC NULLS LAST;
