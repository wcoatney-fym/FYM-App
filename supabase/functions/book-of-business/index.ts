/**
 * book-of-business — Paginated policy list edge function
 *
 * Queries Max's production DB directly for individual policy rows.
 * Supports filtering, search, sorting, and pagination.
 *
 * Replaces: direct policy_cache table reads on AgencyDetailPage,
 *           AgencyRosterPage (agent detail dialog), CcDashboardTab
 *
 * Query params:
 *   agency_id:      filter by agency tracker_id
 *   agent_wn:       filter by agent writing number
 *   writing_numbers: comma-separated writing numbers (for roster agent lookup)
 *   status:         "active" | "terminated" | "pending" | "suspended" | "all" (default: "all")
 *   product_type:   "HI" | "HHC" | "all" (default: "all")
 *   at_risk:        "true" to show only at-risk policies
 *   search:         search policy_nbr or client name
 *   sort:           "premium" | "submit_date" | "paid_to_date" | "policy_nbr" (default: "premium")
 *   order:          "asc" | "desc" (default: "desc")
 *   page:           0-based page number (default: 0)
 *   page_size:      rows per page, max 500 (default: 100)
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
  const agentWnFilter = url.searchParams.get("agent_wn");
  const writingNumbersRaw = url.searchParams.get("writing_numbers");
  const statusFilter = url.searchParams.get("status") || "all";
  const productFilter = url.searchParams.get("product_type") || "all";
  const atRiskOnly = url.searchParams.get("at_risk") === "true";
  const searchTerm = url.searchParams.get("search")?.trim() || "";
  const sortField = url.searchParams.get("sort") || "premium";
  const sortOrder = url.searchParams.get("order") || "desc";
  const page = Math.max(0, Number(url.searchParams.get("page") || "0"));
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size") || "100")));

  const writingNumbers = writingNumbersRaw
    ? writingNumbersRaw.split(",").map((w) => w.trim()).filter(Boolean)
    : [];

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // Load roster-based agent→agency overrides from FYM App DB.
    const rosterMap = await loadRosterMap();

    // Fetch all matching policies from prod
    // We fetch in batches, apply in-memory filters, then paginate
    const FETCH_SIZE = 5000;
    let offset = 0;

    interface PolicyRow {
      policy_number: string;
      product_type: string;
      status: string;
      plan_premium: number;
      annual_premium: number;
      paid_to_date: string | null;
      policy_effective_date: string | null;
      term_date: string | null;
      draft_count: number;
      is_at_risk: boolean;
      flag_type: string | null;
      agency_id: string;
      agent_writing_number: string | null;
      client_name: string | null;
      billing_mode: number | null;
      writing_number: string | null;
    }

    const allPolicies: PolicyRow[] = [];

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

        // Product filter
        if (productFilter !== "all" && productType !== productFilter) continue;

        const cntrctCode = ((row.cntrct_code as string) || "").toUpperCase();
        const status = CONTRACT_STATUS[cntrctCode] || "pending";

        // Status filter
        if (statusFilter !== "all" && status !== statusFilter) continue;

        const annualPremium = Number(row.annual_premium) || 0;
        const monthlyPremium = Math.round((annualPremium / 12) * 100) / 100;

        const appRecvdDate = row.app_recvd_date
          ? new Date(row.app_recvd_date as string).toISOString().split("T")[0]
          : null;
        const paidToDate = row.paid_to_date
          ? new Date(row.paid_to_date as string).toISOString().split("T")[0]
          : null;
        const termDate = row.term_date
          ? new Date(row.term_date as string).toISOString().split("T")[0]
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

        // Agency filter — match against agency writing number
        if (agencyFilter && agencyWn !== agencyFilter) continue;

        // Agent filter
        if (agentWnFilter && agentWn !== agentWnFilter) continue;

        // Writing numbers filter (roster agent lookup)
        if (writingNumbers.length > 0) {
          const allWns = roster
            ? roster.map((r) => r.writing_number?.trim()).filter(Boolean)
            : [];
          const matched = writingNumbers.some((wn) => allWns.includes(wn));
          if (!matched) continue;
        }

        const { isAtRisk, flagType } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        // At-risk filter
        if (atRiskOnly && !isAtRisk) continue;

        const draftCount = estimateDraftCount(
          appRecvdDate,
          paidToDate,
          row.billing_mode as number | null
        );

        const clientName = [row.first_name as string, row.last_name as string]
          .filter(Boolean)
          .map((s) => s.trim())
          .join(" ") || null;

        const policyNumber = (row.policy_nbr as string) || "";

        // Search filter
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchesPolicyNum = policyNumber.toLowerCase().includes(q);
          const matchesName = clientName?.toLowerCase().includes(q) || false;
          if (!matchesPolicyNum && !matchesName) continue;
        }

        allPolicies.push({
          policy_number: policyNumber,
          product_type: productType,
          status,
          plan_premium: monthlyPremium,
          annual_premium: annualPremium,
          paid_to_date: paidToDate,
          policy_effective_date: appRecvdDate,
          term_date: termDate,
          draft_count: draftCount,
          is_at_risk: isAtRisk,
          flag_type: flagType,
          agency_id: agencyWn || "unknown",
          agent_writing_number: agentWn,
          client_name: clientName,
          billing_mode: row.billing_mode as number | null,
          writing_number: agentWn,
        });
      }

      if (rows.length < FETCH_SIZE) break;
      offset += FETCH_SIZE;
    }

    // Sort
    const dir = sortOrder === "asc" ? 1 : -1;
    allPolicies.sort((a, b) => {
      switch (sortField) {
        case "premium":
          return dir * (a.plan_premium - b.plan_premium);
        case "annual_premium":
          return dir * (a.annual_premium - b.annual_premium);
        case "submit_date":
          return dir * ((a.policy_effective_date || "").localeCompare(b.policy_effective_date || ""));
        case "paid_to_date":
          return dir * ((a.paid_to_date || "").localeCompare(b.paid_to_date || ""));
        case "policy_nbr":
          return dir * a.policy_number.localeCompare(b.policy_number);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "draft_count":
          return dir * (a.draft_count - b.draft_count);
        default:
          return dir * (a.plan_premium - b.plan_premium);
      }
    });

    // Paginate
    const totalCount = allPolicies.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const pageData = allPolicies.slice(page * pageSize, (page + 1) * pageSize);

    // Summary stats
    const activePolicies = allPolicies.filter((p) => p.status === "active");
    const atRiskPolicies = allPolicies.filter((p) => p.is_at_risk);
    const summary = {
      total_policies: totalCount,
      active_policies: activePolicies.length,
      at_risk_policies: atRiskPolicies.length,
      active_monthly_premium: Math.round(
        activePolicies.reduce((s, p) => s + p.plan_premium, 0) * 100
      ) / 100,
      active_annual_premium: Math.round(
        activePolicies.reduce((s, p) => s + p.annual_premium, 0) * 100
      ) / 100,
      at_risk_annual_premium: Math.round(
        atRiskPolicies.reduce((s, p) => s + p.annual_premium, 0) * 100
      ) / 100,
      status_breakdown: allPolicies.reduce(
        (acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse({
      data: pageData,
      summary,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: totalPages,
      },
      _source: "prod_direct",
      _elapsed_ms: elapsedMs,
    });
  } catch (err) {
    console.error("book-of-business error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
