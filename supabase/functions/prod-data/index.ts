/**
 * prod-data — Production metrics edge function
 *
 * Queries Max's production DB directly for:
 * - Org-wide and per-agency production KPIs (active policies, premium, at-risk)
 * - Per-agent production breakdowns
 * - Daily production for trend charts
 * - Monthly production aggregates
 * - Product mix breakdowns
 *
 * Replaces: policy_cache table reads + agency_production / agent_production /
 *           monthly_production / filtered_* RPC views
 *
 * Query params:
 *   type:       "agency" | "agent" | "daily" | "monthly" | "product_mix"
 *   agency_id:  filter by agency (tracker_id / writing_number)
 *   agent_id:   filter by agent writing number
 *   start_date: YYYY-MM-DD
 *   end_date:   YYYY-MM-DD
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
  const type = url.searchParams.get("type") || "agency";
  const agencyFilter = url.searchParams.get("agency_id");
  const agentFilter = url.searchParams.get("agent_id");
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // Load roster-based agent→agency overrides from FYM App DB.
    // When an agent's writing number exists in a roster, the roster's
    // agency assignment takes precedence over the UNL hierarchy.
    const rosterMap = await loadRosterMap();

    // Build the base query with optional date filter
    const dateFilter = startDate && endDate
      ? sql`AND app_recvd_date >= ${startDate}::date AND app_recvd_date < ${endDate}::date`
      : sql``;

    // Fetch all policies in one sweep (paginated for memory safety)
    const PAGE_SIZE = 5000;
    let offset = 0;

    // Accumulators by type
    const agencyMap = new Map<string, {
      agency_id: string;
      total_policies: number;
      total_annual_premium: number;
      active_policies: number;
      terminated_policies: number;
      pending_policies: number;
      at_risk_policies: number;
      active_monthly_premium: number;
      active_annual_premium: number;
      terminated_annual_premium: number;
      pending_annual_premium: number;
      at_risk_annual_premium: number;
      policies_this_month: number;
      ap_this_month: number;
      policies_last_month: number;
      ap_last_month: number;
    }>();

    const agentMap = new Map<string, {
      agent_id: string;
      agent_name: string | null;
      writing_number: string | null;
      agency_id: string;
      total_policies: number;
      active_policies: number;
      terminated_policies: number;
      pending_policies: number;
      at_risk_policies: number;
      active_monthly_premium: number;
      active_annual_premium: number;
      policies_this_month: number;
      ap_this_month: number;
      retained_policies: number;
      ever_drafted: number;
    }>();

    const dailyMap = new Map<string, Map<string, { policies: number; annual_premium: number }>>();
    const monthlyMap = new Map<string, Map<string, { policies: number; annual_premium: number }>>();
    const productMixMap = new Map<string, Map<string, number>>();

    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

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
        WHERE 1=1 ${dateFilter}
        ORDER BY policy_nbr
        OFFSET ${offset}
        LIMIT ${PAGE_SIZE}
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

        // Roster override: scan ALL hierarchy writing numbers for a roster match.
        // This catches agents whose individual writing number appears at any
        // depth in the UNL hierarchy, even if extractAgentWritingNumber returns
        // a different entry.
        const agencyWn = rosterMap.resolveAgencyFromHierarchy(roster, hierarchyAgencyWn);
        const agencyId = agencyWn || "unknown";

        // Apply agency filter if set
        if (agencyFilter && agencyId !== agencyFilter) continue;

        // Apply agent filter if set
        if (agentFilter && agentWn !== agentFilter) continue;

        const { isAtRisk } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        const draftCount = estimateDraftCount(appRecvdDate, paidToDate, row.billing_mode as number | null);
        const appRecvdDateMonth = appRecvdDate ? appRecvdDate.slice(0, 7) : null;
        const clientName = [row.first_name as string, row.last_name as string]
          .filter(Boolean)
          .map((s) => s.trim())
          .join(" ") || null;

        // ── Agency accumulation ──
        if (type === "agency" || type === "daily" || type === "monthly" || type === "product_mix") {
          if (!agencyMap.has(agencyId)) {
            agencyMap.set(agencyId, {
              agency_id: agencyId,
              total_policies: 0,
              total_annual_premium: 0,
              active_policies: 0,
              terminated_policies: 0,
              pending_policies: 0,
              at_risk_policies: 0,
              active_monthly_premium: 0,
              active_annual_premium: 0,
              terminated_annual_premium: 0,
              pending_annual_premium: 0,
              at_risk_annual_premium: 0,
              policies_this_month: 0,
              ap_this_month: 0,
              policies_last_month: 0,
              ap_last_month: 0,
            });
          }
          const ag = agencyMap.get(agencyId)!;
          ag.total_policies++;
          ag.total_annual_premium += annualPremium;
          if (status === "active") {
            ag.active_policies++;
            ag.active_monthly_premium += monthlyPremium;
            ag.active_annual_premium += annualPremium;
          }
          if (status === "terminated") {
            ag.terminated_policies++;
            ag.terminated_annual_premium += annualPremium;
          }
          if (status === "pending") {
            ag.pending_policies++;
            ag.pending_annual_premium += annualPremium;
          }
          if (isAtRisk) {
            ag.at_risk_policies++;
            ag.at_risk_annual_premium += annualPremium;
          }
          if (appRecvdDateMonth === thisMonthKey) {
            ag.policies_this_month++;
            ag.ap_this_month += annualPremium;
          }
          if (appRecvdDateMonth === lastMonthKey) {
            ag.policies_last_month++;
            ag.ap_last_month += annualPremium;
          }
        }

        // ── Agent accumulation ──
        if (type === "agent" && agentWn) {
          if (!agentMap.has(agentWn)) {
            agentMap.set(agentWn, {
              agent_id: agentWn,
              agent_name: clientName,
              writing_number: agentWn,
              agency_id: agencyId,
              total_policies: 0,
              active_policies: 0,
              terminated_policies: 0,
              pending_policies: 0,
              at_risk_policies: 0,
              active_monthly_premium: 0,
              active_annual_premium: 0,
              policies_this_month: 0,
              ap_this_month: 0,
              retained_policies: 0,
              ever_drafted: 0,
            });
          }
          const agt = agentMap.get(agentWn)!;
          agt.total_policies++;
          if (status === "active") {
            agt.active_policies++;
            agt.active_monthly_premium += monthlyPremium;
            agt.active_annual_premium += annualPremium;
          }
          if (status === "terminated") agt.terminated_policies++;
          if (status === "pending") agt.pending_policies++;
          if (isAtRisk) agt.at_risk_policies++;
          if (appRecvdDateMonth === thisMonthKey) {
            agt.policies_this_month++;
            agt.ap_this_month += annualPremium;
          }
          if (draftCount >= 1) agt.ever_drafted++;
          if (draftCount >= 3) agt.retained_policies++;
        }

        // ── Daily accumulation ──
        if (type === "daily" && appRecvdDate) {
          if (!dailyMap.has(agencyId)) dailyMap.set(agencyId, new Map());
          const dm = dailyMap.get(agencyId)!;
          const existing = dm.get(appRecvdDate) || { policies: 0, annual_premium: 0 };
          existing.policies++;
          existing.annual_premium += annualPremium;
          dm.set(appRecvdDate, existing);
        }

        // ── Monthly accumulation ──
        if (type === "monthly" && appRecvdDateMonth) {
          if (!monthlyMap.has(agencyId)) monthlyMap.set(agencyId, new Map());
          const mm = monthlyMap.get(agencyId)!;
          const existing = mm.get(appRecvdDateMonth) || { policies: 0, annual_premium: 0 };
          existing.policies++;
          existing.annual_premium += annualPremium;
          mm.set(appRecvdDateMonth, existing);
        }

        // ── Product mix ──
        if (type === "product_mix" && status === "active") {
          if (!productMixMap.has(agencyId)) productMixMap.set(agencyId, new Map());
          const pm = productMixMap.get(agencyId)!;
          pm.set(productType, (pm.get(productType) || 0) + 1);
        }
      }

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Build response based on type
    let result: unknown;

    switch (type) {
      case "agency": {
        const agencies = Array.from(agencyMap.values()).map((a) => ({
          ...a,
          avg_annual_premium:
            a.active_policies > 0 ? Math.round((a.active_annual_premium / a.active_policies) * 100) / 100 : 0,
        }));
        result = agencies;
        break;
      }
      case "agent": {
        const agents = Array.from(agentMap.values()).map((a) => ({
          ...a,
          avg_annual_premium:
            a.active_policies > 0 ? Math.round((a.active_annual_premium / a.active_policies) * 100) / 100 : 0,
          retention_pct:
            a.ever_drafted > 0 ? Math.round((a.retained_policies / a.ever_drafted) * 1000) / 10 : null,
        }));
        result = agents;
        break;
      }
      case "daily": {
        const dailyRows: Array<{ agency_id: string; day: string; policies: number; annual_premium: number }> = [];
        for (const [agencyId, days] of dailyMap) {
          for (const [day, vals] of days) {
            dailyRows.push({ agency_id: agencyId, day, ...vals });
          }
        }
        result = dailyRows;
        break;
      }
      case "monthly": {
        const monthlyRows: Array<{ agency_id: string; month: string; policies: number; annual_premium: number }> = [];
        for (const [agencyId, months] of monthlyMap) {
          for (const [month, vals] of months) {
            monthlyRows.push({ agency_id: agencyId, month, ...vals });
          }
        }
        result = monthlyRows;
        break;
      }
      case "product_mix": {
        const mixRows: Array<{ agency_id: string; product_type: string; count: number }> = [];
        for (const [agencyId, products] of productMixMap) {
          for (const [productType, count] of products) {
            mixRows.push({ agency_id: agencyId, product_type: productType, count });
          }
        }
        result = mixRows;
        break;
      }
      default:
        return jsonResponse({ error: `Unknown type: ${type}` }, 400);
    }

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse({ data: result, _source: "prod_direct", _elapsed_ms: elapsedMs });
  } catch (err) {
    console.error("prod-data error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
