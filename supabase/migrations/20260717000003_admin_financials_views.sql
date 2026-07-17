-- Phase 4: Admin financials views
-- Cohort retention by product + effective month
-- Concentration risk by agency
-- These views read from policy_cache (synced nightly from tracker)

-- 1. Cohort retention: group by effective month, compute 90-day retention per cohort
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

-- 2. Agency concentration: premium concentration + at-risk exposure per agency
CREATE OR REPLACE VIEW agency_concentration AS
SELECT
  agency_id,
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,
  ROUND(SUM(plan_premium) FILTER (WHERE status = 'active'), 0) AS active_premium,
  COUNT(*) FILTER (WHERE is_at_risk AND status = 'active') AS at_risk_count,
  ROUND(SUM(plan_premium) FILTER (WHERE is_at_risk AND status = 'active'), 0) AS at_risk_premium,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE is_at_risk AND status = 'active')
    / NULLIF(COUNT(*) FILTER (WHERE status = 'active'), 0)
  , 1) AS at_risk_pct,
  ROUND(
    100.0 * SUM(plan_premium) FILTER (WHERE status = 'active')
    / NULLIF((SELECT SUM(plan_premium) FROM policy_cache WHERE status = 'active' AND product_type IN ('HI','HHC')), 0)
  , 2) AS premium_concentration_pct
FROM policy_cache
WHERE product_type IN ('HI', 'HHC')
GROUP BY agency_id
ORDER BY active_premium DESC NULLS LAST;
