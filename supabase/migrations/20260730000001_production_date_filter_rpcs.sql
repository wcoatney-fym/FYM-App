-- Time-filtered production RPCs
-- Same shape as agency_production / agent_production views but with date bounds on policy_effective_date.
-- Used by all pages when a time period filter is active. "All Time" still uses the pre-aggregated views.

-- Agency production filtered by date range
CREATE OR REPLACE FUNCTION filtered_agency_production(start_date date, end_date date)
RETURNS TABLE (
  agency_id text,
  agency_name text,
  total_policies bigint,
  active_policies bigint,
  terminated_policies bigint,
  pending_policies bigint,
  at_risk_policies bigint,
  active_monthly_premium numeric,
  active_annual_premium numeric,
  avg_annual_premium numeric,
  policies_this_month bigint,
  ap_this_month numeric,
  policies_last_month bigint,
  ap_last_month numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    pc.agency_id,
    a.name AS agency_name,
    count(*)::bigint AS total_policies,
    count(*) FILTER (WHERE pc.status = 'active')::bigint AS active_policies,
    count(*) FILTER (WHERE pc.status = 'terminated')::bigint AS terminated_policies,
    count(*) FILTER (WHERE pc.status = 'pending')::bigint AS pending_policies,
    count(*) FILTER (WHERE pc.is_at_risk)::bigint AS at_risk_policies,
    round(sum(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_monthly_premium,
    round(sum(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS active_annual_premium,
    round(avg(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS avg_annual_premium,
    count(*) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date))::bigint AS policies_this_month,
    round(sum(pc.plan_premium * 12) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date)), 0) AS ap_this_month,
    count(*) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date - interval '1 month')
                     AND pc.policy_effective_date < date_trunc('month', current_date))::bigint AS policies_last_month,
    round(sum(pc.plan_premium * 12) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date - interval '1 month')
                     AND pc.policy_effective_date < date_trunc('month', current_date)), 0) AS ap_last_month
  FROM policy_cache pc
  LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
  WHERE pc.product_type IN ('HI', 'HHC')
    AND pc.policy_effective_date >= start_date
    AND pc.policy_effective_date < end_date
  GROUP BY pc.agency_id, a.name
  ORDER BY active_annual_premium DESC NULLS LAST;
$$;

-- Agent production filtered by date range
CREATE OR REPLACE FUNCTION filtered_agent_production(start_date date, end_date date)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  writing_number text,
  agency_id text,
  agency_name text,
  total_policies bigint,
  active_policies bigint,
  terminated_policies bigint,
  pending_policies bigint,
  at_risk_policies bigint,
  active_monthly_premium numeric,
  active_annual_premium numeric,
  avg_annual_premium numeric,
  policies_this_month bigint,
  ap_this_month numeric,
  retained_policies bigint,
  ever_drafted bigint,
  retention_pct numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    pc.agent_id,
    p.full_name AS agent_name,
    p.writing_number,
    pc.agency_id,
    a.name AS agency_name,
    count(*)::bigint AS total_policies,
    count(*) FILTER (WHERE pc.status = 'active')::bigint AS active_policies,
    count(*) FILTER (WHERE pc.status = 'terminated')::bigint AS terminated_policies,
    count(*) FILTER (WHERE pc.status = 'pending')::bigint AS pending_policies,
    count(*) FILTER (WHERE pc.is_at_risk)::bigint AS at_risk_policies,
    round(sum(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_monthly_premium,
    round(sum(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS active_annual_premium,
    round(avg(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 0) AS avg_annual_premium,
    count(*) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date))::bigint AS policies_this_month,
    round(sum(pc.plan_premium * 12) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date)), 0) AS ap_this_month,
    count(*) FILTER (WHERE pc.draft_count >= 3)::bigint AS retained_policies,
    count(*) FILTER (WHERE pc.draft_count >= 1)::bigint AS ever_drafted,
    CASE WHEN count(*) FILTER (WHERE pc.draft_count >= 1) > 0
      THEN round(100.0 * count(*) FILTER (WHERE pc.draft_count >= 3) / count(*) FILTER (WHERE pc.draft_count >= 1), 1)
      ELSE NULL
    END AS retention_pct
  FROM policy_cache pc
  LEFT JOIN profiles p ON p.id = pc.agent_id
  LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
  WHERE pc.product_type IN ('HI', 'HHC')
    AND pc.policy_effective_date >= start_date
    AND pc.policy_effective_date < end_date
  GROUP BY pc.agent_id, p.full_name, p.writing_number, pc.agency_id, a.name
  ORDER BY active_annual_premium DESC NULLS LAST;
$$;

-- Monthly production filtered by date range (for trend charts)
CREATE OR REPLACE FUNCTION filtered_monthly_production(start_date date, end_date date)
RETURNS TABLE (
  month text,
  agency_id text,
  agent_id uuid,
  writing_number text,
  product_type text,
  policies bigint,
  annual_premium numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    to_char(pc.policy_effective_date, 'YYYY-MM') AS month,
    pc.agency_id,
    pc.agent_id,
    p.writing_number,
    pc.product_type,
    count(*)::bigint AS policies,
    round(sum(pc.plan_premium * 12), 0) AS annual_premium
  FROM policy_cache pc
  LEFT JOIN profiles p ON p.id = pc.agent_id
  WHERE pc.policy_effective_date IS NOT NULL
    AND pc.policy_effective_date >= start_date
    AND pc.policy_effective_date < end_date
  GROUP BY 1, 2, 3, 4, 5
  ORDER BY 1 DESC, 2;
$$;
