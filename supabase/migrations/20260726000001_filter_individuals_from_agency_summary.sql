-- Fix: filter individual agent names from agency_retention_summary
--
-- Root cause: sync-policy-cache falls back to form_submissions.agency (a person
-- name string) when agency_id is null. Those name strings land in
-- policy_cache.agency_id and the view groups them as if they were agencies.
--
-- Fix: add a WHERE clause that only includes rows whose agency_id looks like a
-- UUID (the real agency identifiers), excluding person-name fallbacks.

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
  -- Only include real agency UUIDs, not person-name fallbacks
  AND agency_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY agency_id;
