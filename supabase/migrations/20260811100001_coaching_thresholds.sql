-- Coaching agent identification: configurable thresholds + agent-level flags view
--
-- Thresholds are stored in a single-row config table (app_settings pattern).
-- The agent_coaching_flags view joins agent_production data against these
-- thresholds to identify agents needing coaching intervention.

-- 1. Coaching thresholds config table (single row, enforced by check)
CREATE TABLE IF NOT EXISTS coaching_thresholds (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retention_pct_min numeric(5,1) NOT NULL DEFAULT 90.0,
  at_risk_pct_max numeric(5,1) NOT NULL DEFAULT 15.0,
  terminated_pct_max numeric(5,1) NOT NULL DEFAULT 20.0,
  min_eligible_policies int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Seed the default row
INSERT INTO coaching_thresholds (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS: admins can read/update
ALTER TABLE coaching_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read coaching thresholds"
  ON coaching_thresholds FOR SELECT
  USING (true);

CREATE POLICY "FYM admins can update coaching thresholds"
  ON coaching_thresholds FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM fym_admins WHERE user_id = auth.uid())
  );

-- 2. Agent coaching flags view
-- Joins policy_cache aggregation against thresholds to flag agents
CREATE OR REPLACE VIEW agent_coaching_flags AS
WITH agent_stats AS (
  SELECT
    pc.writing_number,
    pc.agent_name,
    pc.agency_id,
    COALESCE(ag.name, pc.agency_id) AS agency_name,
    -- Total book
    COUNT(*) AS total_policies,
    COUNT(*) FILTER (WHERE pc.status = 'active') AS active_policies,
    COUNT(*) FILTER (WHERE pc.status = 'terminated') AS terminated_policies,
    COUNT(*) FILTER (WHERE pc.is_at_risk AND pc.status = 'active') AS at_risk_count,
    -- Premium
    ROUND(SUM(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_premium,
    ROUND(SUM(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS annual_premium,
    -- 90-day retention (same formula as quality-metrics-direct)
    COUNT(*) FILTER (
      WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
        AND (
          (COALESCE(pc.billing_mode, '1') = '1'
            AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '3 months')
          OR (COALESCE(pc.billing_mode, '1') != '1'
            AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month')
        )
    ) AS retained_90d,
    COUNT(*) FILTER (
      WHERE pc.policy_effective_date <= CURRENT_DATE - INTERVAL '3 months'
        AND pc.paid_to_date >= pc.policy_effective_date + INTERVAL '1 month'
    ) AS eligible_90d
  FROM policy_cache pc
  LEFT JOIN agencies ag ON pc.agency_id = ag.tracker_id
  WHERE pc.product_type IN ('HI', 'HHC')
    AND pc.writing_number IS NOT NULL
  GROUP BY pc.writing_number, pc.agent_name, pc.agency_id, ag.name
),
thresholds AS (
  SELECT * FROM coaching_thresholds WHERE id = 1
)
SELECT
  s.writing_number,
  s.agent_name,
  s.agency_id,
  s.agency_name,
  s.total_policies,
  s.active_policies,
  s.terminated_policies,
  s.at_risk_count,
  s.active_premium,
  s.annual_premium,
  s.retained_90d,
  s.eligible_90d,
  -- Computed percentages
  CASE WHEN s.eligible_90d > 0
    THEN ROUND(100.0 * s.retained_90d / s.eligible_90d, 1)
    ELSE NULL
  END AS retention_pct,
  CASE WHEN s.active_policies > 0
    THEN ROUND(100.0 * s.at_risk_count / s.active_policies, 1)
    ELSE 0
  END AS at_risk_pct,
  CASE WHEN s.total_policies > 0
    THEN ROUND(100.0 * s.terminated_policies / s.total_policies, 1)
    ELSE 0
  END AS terminated_pct,
  -- Threshold breach flags
  CASE WHEN s.eligible_90d >= t.min_eligible_policies
        AND s.eligible_90d > 0
        AND ROUND(100.0 * s.retained_90d / s.eligible_90d, 1) < t.retention_pct_min
    THEN true ELSE false
  END AS flag_retention,
  CASE WHEN s.active_policies >= t.min_eligible_policies
        AND s.active_policies > 0
        AND ROUND(100.0 * s.at_risk_count / s.active_policies, 1) > t.at_risk_pct_max
    THEN true ELSE false
  END AS flag_at_risk,
  CASE WHEN s.total_policies >= t.min_eligible_policies
        AND s.total_policies > 0
        AND ROUND(100.0 * s.terminated_policies / s.total_policies, 1) > t.terminated_pct_max
    THEN true ELSE false
  END AS flag_terminated,
  -- Any flag tripped
  CASE WHEN (
    (s.eligible_90d >= t.min_eligible_policies AND s.eligible_90d > 0
      AND ROUND(100.0 * s.retained_90d / s.eligible_90d, 1) < t.retention_pct_min)
    OR (s.active_policies >= t.min_eligible_policies AND s.active_policies > 0
      AND ROUND(100.0 * s.at_risk_count / s.active_policies, 1) > t.at_risk_pct_max)
    OR (s.total_policies >= t.min_eligible_policies AND s.total_policies > 0
      AND ROUND(100.0 * s.terminated_policies / s.total_policies, 1) > t.terminated_pct_max)
  ) THEN true ELSE false
  END AS needs_coaching,
  -- How many flags tripped (for severity sort)
  (CASE WHEN s.eligible_90d >= t.min_eligible_policies AND s.eligible_90d > 0
        AND ROUND(100.0 * s.retained_90d / s.eligible_90d, 1) < t.retention_pct_min
    THEN 1 ELSE 0 END)
  + (CASE WHEN s.active_policies >= t.min_eligible_policies AND s.active_policies > 0
        AND ROUND(100.0 * s.at_risk_count / s.active_policies, 1) > t.at_risk_pct_max
    THEN 1 ELSE 0 END)
  + (CASE WHEN s.total_policies >= t.min_eligible_policies AND s.total_policies > 0
        AND ROUND(100.0 * s.terminated_policies / s.total_policies, 1) > t.terminated_pct_max
    THEN 1 ELSE 0 END) AS flag_count,
  -- Thresholds (for UI display)
  t.retention_pct_min AS threshold_retention,
  t.at_risk_pct_max AS threshold_at_risk,
  t.terminated_pct_max AS threshold_terminated,
  t.min_eligible_policies AS threshold_min_policies
FROM agent_stats s
CROSS JOIN thresholds t
ORDER BY
  (CASE WHEN s.eligible_90d >= t.min_eligible_policies AND s.eligible_90d > 0
        AND ROUND(100.0 * s.retained_90d / s.eligible_90d, 1) < t.retention_pct_min
    THEN 1 ELSE 0 END)
  + (CASE WHEN s.active_policies >= t.min_eligible_policies AND s.active_policies > 0
        AND ROUND(100.0 * s.at_risk_count / s.active_policies, 1) > t.at_risk_pct_max
    THEN 1 ELSE 0 END)
  + (CASE WHEN s.total_policies >= t.min_eligible_policies AND s.total_policies > 0
        AND ROUND(100.0 * s.terminated_policies / s.total_policies, 1) > t.terminated_pct_max
    THEN 1 ELSE 0 END) DESC,
  s.annual_premium DESC NULLS LAST;
