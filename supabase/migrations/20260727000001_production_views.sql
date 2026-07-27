-- Stage 5: Production views for Sales Tracker absorption
-- Views power ProductionPage, AgencyProductionPage, BookOfBusinessPage, and Dashboard production snapshot

-- Monthly production trend (aggregatable by agency, product type)
CREATE OR REPLACE VIEW monthly_production AS
SELECT
  to_char(policy_effective_date, 'YYYY-MM') AS month,
  agency_id,
  product_type,
  count(*) AS policies,
  round(sum(plan_premium), 0) AS monthly_premium,
  round(sum(plan_premium * 12), 0) AS annual_premium,
  count(*) FILTER (WHERE status = 'active') AS active_count,
  count(*) FILTER (WHERE status = 'terminated') AS terminated_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count
FROM policy_cache
WHERE policy_effective_date IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

-- Agency production summary (current state + this/last month)
CREATE OR REPLACE VIEW agency_production AS
SELECT
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
  count(*) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date - interval '1 month') AND pc.policy_effective_date < date_trunc('month', current_date)) AS policies_last_month,
  round(sum(pc.plan_premium * 12) FILTER (WHERE pc.policy_effective_date >= date_trunc('month', current_date - interval '1 month') AND pc.policy_effective_date < date_trunc('month', current_date)), 0) AS ap_last_month
FROM policy_cache pc
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC')
GROUP BY pc.agency_id, a.name
ORDER BY active_annual_premium DESC NULLS LAST;

-- Agent production (per-agent with retention)
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
  count(*) FILTER (WHERE pc.draft_count >= 3) AS retained_policies,
  count(*) FILTER (WHERE pc.draft_count >= 1) AS ever_drafted,
  CASE WHEN count(*) FILTER (WHERE pc.draft_count >= 1) > 0
    THEN round(100.0 * count(*) FILTER (WHERE pc.draft_count >= 3) / count(*) FILTER (WHERE pc.draft_count >= 1), 1)
    ELSE NULL
  END AS retention_pct
FROM policy_cache pc
LEFT JOIN profiles p ON p.id = pc.agent_id
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC')
GROUP BY pc.agent_id, p.full_name, p.writing_number, pc.agency_id, a.name
ORDER BY active_annual_premium DESC NULLS LAST;

-- Book of business (policy-level detail with joins)
CREATE OR REPLACE VIEW book_of_business AS
SELECT
  pc.policy_number,
  pc.agent_id,
  p.full_name AS agent_name,
  p.writing_number,
  pc.agency_id,
  a.name AS agency_name,
  pc.product_type,
  pc.status,
  pc.plan_premium AS monthly_premium,
  pc.plan_premium * 12 AS annual_premium,
  pc.billing_mode,
  pc.policy_effective_date,
  pc.paid_to_date,
  pc.draft_count,
  pc.is_at_risk,
  pc.flag_type,
  pc.last_contact_date,
  pc.synced_at,
  CASE WHEN pc.paid_to_date IS NOT NULL THEN current_date - pc.paid_to_date ELSE NULL END AS days_since_paid
FROM policy_cache pc
LEFT JOIN profiles p ON p.id = pc.agent_id
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type IN ('HI', 'HHC');
