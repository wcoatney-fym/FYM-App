-- Stage 5: Retention cohort deep-dive views
-- Powers the dedicated RetentionPage: per-agency cohort retention history + trend alerts

-- 1. Agency cohort retention: monthly retention by agency, for trend analysis + alerting
CREATE OR REPLACE VIEW agency_cohort_retention AS
SELECT
  pc.agency_id,
  a.name AS agency_name,
  pc.product_type,
  date_trunc('month', pc.policy_effective_date) AS cohort_month,
  count(*) AS cohort_size,
  count(*) FILTER (
    WHERE pc.paid_to_date >= pc.policy_effective_date + interval '1 month'
  ) AS drafted_first,
  count(*) FILTER (
    WHERE (
      (coalesce(pc.billing_mode, '1') = '1'
        AND pc.paid_to_date >= pc.policy_effective_date + interval '3 months')
      OR (coalesce(pc.billing_mode, '1') != '1'
        AND pc.paid_to_date >= pc.policy_effective_date + interval '1 month')
    )
  ) AS retained,
  CASE WHEN count(*) FILTER (
    WHERE pc.paid_to_date >= pc.policy_effective_date + interval '1 month'
  ) > 0 THEN
    round(
      100.0 * count(*) FILTER (
        WHERE (
          (coalesce(pc.billing_mode, '1') = '1'
            AND pc.paid_to_date >= pc.policy_effective_date + interval '3 months')
          OR (coalesce(pc.billing_mode, '1') != '1'
            AND pc.paid_to_date >= pc.policy_effective_date + interval '1 month')
        )
      ) / count(*) FILTER (
        WHERE pc.paid_to_date >= pc.policy_effective_date + interval '1 month'
      )
    , 1)
  ELSE NULL END AS retention_pct,
  round(sum(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_premium
FROM policy_cache pc
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC')
  AND pc.policy_effective_date IS NOT NULL
  AND (
    (coalesce(pc.billing_mode, '1') = '1'
      AND pc.policy_effective_date <= current_date - interval '3 months')
    OR (coalesce(pc.billing_mode, '1') != '1'
      AND pc.policy_effective_date <= current_date - interval '1 month')
  )
GROUP BY pc.agency_id, a.name, pc.product_type, date_trunc('month', pc.policy_effective_date)
ORDER BY cohort_month DESC, pc.agency_id, pc.product_type;

-- 2. Agency retention summary with trend direction (latest 3 vs prior 3 cohort months)
CREATE OR REPLACE VIEW agency_retention_trend AS
WITH agency_monthly AS (
  SELECT
    agency_id,
    agency_name,
    cohort_month,
    sum(drafted_first) AS drafted,
    sum(retained) AS retained,
    CASE WHEN sum(drafted_first) > 0
      THEN round(100.0 * sum(retained) / sum(drafted_first), 1)
      ELSE NULL
    END AS retention_pct,
    sum(cohort_size) AS cohort_size,
    sum(active_premium) AS active_premium
  FROM agency_cohort_retention
  GROUP BY agency_id, agency_name, cohort_month
),
ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY agency_id ORDER BY cohort_month DESC) AS rn
  FROM agency_monthly
  WHERE retention_pct IS NOT NULL
),
recent AS (
  SELECT agency_id, agency_name,
    avg(retention_pct) FILTER (WHERE rn <= 3) AS recent_avg,
    avg(retention_pct) FILTER (WHERE rn BETWEEN 4 AND 6) AS prior_avg,
    sum(drafted) FILTER (WHERE rn <= 3) AS recent_drafted,
    sum(retained) FILTER (WHERE rn <= 3) AS recent_retained,
    sum(cohort_size) FILTER (WHERE rn <= 3) AS recent_cohort_size,
    sum(active_premium) AS total_active_premium,
    count(*) FILTER (WHERE rn <= 3) AS recent_months,
    min(retention_pct) FILTER (WHERE rn <= 3) AS worst_recent,
    max(retention_pct) FILTER (WHERE rn <= 3) AS best_recent
  FROM ranked
  GROUP BY agency_id, agency_name
)
SELECT
  agency_id,
  agency_name,
  round(recent_avg, 1) AS retention_avg_3m,
  round(prior_avg, 1) AS retention_avg_prior_3m,
  CASE
    WHEN prior_avg IS NULL THEN 'new'
    WHEN recent_avg >= prior_avg + 2 THEN 'improving'
    WHEN recent_avg <= prior_avg - 2 THEN 'declining'
    ELSE 'stable'
  END AS trend_direction,
  round(coalesce(recent_avg, 0) - coalesce(prior_avg, 0), 1) AS trend_delta,
  recent_drafted,
  recent_retained,
  recent_cohort_size,
  total_active_premium,
  recent_months,
  worst_recent,
  best_recent,
  CASE WHEN recent_avg < 90 THEN true ELSE false END AS below_target
FROM recent
ORDER BY retention_avg_3m ASC NULLS LAST;
