/**
 * book-of-business — Paginated policy list edge function
 *
 * Queries Max's production DB directly for individual policy rows.
 * Supports filtering, search, sorting, and pagination.
 *
 * ALL filtering, sorting, and pagination is pushed to SQL to avoid OOM.
 * Only the requested page (max 500 rows) is ever held in memory.
 *
 * Roster-map overrides are applied as a lightweight post-query pass
 * on the returned page rows only (not the full dataset).
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
 *   sort:           "premium" | "annual_premium" | "submit_date" | "paid_to_date" | "policy_nbr" | "status" | "draft_count" (default: "premium")
 *   order:          "asc" | "desc" (default: "desc")
 *   page:           0-based page number (default: 0)
 *   page_size:      rows per page, max 500 (default: 100)
 */

import {
  createProdConnection,
  FYM_MGA_WN,
  toTitleCase,
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

    // ── Build WHERE conditions ──────────────────────────────────────
    const conditions: string[] = [];

    // Product type filter — always applied (HI/HHC only)
    if (productFilter === "HHC") {
      conditions.push(`(UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%')`);
    } else if (productFilter === "HI") {
      conditions.push(`(UPPER(TRIM(plan_code)) LIKE '%HI%' OR UPPER(TRIM(plan_code)) LIKE '%HIP%' OR UPPER(TRIM(plan_code)) LIKE '%UHL%')`);
      // Exclude HHC plans that also match %HI% (HHC contains HI substring)
      conditions.push(`NOT (UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%')`);
    } else {
      // "all" — include both HI and HHC
      conditions.push(`(
        UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%'
        OR UPPER(TRIM(plan_code)) LIKE '%HI%' OR UPPER(TRIM(plan_code)) LIKE '%HIP%'
        OR UPPER(TRIM(plan_code)) LIKE '%UHL%'
      )`);
    }

    // Status filter
    if (statusFilter !== "all") {
      const statusCodeMap: Record<string, string> = {
        active: "A",
        terminated: "T",
        pending: "P",
        suspended: "S",
      };
      const code = statusCodeMap[statusFilter];
      if (code) {
        conditions.push(`UPPER(TRIM(cntrct_code)) = '${code}'`);
      }
    }

    // Agency filter — push to SQL
    if (agencyFilter) {
      if (agencyFilter === FYM_MGA_WN) {
        conditions.push(`(TRIM(ga) = '${agencyFilter}' OR ga IS NULL OR TRIM(ga) = '')`);
      } else {
        conditions.push(`TRIM(ga) = '${agencyFilter}'`);
      }
    }

    // Agent filter
    if (agentWnFilter) {
      conditions.push(`TRIM(wa) = '${agentWnFilter}'`);
    }

    // Writing numbers filter (roster agent lookup)
    if (writingNumbers.length > 0) {
      const escaped = writingNumbers.map((wn) => `'${wn.replace(/'/g, "''")}'`).join(",");
      conditions.push(`TRIM(wa) IN (${escaped})`);
    }

    // At-risk filter
    if (atRiskOnly) {
      conditions.push(`COALESCE(at_risk_policy, false) = true`);
      conditions.push(`UPPER(TRIM(cntrct_code)) = 'A'`);
    }

    // Search filter — search policy_nbr or client name
    if (searchTerm) {
      const escaped = searchTerm.replace(/'/g, "''");
      conditions.push(`(
        LOWER(TRIM(policy_nbr)) LIKE '%${escaped.toLowerCase()}%'
        OR LOWER(CONCAT_WS(' ', TRIM(first_name), TRIM(last_name))) LIKE '%${escaped.toLowerCase()}%'
      )`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // ── Build ORDER BY ──────────────────────────────────────────────
    const dir = sortOrder === "asc" ? "ASC" : "DESC";
    let orderBy: string;
    switch (sortField) {
      case "premium":
        orderBy = `COALESCE(annual_premium, 0) / 12 ${dir}`;
        break;
      case "annual_premium":
        orderBy = `COALESCE(annual_premium, 0) ${dir}`;
        break;
      case "submit_date":
        orderBy = `app_recvd_date ${dir} NULLS LAST`;
        break;
      case "paid_to_date":
        orderBy = `paid_to_date ${dir} NULLS LAST`;
        break;
      case "policy_nbr":
        orderBy = `policy_nbr ${dir}`;
        break;
      case "status":
        orderBy = `cntrct_code ${dir}`;
        break;
      case "draft_count":
        // Draft count is computed — sort by paid_to_date - app_recvd_date as proxy
        orderBy = `(EXTRACT(EPOCH FROM (paid_to_date::timestamp - app_recvd_date::timestamp))) ${dir} NULLS LAST`;
        break;
      default:
        orderBy = `COALESCE(annual_premium, 0) / 12 ${dir}`;
    }

    // ── Step 1: Get total count + summary stats (one query) ─────────
    const summaryQuery = `
      SELECT
        COUNT(*) AS total_policies,
        COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL) AS active_policies,
        COUNT(*) FILTER (WHERE COALESCE(at_risk_policy, false) = true AND UPPER(TRIM(cntrct_code)) = 'A') AS at_risk_policies,
        ROUND(SUM(CASE WHEN UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL
          THEN COALESCE(annual_premium, 0) / 12 ELSE 0 END)::numeric, 2) AS active_monthly_premium,
        ROUND(SUM(CASE WHEN UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL
          THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS active_annual_premium,
        ROUND(SUM(CASE WHEN COALESCE(at_risk_policy, false) = true AND UPPER(TRIM(cntrct_code)) = 'A'
          THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS at_risk_annual_premium
      FROM typed.unl_fym_policy_latest_load
      ${whereClause}
    `;
    const [summaryRow] = await sql.unsafe(summaryQuery);

    const totalCount = Number(summaryRow.total_policies) || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Status breakdown — separate lightweight query
    const breakdownQuery = `
      SELECT
        CASE UPPER(TRIM(cntrct_code))
          WHEN 'A' THEN 'active'
          WHEN 'T' THEN 'terminated'
          WHEN 'P' THEN 'pending'
          WHEN 'S' THEN 'suspended'
          ELSE 'pending'
        END AS status,
        COUNT(*) AS count
      FROM typed.unl_fym_policy_latest_load
      ${whereClause}
      GROUP BY CASE UPPER(TRIM(cntrct_code))
        WHEN 'A' THEN 'active'
        WHEN 'T' THEN 'terminated'
        WHEN 'P' THEN 'pending'
        WHEN 'S' THEN 'suspended'
        ELSE 'pending'
      END
    `;
    const breakdownRows = await sql.unsafe(breakdownQuery);
    const statusBreakdown: Record<string, number> = {};
    for (const r of breakdownRows) {
      statusBreakdown[r.status as string] = Number(r.count) || 0;
    }

    // ── Step 2: Get just the page we need ───────────────────────────
    const pageQuery = `
      SELECT
        TRIM(policy_nbr) AS policy_number,
        CASE
          WHEN UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%' THEN 'HHC'
          ELSE 'HI'
        END AS product_type,
        CASE UPPER(TRIM(cntrct_code))
          WHEN 'A' THEN 'active'
          WHEN 'T' THEN 'terminated'
          WHEN 'P' THEN 'pending'
          WHEN 'S' THEN 'suspended'
          ELSE 'pending'
        END AS status,
        ROUND(COALESCE(annual_premium, 0)::numeric / 12, 2) AS plan_premium,
        COALESCE(annual_premium, 0) AS annual_premium,
        paid_to_date,
        app_recvd_date AS policy_effective_date,
        term_date,
        COALESCE(at_risk_policy, false) AS is_at_risk,
        CASE
          WHEN COALESCE(at_risk_policy, false) = true AND UPPER(TRIM(cntrct_code)) = 'A' THEN 'at_risk'
          ELSE NULL
        END AS flag_type,
        COALESCE(NULLIF(TRIM(ga), ''), '${FYM_MGA_WN}') AS agency_id,
        TRIM(ga_name) AS agency_name,
        TRIM(wa) AS agent_writing_number,
        TRIM(wa_name) AS agent_name,
        TRIM(first_name) AS first_name,
        TRIM(last_name) AS last_name,
        billing_mode,
        roster_hierarchy_json
      FROM typed.unl_fym_policy_latest_load
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${page * pageSize}
    `;
    const pageRows = await sql.unsafe(pageQuery);

    // ── Step 3: Post-process — roster overrides + formatting ────────
    // Only processes the page rows (max 500), not 50K+
    const pageData = pageRows.map((row: Record<string, unknown>) => {
      const paidToDate = row.paid_to_date
        ? new Date(row.paid_to_date as string).toISOString().split("T")[0]
        : null;
      const policyEffDate = row.policy_effective_date
        ? new Date(row.policy_effective_date as string).toISOString().split("T")[0]
        : null;
      const termDate = row.term_date
        ? new Date(row.term_date as string).toISOString().split("T")[0]
        : null;

      // Roster override — check if this policy's agent should be remapped
      const roster = row.roster_hierarchy_json as Array<{
        writing_number: string;
        depth: string;
        is_person: boolean;
        name: string;
      }> | null;
      const sqlAgencyId = row.agency_id as string;
      const agencyId = rosterMap.resolveAgencyFromHierarchy(roster, sqlAgencyId);

      // Draft count estimation
      const billingMode = row.billing_mode as number | null;
      let draftCount = 0;
      if (policyEffDate && paidToDate) {
        const eff = new Date(policyEffDate);
        const paid = new Date(paidToDate);
        const diffMs = paid.getTime() - eff.getTime();
        if (diffMs >= 0) {
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          const mode = billingMode ?? 1;
          if (mode === 12) draftCount = diffDays >= 30 ? 1 : 0;
          else if (mode === 6) draftCount = Math.floor(diffDays / 182) + (diffDays >= 30 ? 1 : 0);
          else if (mode === 3) draftCount = Math.floor(diffDays / 91) + (diffDays >= 30 ? 1 : 0);
          else draftCount = Math.max(0, Math.floor(diffDays / 30));
        }
      }

      // Names — proper Title Case
      const rawClientName = [row.first_name as string, row.last_name as string]
        .filter(Boolean)
        .map((s: string) => s.trim())
        .join(" ") || null;
      const clientName = rawClientName ? toTitleCase(rawClientName) : null;

      const rawAgencyName = ((row.agency_name as string) || "").trim() ||
        (agencyId === FYM_MGA_WN ? "FYM" : null);
      const agencyName = rawAgencyName ? toTitleCase(rawAgencyName) : null;

      const rawAgentName = ((row.agent_name as string) || "").trim() || null;
      const agentName = rawAgentName ? toTitleCase(rawAgentName) : null;

      const agentWn = ((row.agent_writing_number as string) || "").trim() || null;

      return {
        policy_number: row.policy_number as string,
        product_type: row.product_type as string,
        status: row.status as string,
        plan_premium: Number(row.plan_premium) || 0,
        annual_premium: Number(row.annual_premium) || 0,
        paid_to_date: paidToDate,
        policy_effective_date: policyEffDate,
        term_date: termDate,
        draft_count: draftCount,
        is_at_risk: row.is_at_risk as boolean,
        flag_type: row.flag_type as string | null,
        agency_id: agencyId || "unknown",
        agency_name: agencyName,
        agent_writing_number: agentWn,
        agent_name: agentName,
        client_name: clientName,
        billing_mode: billingMode,
        writing_number: agentWn,
      };
    });

    const summary = {
      total_policies: totalCount,
      active_policies: Number(summaryRow.active_policies) || 0,
      at_risk_policies: Number(summaryRow.at_risk_policies) || 0,
      active_monthly_premium: Number(summaryRow.active_monthly_premium) || 0,
      active_annual_premium: Number(summaryRow.active_annual_premium) || 0,
      at_risk_annual_premium: Number(summaryRow.at_risk_annual_premium) || 0,
      status_breakdown: statusBreakdown,
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
      _source: "prod_direct_sql",
      _elapsed_ms: elapsedMs,
    });
  } catch (err) {
    console.error("book-of-business error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
