/**
 * agency-roster-data — Agent-level book health from production DB
 *
 * Queries Max's production DB directly for per-agent policy metrics,
 * matched against roster writing numbers.
 *
 * Replaces: roster_agent_summary view (which joined agency_rosters → policy_cache)
 *
 * Query params:
 *   agency_id:       filter by agency writing number
 *   writing_numbers: comma-separated agent writing numbers to look up
 *   agent_wn:        single agent writing number
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
  const agencyFilter = url.searchParams.get("agency_id");
  const writingNumbersRaw = url.searchParams.get("writing_numbers");
  const singleAgentWn = url.searchParams.get("agent_wn");

  const targetWns = new Set<string>();
  if (writingNumbersRaw) {
    for (const wn of writingNumbersRaw.split(",")) {
      const trimmed = wn.trim();
      if (trimmed) targetWns.add(trimmed);
    }
  }
  if (singleAgentWn) targetWns.add(singleAgentWn.trim());

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // Load roster-based agent→agency overrides from FYM App DB.
    const rosterMap = await loadRosterMap();

    const FETCH_SIZE = 5000;
    let offset = 0;

    interface AgentBucket {
      writing_number: string;
      agent_name: string | null;
      total_policies: number;
      active_policies: number;
      at_risk_policies: number;
      total_annual_premium: number;
      active_annual_premium: number;
      policies: Array<{
        policy_number: string;
        product_type: string;
        status: string;
        plan_premium: number;
        annual_premium: number;
        is_at_risk: boolean;
        flag_type: string | null;
        draft_count: number;
        policy_effective_date: string | null;
        paid_to_date: string | null;
        client_name: string | null;
      }>;
    }

    const agentBuckets = new Map<string, AgentBucket>();

    while (true) {
      const rows = await sql`
        SELECT
          TRIM(policy_nbr) AS policy_nbr,
          TRIM(plan_code) AS plan_code,
          TRIM(cntrct_code) AS cntrct_code,
          issue_date,
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

        const roster = row.roster_hierarchy_json as Array<{
          writing_number: string;
          depth: string;
          is_person: boolean;
          name: string;
        }> | null;

        // Agency filter — use roster override when available
        if (agencyFilter) {
          const hierarchyAgencyWn = extractAgencyWritingNumber(roster);
          const agentWn = extractAgentWritingNumber(roster);
          const resolvedAgencyWn = rosterMap.resolveAgency(agentWn, hierarchyAgencyWn);
          if (resolvedAgencyWn !== agencyFilter) continue;
        }

        // Collect all writing numbers from roster for this policy
        const allWns = roster
          ? roster.map((r) => r.writing_number?.trim()).filter(Boolean)
          : [];

        // If we have target writing numbers, only include policies that match
        if (targetWns.size > 0) {
          const matched = allWns.some((wn) => targetWns.has(wn));
          if (!matched) continue;
        }

        // Determine which writing number(s) from our target set matched
        const matchedWns = targetWns.size > 0
          ? allWns.filter((wn) => targetWns.has(wn))
          : [extractAgentWritingNumber(roster)].filter(Boolean);

        if (matchedWns.length === 0) continue;

        const cntrctCode = ((row.cntrct_code as string) || "").toUpperCase();
        const status = CONTRACT_STATUS[cntrctCode] || "pending";
        const annualPremium = Number(row.annual_premium) || 0;
        const monthlyPremium = Math.round((annualPremium / 12) * 100) / 100;

        const issueDate = row.issue_date
          ? new Date(row.issue_date as string).toISOString().split("T")[0]
          : null;
        const paidToDate = row.paid_to_date
          ? new Date(row.paid_to_date as string).toISOString().split("T")[0]
          : null;

        const { isAtRisk, flagType } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        const draftCount = estimateDraftCount(
          issueDate,
          paidToDate,
          row.billing_mode as number | null
        );

        const clientName = [row.first_name as string, row.last_name as string]
          .filter(Boolean)
          .map((s) => s.trim())
          .join(" ") || null;

        const policyRow = {
          policy_number: (row.policy_nbr as string) || "",
          product_type: productType,
          status,
          plan_premium: monthlyPremium,
          annual_premium: annualPremium,
          is_at_risk: isAtRisk,
          flag_type: flagType,
          draft_count: draftCount,
          policy_effective_date: issueDate,
          paid_to_date: paidToDate,
          client_name: clientName,
        };

        // Attribute to each matched writing number
        for (const wn of matchedWns) {
          if (!wn) continue;
          if (!agentBuckets.has(wn)) {
            // Get agent name from roster
            const rosterEntry = roster?.find((r) => r.writing_number?.trim() === wn);
            agentBuckets.set(wn, {
              writing_number: wn,
              agent_name: rosterEntry?.name?.trim() || null,
              total_policies: 0,
              active_policies: 0,
              at_risk_policies: 0,
              total_annual_premium: 0,
              active_annual_premium: 0,
              policies: [],
            });
          }
          const bucket = agentBuckets.get(wn)!;
          bucket.total_policies++;
          bucket.total_annual_premium += annualPremium;
          if (status === "active") {
            bucket.active_policies++;
            bucket.active_annual_premium += annualPremium;
          }
          if (isAtRisk) bucket.at_risk_policies++;
          bucket.policies.push(policyRow);
        }
      }

      if (rows.length < FETCH_SIZE) break;
      offset += FETCH_SIZE;
    }

    // Build response
    const agents = Array.from(agentBuckets.values()).map((b) => ({
      writing_number: b.writing_number,
      agent_name: b.agent_name,
      total_policies: b.total_policies,
      active_policies: b.active_policies,
      at_risk_policies: b.at_risk_policies,
      total_annual_premium: Math.round(b.total_annual_premium * 100) / 100,
      active_annual_premium: Math.round(b.active_annual_premium * 100) / 100,
      policies: b.policies,
    }));

    // Sort by active premium descending
    agents.sort((a, b) => b.active_annual_premium - a.active_annual_premium);

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse({
      data: agents,
      total_agents: agents.length,
      _source: "prod_direct",
      _elapsed_ms: elapsedMs,
    });
  } catch (err) {
    console.error("agency-roster-data error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
