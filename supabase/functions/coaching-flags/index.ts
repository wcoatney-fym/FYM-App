/**
 * coaching-flags — Agent coaching identification edge function
 *
 * Queries Max's production DB directly for per-agent book metrics,
 * then compares against configurable thresholds stored in the FYM App
 * Supabase (coaching_thresholds table) to flag agents needing coaching.
 *
 * Three flags:
 *   - retention: 90-day persistency below threshold
 *   - at_risk: at-risk % of active book above threshold
 *   - terminated: terminated % of total book above threshold
 *
 * Query params:
 *   agency_id:  filter by agency writing number (optional)
 *   agent_id:   filter by agent writing number (optional, for agent self-view)
 */

import {
  createProdConnection,
  CONTRACT_STATUS,
  FYM_MGA_WN,
  planToProductType,
  toTitleCase,
  jsonResponse,
  corsResponse,
} from "../_shared/prod-db.ts";
import { loadRosterMap } from "../_shared/roster-map.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const url = new URL(req.url);
  const agencyFilter = url.searchParams.get("agency_id");
  const agentFilter = url.searchParams.get("agent_id");

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    // 1. Load thresholds from FYM App Supabase
    const appUrl = Deno.env.get("APP_SUPABASE_URL");
    const appKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || Deno.env.get("APP_SUPABASE_ANON_KEY");
    if (!appUrl || !appKey) {
      return jsonResponse({ error: "Missing APP_SUPABASE_URL or APP_SUPABASE_SERVICE_KEY" }, 500);
    }

    const appClient = createClient(appUrl, appKey);
    const { data: thresholdRow, error: thErr } = await appClient
      .from("coaching_thresholds")
      .select("retention_pct_min, at_risk_pct_max, terminated_pct_max, min_eligible_policies")
      .eq("id", 1)
      .maybeSingle();

    if (thErr) {
      return jsonResponse({ error: `Thresholds load failed: ${thErr.message}` }, 500);
    }

    const thresholds = {
      retention_pct_min: Number(thresholdRow?.retention_pct_min ?? 90),
      at_risk_pct_max: Number(thresholdRow?.at_risk_pct_max ?? 15),
      terminated_pct_max: Number(thresholdRow?.terminated_pct_max ?? 20),
      min_eligible_policies: Number(thresholdRow?.min_eligible_policies ?? 5),
    };

    // 2. Load roster map for agency name resolution
    const rosterMap = await loadRosterMap();

    // 3. Query Max's prod DB for per-agent stats
    sql = createProdConnection();

    const agencyWhere = agencyFilter
      ? agencyFilter === FYM_MGA_WN
        ? sql`AND (TRIM(ga) = ${agencyFilter} OR ga IS NULL OR TRIM(ga) = '')`
        : sql`AND TRIM(ga) = ${agencyFilter}`
      : sql``;

    const agentWhere = agentFilter
      ? sql`AND TRIM(wa) = ${agentFilter}`
      : sql``;

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().slice(0, 10);

    const rows = await sql`
      WITH agent_agg AS (
        SELECT
          TRIM(wa) AS writing_number,
          MAX(TRIM(wa_name)) AS agent_name,
          COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_wn,
          COUNT(*) AS total_policies,
          COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'A') AS active_policies,
          COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'T') AS terminated_policies,
          COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'A' AND COALESCE(at_risk_policy, false) = true) AS at_risk_count,
          ROUND(SUM(COALESCE(annual_premium, 0) / 12.0) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'A'), 0) AS active_premium,
          ROUND(SUM(COALESCE(annual_premium, 0)) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'A'), 0) AS annual_premium,
          -- 90-day retention: same formula as quality-metrics-direct
          COUNT(*) FILTER (
            WHERE issue_date <= ${threeMonthsAgoStr}::date
              AND (
                (COALESCE(billing_mode::text, '1') = '1'
                  AND paid_to_date >= issue_date + INTERVAL '3 months')
                OR (COALESCE(billing_mode::text, '1') != '1'
                  AND paid_to_date >= issue_date + INTERVAL '1 month')
              )
          ) AS retained_90d,
          COUNT(*) FILTER (
            WHERE issue_date <= ${threeMonthsAgoStr}::date
              AND paid_to_date >= issue_date + INTERVAL '1 month'
          ) AS eligible_90d
        FROM typed.unl_fym_policy_latest_load
        WHERE TRIM(wa) IS NOT NULL
          AND TRIM(wa) != ''
          ${agencyWhere}
          ${agentWhere}
        GROUP BY TRIM(wa), COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN})
      )
      SELECT * FROM agent_agg
      ORDER BY annual_premium DESC NULLS LAST
    `;

    // 4. Compute flags in JS (thresholds from app DB, stats from prod DB)
    const agents = rows.map((r: any) => {
      const writingNumber = r.writing_number;
      const agentName = r.agent_name ? toTitleCase(r.agent_name) : null;
      const agencyWn = r.agency_wn;
      const agencyEntry = rosterMap.get(agencyWn);
      const agencyName = agencyEntry?.name
        ? toTitleCase(agencyEntry.name)
        : agencyWn;

      const totalPolicies = Number(r.total_policies);
      const activePolicies = Number(r.active_policies);
      const terminatedPolicies = Number(r.terminated_policies);
      const atRiskCount = Number(r.at_risk_count);
      const activePremium = Number(r.active_premium ?? 0);
      const annualPremium = Number(r.annual_premium ?? 0);
      const retained90d = Number(r.retained_90d);
      const eligible90d = Number(r.eligible_90d);

      const retentionPct = eligible90d > 0
        ? Math.round(1000 * retained90d / eligible90d) / 10
        : null;
      const atRiskPct = activePolicies > 0
        ? Math.round(1000 * atRiskCount / activePolicies) / 10
        : 0;
      const terminatedPct = totalPolicies > 0
        ? Math.round(1000 * terminatedPolicies / totalPolicies) / 10
        : 0;

      const flagRetention = eligible90d >= thresholds.min_eligible_policies
        && eligible90d > 0
        && retentionPct !== null
        && retentionPct < thresholds.retention_pct_min;

      const flagAtRisk = activePolicies >= thresholds.min_eligible_policies
        && activePolicies > 0
        && atRiskPct > thresholds.at_risk_pct_max;

      const flagTerminated = totalPolicies >= thresholds.min_eligible_policies
        && totalPolicies > 0
        && terminatedPct > thresholds.terminated_pct_max;

      const flagCount = (flagRetention ? 1 : 0) + (flagAtRisk ? 1 : 0) + (flagTerminated ? 1 : 0);
      const needsCoaching = flagCount > 0;

      return {
        writing_number: writingNumber,
        agent_name: agentName,
        agency_id: agencyWn,
        agency_name: agencyName,
        total_policies: totalPolicies,
        active_policies: activePolicies,
        terminated_policies: terminatedPolicies,
        at_risk_count: atRiskCount,
        active_premium: activePremium,
        annual_premium: annualPremium,
        retained_90d: retained90d,
        eligible_90d: eligible90d,
        retention_pct: retentionPct,
        at_risk_pct: atRiskPct,
        terminated_pct: terminatedPct,
        flag_retention: flagRetention,
        flag_at_risk: flagAtRisk,
        flag_terminated: flagTerminated,
        needs_coaching: needsCoaching,
        flag_count: flagCount,
        threshold_retention: thresholds.retention_pct_min,
        threshold_at_risk: thresholds.at_risk_pct_max,
        threshold_terminated: thresholds.terminated_pct_max,
        threshold_min_policies: thresholds.min_eligible_policies,
      };
    });

    // Sort: flagged first (by flag count desc), then by annual premium desc
    agents.sort((a: any, b: any) => {
      if (b.flag_count !== a.flag_count) return b.flag_count - a.flag_count;
      return (b.annual_premium ?? 0) - (a.annual_premium ?? 0);
    });

    return jsonResponse({
      agents,
      thresholds,
      total: agents.length,
      flagged: agents.filter((a: any) => a.needs_coaching).length,
    });
  } catch (err: any) {
    console.error("coaching-flags error:", err);
    return jsonResponse({ error: err.message ?? "Internal error" }, 500);
  } finally {
    if (sql) await sql.end();
  }
});
