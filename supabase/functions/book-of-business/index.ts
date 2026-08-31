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
 * SECURITY: All user-supplied values are parameterized via postgres.js tagged
 * templates or validated against allowlists. No string interpolation in SQL.
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

// ── Input validation ──────────────────────────────────────────────────
const WN_RE = /^[A-Za-z0-9]{1,20}$/;
const VALID_STATUSES = new Set(["active", "terminated", "pending", "suspended", "all"]);
const VALID_PRODUCTS = new Set(["HI", "HHC", "all"]);
const VALID_SORT_FIELDS = new Set(["premium", "annual_premium", "submit_date", "paid_to_date", "policy_nbr", "status", "draft_count"]);
const VALID_ORDERS = new Set(["asc", "desc"]);

// Status code map — only valid codes, used to build safe SQL fragments
const STATUS_CODE_MAP: Record<string, string> = {
  active: "A",
  terminated: "T",
  pending: "P",
  suspended: "S",
};

function validateWn(v: string | null): string | null {
  if (!v) return null;
  return WN_RE.test(v) ? v : null;
}

function validateWritingNumbers(raw: string | null): string[] | null {
  if (!raw) return null;
  const wns = raw.split(",").map((w) => w.trim()).filter(Boolean);
  // Validate each one
  for (const wn of wns) {
    if (!WN_RE.test(wn)) return null;
  }
  return wns.length > 0 ? wns : null;
}

// Search term: strip anything that could be SQL metacharacters.
// Allow letters, numbers, spaces, hyphens, periods, apostrophes.
const SEARCH_RE = /^[A-Za-z0-9 \-.']{0,100}$/;

function validateSearch(v: string | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return SEARCH_RE.test(trimmed) ? trimmed : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  const started = performance.now();
  const url = new URL(req.url);

  // ── Parse + validate all inputs ─────────────────────────────────────
  const agencyFilter = validateWn(url.searchParams.get("agency_id"));
  const agentWnFilter = validateWn(url.searchParams.get("agent_wn"));
  const writingNumbers = validateWritingNumbers(url.searchParams.get("writing_numbers"));

  const statusFilter = url.searchParams.get("status") || "all";
  if (!VALID_STATUSES.has(statusFilter)) {
    return jsonResponse({ error: "Invalid status filter" }, 400, req);
  }

  const productFilter = url.searchParams.get("product_type") || "all";
  if (!VALID_PRODUCTS.has(productFilter)) {
    return jsonResponse({ error: "Invalid product_type filter" }, 400, req);
  }

  const atRiskOnly = url.searchParams.get("at_risk") === "true";

  const searchTerm = validateSearch(url.searchParams.get("search"));
  // Reject if caller supplied a search that failed validation
  if (url.searchParams.get("search")?.trim() && !searchTerm && url.searchParams.get("search")!.trim().length > 0) {
    return jsonResponse({ error: "Invalid search term (letters, numbers, spaces, hyphens, periods, apostrophes only, max 100 chars)" }, 400, req);
  }

  const sortField = url.searchParams.get("sort") || "premium";
  if (!VALID_SORT_FIELDS.has(sortField)) {
    return jsonResponse({ error: "Invalid sort field" }, 400, req);
  }

  const sortOrder = url.searchParams.get("order") || "desc";
  if (!VALID_ORDERS.has(sortOrder)) {
    return jsonResponse({ error: "Invalid sort order" }, 400, req);
  }

  const page = Math.max(0, Number(url.searchParams.get("page") || "0"));
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size") || "100")));

  // Reject invalid writing numbers if supplied
  if (url.searchParams.get("agency_id") && !agencyFilter) {
    return jsonResponse({ error: "Invalid agency_id format" }, 400, req);
  }
  if (url.searchParams.get("agent_wn") && !agentWnFilter) {
    return jsonResponse({ error: "Invalid agent_wn format" }, 400, req);
  }
  if (url.searchParams.get("writing_numbers") && !writingNumbers) {
    return jsonResponse({ error: "Invalid writing_numbers format (alphanumeric, comma-separated)" }, 400, req);
  }

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // Load roster-based agent→agency overrides from FYM App DB.
    const rosterMap = await loadRosterMap();

    // ── Build parameterized WHERE fragments ─────────────────────────
    // Product type filter
    const productWhere = productFilter === "HHC"
      ? sql`AND (UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%')`
      : productFilter === "HI"
        ? sql`AND (UPPER(TRIM(plan_code)) LIKE '%HI%' OR UPPER(TRIM(plan_code)) LIKE '%HIP%' OR UPPER(TRIM(plan_code)) LIKE '%UHL%')
              AND NOT (UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%')`
        : sql`AND (
            UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%'
            OR UPPER(TRIM(plan_code)) LIKE '%HI%' OR UPPER(TRIM(plan_code)) LIKE '%HIP%'
            OR UPPER(TRIM(plan_code)) LIKE '%UHL%'
          )`;

    // Status filter — use parameterized value
    const statusCode = STATUS_CODE_MAP[statusFilter] || null;
    const statusWhere = statusFilter !== "all" && statusCode
      ? sql`AND UPPER(TRIM(cntrct_code)) = ${statusCode}`
      : sql``;

    // Agency filter
    const agencyWhere = agencyFilter
      ? agencyFilter === FYM_MGA_WN
        ? sql`AND (TRIM(ga) = ${agencyFilter} OR ga IS NULL OR TRIM(ga) = '')`
        : sql`AND TRIM(ga) = ${agencyFilter}`
      : sql``;

    // Agent filter
    const agentWhere = agentWnFilter
      ? sql`AND TRIM(wa) = ${agentWnFilter}`
      : sql``;

    // Writing numbers filter — parameterized via ANY()
    const wnWhere = writingNumbers
      ? sql`AND TRIM(wa) = ANY(${writingNumbers})`
      : sql``;

    // At-risk filter
    const atRiskWhere = atRiskOnly
      ? sql`AND COALESCE(at_risk_policy, false) = true AND UPPER(TRIM(cntrct_code)) = 'A'`
      : sql``;

    // Search filter — parameterized ILIKE
    const searchLower = searchTerm ? searchTerm.toLowerCase() : null;
    const searchPattern = searchLower ? `%${searchLower}%` : null;
    const searchWhere = searchPattern
      ? sql`AND (
          LOWER(TRIM(policy_nbr)) LIKE ${searchPattern}
          OR LOWER(CONCAT_WS(' ', TRIM(first_name), TRIM(last_name))) LIKE ${searchPattern}
        )`
      : sql``;

    // ── Build ORDER BY (allowlisted field names — safe to interpolate) ──
    // These are static SQL column references, not user values.
    const dir = sortOrder === "asc" ? sql`ASC` : sql`DESC`;
    const orderByMap: Record<string, ReturnType<typeof sql>> = {
      premium: sql`COALESCE(annual_premium, 0) / 12 ${dir}`,
      annual_premium: sql`COALESCE(annual_premium, 0) ${dir}`,
      submit_date: sql`app_recvd_date ${dir} NULLS LAST`,
      paid_to_date: sql`paid_to_date ${dir} NULLS LAST`,
      policy_nbr: sql`policy_nbr ${dir}`,
      status: sql`cntrct_code ${dir}`,
      draft_count: sql`(EXTRACT(EPOCH FROM (paid_to_date::timestamp - app_recvd_date::timestamp))) ${dir} NULLS LAST`,
    };
    const orderBy = orderByMap[sortField] || orderByMap.premium;
    const offset = page * pageSize;

    // ── Step 1: Get total count + summary stats (one query) ─────────
    const [summaryRow] = await sql`
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
      WHERE 1=1 ${productWhere} ${statusWhere} ${agencyWhere} ${agentWhere} ${wnWhere} ${atRiskWhere} ${searchWhere}
    `;

    const totalCount = Number(summaryRow.total_policies) || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Status breakdown — separate lightweight query
    const breakdownRows = await sql`
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
      WHERE 1=1 ${productWhere} ${statusWhere} ${agencyWhere} ${agentWhere} ${wnWhere} ${atRiskWhere} ${searchWhere}
      GROUP BY CASE UPPER(TRIM(cntrct_code))
        WHEN 'A' THEN 'active'
        WHEN 'T' THEN 'terminated'
        WHEN 'P' THEN 'pending'
        WHEN 'S' THEN 'suspended'
        ELSE 'pending'
      END
    `;
    const statusBreakdown: Record<string, number> = {};
    for (const r of breakdownRows) {
      statusBreakdown[r.status as string] = Number(r.count) || 0;
    }

    // ── Step 2: Get just the page we need ───────────────────────────
    const pageRows = await sql`
      WITH base AS (
        SELECT *,
          COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_id
        FROM typed.unl_fym_policy_latest_load
        WHERE 1=1 ${productWhere} ${statusWhere} ${agencyWhere} ${agentWhere} ${wnWhere} ${atRiskWhere} ${searchWhere}
      )
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
        agency_id,
        TRIM(ga_name) AS agency_name,
        TRIM(wa) AS agent_writing_number,
        TRIM(wa_name) AS agent_name,
        TRIM(first_name) AS first_name,
        TRIM(last_name) AS last_name,
        billing_mode,
        roster_hierarchy_json
      FROM base
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${offset}
    `;

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
    return jsonResponse({ error: "Internal server error" }, 500, req);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
