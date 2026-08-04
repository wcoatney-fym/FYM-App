/**
 * agent-directory — Distinct agent directory from production DB
 *
 * Returns unique agents found in Max's production DB, extracted from
 * roster_hierarchy_json. This is the fallback tier for agencies that
 * don't have a roster upload in agency_rosters.
 *
 * For each agent: writing_number, name, agency writing number,
 * policy count, active count, at-risk count, total AP, active AP.
 *
 * Query params:
 *   agency_id:  filter by agency writing number (optional)
 *   page:       1-based page number (default 1)
 *   page_size:  results per page (default 100, max 500)
 *   search:     name search filter (optional)
 */

import {
  createProdConnection,
  CONTRACT_STATUS,
  planToProductType,
  extractAgencyWritingNumber,
  extractAgentWritingNumber,
  resolveRiskFlag,
  jsonResponse,
  corsResponse,
} from "../_shared/prod-db.ts";
import { loadRosterMap } from "../_shared/roster-map.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();
  const url = new URL(req.url);
  const agencyFilter = url.searchParams.get("agency_id");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size")) || 100));
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();
    const rosterMap = await loadRosterMap();

    const FETCH_SIZE = 5000;
    let offset = 0;

    interface AgentEntry {
      writing_number: string;
      agent_name: string | null;
      agency_wn: string | null;
      total_policies: number;
      active_policies: number;
      terminated_policies: number;
      at_risk_policies: number;
      total_annual_premium: number;
      active_annual_premium: number;
    }

    const agents = new Map<string, AgentEntry>();

    while (true) {
      const rows = await sql`
        SELECT
          TRIM(policy_nbr) AS policy_nbr,
          TRIM(plan_code) AS plan_code,
          TRIM(cntrct_code) AS cntrct_code,
          annual_premium,
          at_risk_policy,
          paid_to_date,
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

        const roster = row.roster_hierarchy_json as Array<{
          writing_number: string;
          depth: string;
          is_person: boolean;
          name: string;
        }> | null;

        const hierarchyAgencyWn = extractAgencyWritingNumber(roster);
        const resolvedAgencyWn = rosterMap.resolveAgencyFromHierarchy(roster, hierarchyAgencyWn);

        if (agencyFilter && resolvedAgencyWn !== agencyFilter) continue;

        const agentWn = extractAgentWritingNumber(roster);
        if (!agentWn) continue;

        const cntrctCode = ((row.cntrct_code as string) || "").toUpperCase();
        const status = CONTRACT_STATUS[cntrctCode] || "pending";
        const annualPremium = Number(row.annual_premium) || 0;
        const paidToDate = row.paid_to_date
          ? new Date(row.paid_to_date as string).toISOString().split("T")[0]
          : null;

        const { isAtRisk } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        if (!agents.has(agentWn)) {
          // Get name from deepest person entry
          const sorted = roster
            ? [...roster].sort((a, b) => b.depth.localeCompare(a.depth))
            : [];
          const personEntry = sorted.find((e) => e.is_person);
          const agentName = personEntry?.name?.trim() || null;

          agents.set(agentWn, {
            writing_number: agentWn,
            agent_name: agentName,
            agency_wn: resolvedAgencyWn,
            total_policies: 0,
            active_policies: 0,
            terminated_policies: 0,
            at_risk_policies: 0,
            total_annual_premium: 0,
            active_annual_premium: 0,
          });
        }

        const entry = agents.get(agentWn)!;
        entry.total_policies++;
        entry.total_annual_premium += annualPremium;

        if (status === "active") {
          entry.active_policies++;
          entry.active_annual_premium += annualPremium;
        }
        if (status === "terminated") entry.terminated_policies++;
        if (isAtRisk) entry.at_risk_policies++;
      }

      if (rows.length < FETCH_SIZE) break;
      offset += FETCH_SIZE;
    }

    // Convert to array and apply search filter
    let results = Array.from(agents.values());

    if (search) {
      results = results.filter(
        (a) =>
          (a.agent_name || "").toLowerCase().includes(search) ||
          a.writing_number.toLowerCase().includes(search)
      );
    }

    // Sort by active premium descending
    results.sort((a, b) => b.active_annual_premium - a.active_annual_premium);

    // Round premiums
    for (const r of results) {
      r.total_annual_premium = Math.round(r.total_annual_premium * 100) / 100;
      r.active_annual_premium = Math.round(r.active_annual_premium * 100) / 100;
    }

    const totalCount = results.length;

    // Paginate
    const startIdx = (page - 1) * pageSize;
    const pageResults = results.slice(startIdx, startIdx + pageSize);

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse({
      data: pageResults,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / pageSize),
      },
      _source: "prod_direct",
      _elapsed_ms: elapsedMs,
    });
  } catch (err) {
    console.error("agent-directory error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
