-- Stage 5: Retention cohort views for dedicated RetentionPage
-- Extends existing cohort_retention view with agency-level breakdowns and trend alerts

-- 1. Agency cohort retention: per-agency, per-product, per-month
CREATE OR REPLACE VIEW agency_cohort_retention AS
SELECT
  pc.agency_id,
  a.name AS agency_name,
  pc.product_type,
  date_trunc('month', pc.policy_effective_date)::date AS cohort_month,
  count(*) AS cohort_size,
  count(*) FILTER (
    WHERE pc.draft_count >= 1
  ) AS drafted_first,
  count(*) FILTER (
    WHERE pc.draft_count >= 3
  ) AS retained,
  CASE WHEN count(*) FILTER (WHERE pc.draft_count >= 1) > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE pc.draft_count >= 3)
      / count(*) FILTER (WHERE pc.draft_count >= 1)
    , 1)
    ELSE NULL
  END AS retention_pct,
  round(sum(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_premium,
  round(sum(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS active_annual_premium
FROM policy_cache pc
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC')
  AND pc.policy_effective_date IS NOT NULL
  AND pc.policy_effective_date <= current_date - interval '90 days'
GROUP BY pc.agency_id, a.name, pc.product_type, date_trunc('month', pc.policy_effective_date)
HAVING count(*) FILTER (WHERE pc.draft_count >= 1) >= 3
ORDER BY cohort_month DESC, pc.agency_id, pc.product_type;

-- 2. Agency retention summary (overall per-agency across all eligible cohorts)
CREATE OR REPLACE VIEW agency_retention_overview AS
SELECT
  pc.agency_id,
  a.name AS agency_name,
  count(*) AS total_eligible,
  count(*) FILTER (WHERE pc.draft_count >= 1) AS ever_drafted,
  count(*) FILTER (WHERE pc.draft_count >= 3) AS retained,
  CASE WHEN count(*) FILTER (WHERE pc.draft_count >= 1) > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE pc.draft_count >= 3)
      / count(*) FILTER (WHERE pc.draft_count >= 1)
    , 1)
    ELSE NULL
  END AS retention_pct,
  count(*) FILTER (WHERE pc.status = 'active') AS active_policies,
  round(sum(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS active_annual_premium,
  count(*) FILTER (WHERE pc.is_at_risk) AS at_risk_count,
  -- Trend: compare last 3 months vs prior 3 months
  CASE WHEN count(*) FILTER (
    WHERE pc.draft_count >= 1
    AND pc.policy_effective_date >= current_date - interval '6 months'
    AND pc.policy_effective_date < current_date - interval '3 months'
  ) > 0
    THEN round(
      100.0 * count(*) FILTER (
        WHERE pc.draft_count >= 3
        AND pc.policy_effective_date >= current_date - interval '6 months'
        AND pc.policy_effective_date < current_date - interval '3 months'
      ) / count(*) FILTER (
        WHERE pc.draft_count >= 1
        AND pc.policy_effective_date >= current_date - interval '6 months'
        AND pc.policy_effective_date < current_date - interval '3 months'
      )
    , 1)
    ELSE NULL
  END AS prior_3mo_retention_pct,
  CASE WHEN count(*) FILTER (
    WHERE pc.draft_count >= 1
    AND pc.policy_effective_date >= current_date - interval '3 months'
  ) > 0
    THEN round(
      100.0 * count(*) FILTER (
        WHERE pc.draft_count >= 3
        AND pc.policy_effective_date >= current_date - interval '3 months'
      ) / count(*) FILTER (
        WHERE pc.draft_count >= 1
        AND pc.policy_effective_date >= current_date - interval '3 months'
      )
    , 1)
    ELSE NULL
  END AS recent_3mo_retention_pct
FROM policy_cache pc
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC')
  AND pc.policy_effective_date IS NOT NULL
  AND pc.policy_effective_date <= current_date - interval '90 days'
GROUP BY pc.agency_id, a.name
HAVING count(*) FILTER (WHERE pc.draft_count >= 1) >= 5
ORDER BY retention_pct ASC NULLS LAST;

-- 3. Update existing cohort_retention view to use draft_count (consistent with Stage 5 views)
CREATE OR REPLACE VIEW cohort_retention AS
SELECT
  product_type,
  date_trunc('month', policy_effective_date)::date AS cohort_month,
  count(*) AS cohort_size,
  count(*) FILTER (WHERE draft_count >= 1) AS drafted_first,
  count(*) FILTER (WHERE draft_count >= 3) AS retained,
  CASE WHEN count(*) FILTER (WHERE draft_count >= 1) > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE draft_count >= 3)
      / count(*) FILTER (WHERE draft_count >= 1)
    , 1)
    ELSE NULL
  END AS retention_pct,
  round(sum(plan_premium) FILTER (WHERE status = 'active'), 0) AS active_premium
FROM policy_cache
WHERE product_type IN ('HI', 'HHC')
  AND policy_effective_date IS NOT NULL
  AND policy_effective_date <= current_date - interval '90 days'
GROUP BY product_type, date_trunc('month', policy_effective_date)
ORDER BY cohort_month DESC, product_type;
