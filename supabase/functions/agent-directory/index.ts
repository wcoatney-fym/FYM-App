/**
 * agent-directory — Distinct agent directory from production DB
 *
 * Returns unique agents from Max's DB using the `wa` (writing agent
 * writing number) and `wa_name` columns — the individual agent level.
 * Aggregates policy metrics per agent. No roster_hierarchy_json parsing.
 *
 * Agency comes from `ga` / `ga_name` columns (the GA-level parent).
 *
 * Query params:
 *   agency_id:  filter by agency writing number / ga column (optional)
 *   page:       1-based page number (default 1)
 *   page_size:  results per page (default 100, max 500)
 *   search:     name/WN search filter (optional)
 */

import {
  createProdConnection,
  CONTRACT_STATUS,
  planToProductType,
  resolveRiskFlag,
  jsonResponse,
  corsResponse,
} from "../_shared/prod-db.ts";

/** Title-case an ALLCAPS name: "JOHN SMITH" → "John Smith" */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  const started = performance.now();
  const url = new URL(req.url);
  const agencyFilter = (url.searchParams.get("agency_id") || "").trim() || null;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size")) || 100));
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // ── Single aggregation query — group by wa (agent WN) ──────────
    // This pushes all the heavy lifting to Postgres instead of
    // streaming 40K+ rows and aggregating in JS.
    const rows = await sql`
      SELECT
        TRIM(wa) AS wa,
        TRIM(wa_name) AS wa_name,
        TRIM(ga) AS ga,
        TRIM(ga_name) AS ga_name,
        COUNT(*) AS total_policies,
        COUNT(*) FILTER (WHERE TRIM(cntrct_code) = 'A') AS active_policies,
        COUNT(*) FILTER (WHERE TRIM(cntrct_code) = 'T') AS terminated_policies,
        COUNT(*) FILTER (WHERE TRIM(cntrct_code) NOT IN ('A', 'T')) AS pending_policies,
        COUNT(*) FILTER (WHERE at_risk_policy = true AND TRIM(cntrct_code) = 'A') AS at_risk_policies,
        COALESCE(SUM(annual_premium), 0) AS total_annual_premium,
        COALESCE(SUM(annual_premium) FILTER (WHERE TRIM(cntrct_code) = 'A'), 0) AS active_annual_premium
      FROM typed.unl_fym_policy_latest_load
      WHERE TRIM(wa) IS NOT NULL
        AND TRIM(wa) != ''
        AND (TRIM(plan_code) ILIKE '%HI%' OR TRIM(plan_code) ILIKE '%HHC%' OR TRIM(plan_code) ILIKE '%AHH%')
      GROUP BY TRIM(wa), TRIM(wa_name), TRIM(ga), TRIM(ga_name)
      ORDER BY COALESCE(SUM(annual_premium) FILTER (WHERE TRIM(cntrct_code) = 'A'), 0) DESC
    `;

    // ── Post-process: filter, search, deduplicate ──────────────────
    interface AgentEntry {
      writing_number: string;
      agent_name: string;
      agency_wn: string | null;
      agency_name: string | null;
      total_policies: number;
      active_policies: number;
      terminated_policies: number;
      pending_policies: number;
      at_risk_policies: number;
      total_annual_premium: number;
      active_annual_premium: number;
    }

    // Deduplicate by wa — an agent can appear under multiple ga rows
    // if they moved agencies. Keep the one with most active policies.
    const agentMap = new Map<string, AgentEntry>();

    for (const row of rows) {
      const wa = (row.wa as string) || "";
      const waName = (row.wa_name as string) || "";
      const ga = (row.ga as string) || "";
      const gaName = (row.ga_name as string) || "";

      if (!wa) continue;

      // Agency filter
      if (agencyFilter && ga !== agencyFilter) continue;

      const entry: AgentEntry = {
        writing_number: wa,
        agent_name: waName ? titleCase(waName) : "",
        agency_wn: ga || null,
        agency_name: gaName ? titleCase(gaName) : null,
        total_policies: Number(row.total_policies) || 0,
        active_policies: Number(row.active_policies) || 0,
        terminated_policies: Number(row.terminated_policies) || 0,
        pending_policies: Number(row.pending_policies) || 0,
        at_risk_policies: Number(row.at_risk_policies) || 0,
        total_annual_premium: Math.round((Number(row.total_annual_premium) || 0) * 100) / 100,
        active_annual_premium: Math.round((Number(row.active_annual_premium) || 0) * 100) / 100,
      };

      const existing = agentMap.get(wa);
      if (!existing || entry.active_policies > existing.active_policies) {
        agentMap.set(wa, entry);
      }
    }

    let results = Array.from(agentMap.values());

    // Search filter
    if (search) {
      results = results.filter(
        (a) =>
          a.agent_name.toLowerCase().includes(search) ||
          a.writing_number.toLowerCase().includes(search) ||
          (a.agency_name || "").toLowerCase().includes(search)
      );
    }

    // Sort by active AP descending (already sorted by query, but
    // dedup + filter can reorder)
    results.sort((a, b) => b.active_annual_premium - a.active_annual_premium);

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
    return jsonResponse({ error: "Internal server error" }, 500, req);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
