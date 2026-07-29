-- Add agent_id + writing_number to monthly_production view so trend charts can filter by agent
CREATE OR REPLACE VIEW monthly_production AS
SELECT
  to_char(pc.policy_effective_date, 'YYYY-MM') AS month,
  pc.agency_id,
  pc.agent_id,
  p.writing_number,
  pc.product_type,
  count(*) AS policies,
  round(sum(pc.plan_premium), 0) AS monthly_premium,
  round(sum(pc.plan_premium * 12), 0) AS annual_premium,
  count(*) FILTER (WHERE pc.status = 'active') AS active_count,
  count(*) FILTER (WHERE pc.status = 'terminated') AS terminated_count,
  count(*) FILTER (WHERE pc.status = 'pending') AS pending_count
FROM policy_cache pc
LEFT JOIN profiles p ON p.id = pc.agent_id
WHERE pc.policy_effective_date IS NOT NULL
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1 DESC, 2, 3, 4, 5;
