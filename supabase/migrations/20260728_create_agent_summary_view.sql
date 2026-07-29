-- Agent summary view: aggregates per-agent production data from policy_cache
-- Replaces the profiles-only Agents page with full production directory
CREATE OR REPLACE VIEW public.agent_summary AS
SELECT
  pc.writing_number,
  pc.agent_name,
  pc.agency_id,
  COALESCE(ag.name, pc.agency_id) AS agency_name,
  COUNT(*)                                                   AS total_policies,
  COUNT(*) FILTER (WHERE pc.status = 'active')               AS active_policies,
  COUNT(*) FILTER (WHERE pc.status = 'pending')              AS pending_policies,
  COUNT(*) FILTER (WHERE pc.status = 'terminated')           AS terminated_policies,
  COUNT(*) FILTER (WHERE pc.is_at_risk AND pc.status = 'active') AS at_risk_count,
  ROUND(SUM(pc.plan_premium) FILTER (WHERE pc.status = 'active'), 2)       AS active_premium,
  ROUND(SUM(pc.plan_premium * 12) FILTER (WHERE pc.status = 'active'), 2)  AS annual_premium,
  -- 90-day retention: policies old enough (90d+) that drafted 3+ times / drafted 1+ time
  COUNT(*) FILTER (WHERE pc.policy_effective_date <= (CURRENT_DATE - INTERVAL '90 days')
                     AND pc.draft_count >= 3)                AS retained_90d,
  COUNT(*) FILTER (WHERE pc.policy_effective_date <= (CURRENT_DATE - INTERVAL '90 days')
                     AND pc.draft_count >= 1)                AS eligible_90d,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pc.policy_effective_date <= (CURRENT_DATE - INTERVAL '90 days')
                               AND pc.draft_count >= 3)::numeric
    / NULLIF(COUNT(*) FILTER (WHERE pc.policy_effective_date <= (CURRENT_DATE - INTERVAL '90 days')
                               AND pc.draft_count >= 1), 0)::numeric,
    1
  ) AS retention_pct,
  -- Link to provisioned profile if exists (for health view, role badge)
  p.id   AS profile_id,
  p.role AS profile_role
FROM policy_cache pc
LEFT JOIN agencies ag ON pc.agency_id = ag.tracker_id
LEFT JOIN profiles p  ON p.writing_number = pc.writing_number
WHERE pc.product_type = ANY(ARRAY['HI', 'HHC'])
  AND pc.writing_number IS NOT NULL
GROUP BY pc.writing_number, pc.agent_name, pc.agency_id, ag.name, p.id, p.role;
