/**
 * retention-data — 90-day retention & at-risk edge function
 *
 * Queries Max's production DB directly for:
 * - 90-day retention rates (org-wide and per-agency)
 * - At-risk policy lists with flag types
 * - Retention-eligible cohort breakdowns
 * - Agency retention summary (for AgencyDetailPage KPI strip)
 *
 * Replaces: agency_retention_summary view, at-risk reads from policy_cache,
 *           retention calcs in DashboardPage
 *
 * Query params:
 *   type:       "summary" | "at_risk" | "cohort" (default: "summary")
 *   agency_id:  filter by agency writing number / tracker_id
 *   days:       retention window in days (default: 90)
 */

import {
  createProdConnection,
  CONTRACT_STATUS,
  planToProductType,
  extractAgencyWritingNumber,
  extractAgentWritingNumber,
  resolveRiskFlag,
  estimateDraftCount,
  jsonResponse,
  corsResponse,
} from "../_shared/prod-db.ts";
import { loadRosterMap } from "../_shared/roster-map.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "summary";
  const agencyFilter = url.searchParams.get("agency_id");
  const retentionDays = Number(url.searchParams.get("days") || "90");

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // Load roster-based agent→agency overrides from FYM App DB.
    const rosterMap = await loadRosterMap();

    const FETCH_SIZE = 5000;
    let offset = 0;

    // Per-agency retention accumulators
    interface RetentionBucket {
      agency_id: string;
      total_policies: number;
      active_policies: number;
      terminated_policies: number;
      active_premium: number;
      at_risk_count: number;
      eligible: number;   // policies old enough to be measured
      retained: number;   // eligible that drafted ≥3 times (monthly) or still active (non-monthly)
      at_risk_list: Array<{
        policy_number: string;
        product_type: string;
        status: string;
        plan_premium: number;
        paid_to_date: string | null;
        policy_effective_date: string | null;
        draft_count: number;
        flag_type: string | null;
        agent_writing_number: string | null;
        client_name: string | null;
        days_idle: number;
      }>;
    }

    const buckets = new Map<string, RetentionBucket>();

    // Cohort map: issue month → { eligible, retained }
    const cohortMap = new Map<string, { eligible: number; retained: number }>();
    // Per-agency cohort map: agencyId → month → { eligible, retained }
    const agencyCohortMap = new Map<string, Map<string, { eligible: number; retained: number }>>();

    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    while (true) {
      const rows = await sql`
        SELECT
          TRIM(policy_nbr) AS policy_nbr,
          TRIM(plan_code) AS plan_code,
          TRIM(cntrct_code) AS cntrct_code,
          app_recvd_date,
          paid_to_date,
          term_date,
          annual_premium,
          billing_mode,
          at_risk_policy,
          TRIM(first_name) AS first_name,
          TRIM(last_name) AS last_name,
          roster_hierarchy_json
        FROM typed.unl_fym_policy_latest_load
        ORDER BY policy_nbr
        OFFSET ${offset}
        LIMIT ${FETCH_SIZE}
      `;

      if (rows.length === 0) break;

      for (const row of rows) {
        const planCode = (row.plan_code as string) || "";
        const productType = planToProductType(planCode);
        if (productType !== "HI" && productType !== "HHC") continue;

        const cntrctCode = ((row.cntrct_code as string) || "").toUpperCase();
        const status = CONTRACT_STATUS[cntrctCode] || "pending";

        const annualPremium = Number(row.annual_premium) || 0;
        const monthlyPremium = Math.round((annualPremium / 12) * 100) / 100;

        const appRecvdDate = row.app_recvd_date
          ? new Date(row.app_recvd_date as string).toISOString().split("T")[0]
          : null;
        const paidToDate = row.paid_to_date
          ? new Date(row.paid_to_date as string).toISOString().split("T")[0]
          : null;

        const roster = row.roster_hierarchy_json as Array<{
          writing_number: string;
          depth: string;
          is_person: boolean;
          name: string;
        }> | null;

        const hierarchyAgencyWn = extractAgencyWritingNumber(roster);
        const agentWn = extractAgentWritingNumber(roster);

        // Roster override: scan ALL hierarchy writing numbers for a roster match
        const agencyWn = rosterMap.resolveAgencyFromHierarchy(roster, hierarchyAgencyWn);

        // Agency filter
        if (agencyFilter && agencyWn !== agencyFilter) continue;

        const agencyId = agencyWn || "unknown";

        const { isAtRisk, flagType } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        const draftCount = estimateDraftCount(
          appRecvdDate,
          paidToDate,
          row.billing_mode as number | null
        );

        const billingMode = (row.billing_mode as number | null) ?? 1;
        const clientName = [row.first_name as string, row.last_name as string]
          .filter(Boolean)
          .map((s) => s.trim())
          .join(" ") || null;

        // Days idle (days since paid_to_date)
        const daysIdle = paidToDate
          ? Math.max(0, Math.floor((now.getTime() - new Date(paidToDate).getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        // Init bucket
        if (!buckets.has(agencyId)) {
          buckets.set(agencyId, {
            agency_id: agencyId,
            total_policies: 0,
            active_policies: 0,
            terminated_policies: 0,
            active_premium: 0,
            at_risk_count: 0,
            eligible: 0,
            retained: 0,
            at_risk_list: [],
          });
        }
        const bucket = buckets.get(agencyId)!;

        bucket.total_policies++;
        if (status === "active") {
          bucket.active_policies++;
          bucket.active_premium += monthlyPremium;
        }
        if (status === "terminated") {
          bucket.terminated_policies++;
        }
        if (isAtRisk) {
          bucket.at_risk_count++;
          bucket.at_risk_list.push({
            policy_number: (row.policy_nbr as string) || "",
            product_type: productType,
            status,
            plan_premium: monthlyPremium,
            paid_to_date: paidToDate,
            policy_effective_date: appRecvdDate,
            draft_count: draftCount,
            flag_type: flagType,
            agent_writing_number: agentWn,
            client_name: clientName,
            days_idle: daysIdle,
          });
        }

        // Retention eligibility: policy must be old enough
        if (appRecvdDate) {
          const appRecvdDateObj = new Date(appRecvdDate);

          if (appRecvdDateObj <= retentionCutoff) {
            bucket.eligible++;

            // Retained = drafted ≥3 for monthly, or ≥1 successful draft for non-monthly
            const isRetained = billingMode === 1
              ? draftCount >= 3
              : draftCount >= 1;

            if (isRetained) bucket.retained++;

            // Cohort tracking (org-wide + per-agency)
            if (type === "cohort" || type === "summary") {
              const monthKey = appRecvdDate.slice(0, 7);
              if (!cohortMap.has(monthKey)) {
                cohortMap.set(monthKey, { eligible: 0, retained: 0 });
              }
              const cohort = cohortMap.get(monthKey)!;
              cohort.eligible++;
              if (isRetained) cohort.retained++;

              // Per-agency cohort
              if (!agencyCohortMap.has(agencyId)) {
                agencyCohortMap.set(agencyId, new Map());
              }
              const agencyMonths = agencyCohortMap.get(agencyId)!;
              if (!agencyMonths.has(monthKey)) {
                agencyMonths.set(monthKey, { eligible: 0, retained: 0 });
              }
              const ac = agencyMonths.get(monthKey)!;
              ac.eligible++;
              if (isRetained) ac.retained++;
            }
          }
        }
      }

      if (rows.length < FETCH_SIZE) break;
      offset += FETCH_SIZE;
    }

    let result: unknown;

    switch (type) {
      case "summary": {
        // Compute recent-3-month retention per agency from agencyCohortMap
        const now3mo = new Date();
        now3mo.setMonth(now3mo.getMonth() - 3);
        const recent3moStart = now3mo.toISOString().slice(0, 7); // e.g. "2026-05"

        function computeRecent3mo(agencyId: string): number | null {
          const months = agencyCohortMap.get(agencyId);
          if (!months) return null;
          let elig = 0, ret = 0;
          for (const [month, c] of months) {
            if (month >= recent3moStart) {
              elig += c.eligible;
              ret += c.retained;
            }
          }
          return elig > 0 ? Math.round((ret / elig) * 1000) / 10 : null;
        }

        // Compute prior-3-month retention per agency (the 3 months before recent 3)
        const now6mo = new Date();
        now6mo.setMonth(now6mo.getMonth() - 6);
        const prior3moStart = now6mo.toISOString().slice(0, 7);

        function computePrior3mo(agencyId: string): number | null {
          const months = agencyCohortMap.get(agencyId);
          if (!months) return null;
          let elig = 0, ret = 0;
          for (const [month, c] of months) {
            if (month >= prior3moStart && month < recent3moStart) {
              elig += c.eligible;
              ret += c.retained;
            }
          }
          return elig > 0 ? Math.round((ret / elig) * 1000) / 10 : null;
        }

        // Return per-agency retention summaries
        const summaries = Array.from(buckets.values()).map((b) => ({
          agency_id: b.agency_id,
          active_policies: b.active_policies,
          terminated_policies: b.terminated_policies,
          active_premium: Math.round(b.active_premium * 100) / 100,
          at_risk_count: b.at_risk_count,
          retained_90d: b.retained,
          eligible_90d: b.eligible,
          retention_pct: b.eligible > 0
            ? Math.round((b.retained / b.eligible) * 1000) / 10
            : null,
          recent_3mo_pct: computeRecent3mo(b.agency_id),
          prior_3mo_pct: computePrior3mo(b.agency_id),
        }));

        // Org-wide totals
        const orgEligible = summaries.reduce((s, a) => s + a.eligible_90d, 0);
        const orgRetained = summaries.reduce((s, a) => s + a.retained_90d, 0);

        result = {
          org_wide: {
            total_agencies: summaries.length,
            total_active_policies: summaries.reduce((s, a) => s + a.active_policies, 0),
            total_terminated_policies: summaries.reduce((s, a) => s + a.terminated_policies, 0),
            total_active_premium: Math.round(summaries.reduce((s, a) => s + a.active_premium, 0) * 100) / 100,
            total_at_risk: summaries.reduce((s, a) => s + a.at_risk_count, 0),
            eligible_90d: orgEligible,
            retained_90d: orgRetained,
            retention_pct: orgEligible > 0 ? Math.round((orgRetained / orgEligible) * 1000) / 10 : null,
          },
          agencies: summaries.sort((a, b) => (b.retention_pct ?? 0) - (a.retention_pct ?? 0)),
        };
        break;
      }

      case "at_risk": {
        // Return at-risk policy lists, optionally scoped by agency
        const atRiskRows: Array<{
          agency_id: string;
          policy_number: string;
          product_type: string;
          status: string;
          plan_premium: number;
          paid_to_date: string | null;
          policy_effective_date: string | null;
          draft_count: number;
          flag_type: string | null;
          agent_writing_number: string | null;
          client_name: string | null;
          days_idle: number;
        }> = [];

        for (const bucket of buckets.values()) {
          for (const p of bucket.at_risk_list) {
            atRiskRows.push({ agency_id: bucket.agency_id, ...p });
          }
        }

        // Sort by days idle descending (most urgent first)
        atRiskRows.sort((a, b) => b.days_idle - a.days_idle);

        result = {
          total_at_risk: atRiskRows.length,
          policies: atRiskRows,
        };
        break;
      }

      case "cohort": {
        // Return monthly cohort retention breakdown (org-wide)
        const cohorts = Array.from(cohortMap.entries())
          .map(([month, c]) => ({
            month,
            eligible: c.eligible,
            retained: c.retained,
            retention_pct: c.eligible > 0
              ? Math.round((c.retained / c.eligible) * 1000) / 10
              : null,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));

        // Per-agency monthly cohort breakdown
        const agencyCohorts: Array<{
          agency_id: string;
          month: string;
          eligible: number;
          retained: number;
          retention_pct: number | null;
        }> = [];
        for (const [agencyId, months] of agencyCohortMap) {
          for (const [month, c] of months) {
            agencyCohorts.push({
              agency_id: agencyId,
              month,
              eligible: c.eligible,
              retained: c.retained,
              retention_pct: c.eligible > 0
                ? Math.round((c.retained / c.eligible) * 1000) / 10
                : null,
            });
          }
        }
        agencyCohorts.sort((a, b) =>
          a.agency_id.localeCompare(b.agency_id) || a.month.localeCompare(b.month)
        );

        result = { cohorts, agency_cohorts: agencyCohorts };
        break;
      }

      default:
        return jsonResponse({ error: `Unknown type: ${type}` }, 400);
    }

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse({ data: result, _source: "prod_direct", _elapsed_ms: elapsedMs });
  } catch (err) {
    console.error("retention-data error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
