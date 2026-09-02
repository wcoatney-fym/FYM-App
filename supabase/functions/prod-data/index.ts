/**
 * prod-data — Production metrics edge function
 *
 * Queries Max's production DB directly for:
 * - Org-wide and per-agency production KPIs (active policies, premium, at-risk)
 * - Per-agent production breakdowns
 * - Daily production for trend charts
 * - Monthly production aggregates
 * - Product mix breakdowns
 * - Monthly overlay (submitted vs issued)
 * - Recruiting ROI matching
 *
 * ALL aggregation is pushed to SQL GROUP BY to avoid OOM.
 * Only aggregate result rows are held in memory — never the full policy table.
 *
 * SECURITY: All user-supplied values are parameterized via postgres.js tagged
 * templates. No string interpolation in SQL. Inputs are validated before use.
 *
 * Query params:
 *   type:       "agency" | "agent" | "daily" | "monthly" | "monthly_overlay" | "product_mix" | "recruiting_roi"
 *   agency_id:  filter by agency (tracker_id / writing_number)
 *   agent_id:   filter by agent writing number
 *   start_date: YYYY-MM-DD
 *   end_date:   YYYY-MM-DD
 */

import {
  createProdConnection,
  FYM_MGA_WN,
  jsonResponse,
  corsResponse,
  verifyAuth,
} from "../_shared/prod-db.ts";

// ── Input validation ──────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WN_RE = /^[A-Za-z0-9]{1,20}$/;
const VALID_TYPES = new Set([
  "agency", "agent", "daily", "monthly", "monthly_overlay", "product_mix", "recruiting_roi",
]);

function validateDate(v: string | null): string | null {
  if (!v) return null;
  return DATE_RE.test(v) ? v : null;
}

function validateWn(v: string | null): string | null {
  if (!v) return null;
  return WN_RE.test(v) ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  // ── Auth gate ──────────────────────────────────────────────────────
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return jsonResponse(req, { error: authError || "Unauthorized" }, 401);
  }

  const started = performance.now();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "agency";

  if (!VALID_TYPES.has(type)) {
    return jsonResponse(req, { error: `Unknown type: ${type}` }, 400);
  }

  const agencyFilter = validateWn(url.searchParams.get("agency_id"));
  const agentFilter = validateWn(url.searchParams.get("agent_id"));
  const startDate = validateDate(url.searchParams.get("start_date"));
  const endDate = validateDate(url.searchParams.get("end_date"));

  // Reject if caller supplied values that failed validation
  if (url.searchParams.get("agency_id") && !agencyFilter) {
    return jsonResponse(req, { error: "Invalid agency_id format" }, 400);
  }
  if (url.searchParams.get("agent_id") && !agentFilter) {
    return jsonResponse(req, { error: "Invalid agent_id format" }, 400);
  }
  if (url.searchParams.get("start_date") && !startDate) {
    return jsonResponse(req, { error: "Invalid start_date format (expected YYYY-MM-DD)" }, 400);
  }
  if (url.searchParams.get("end_date") && !endDate) {
    return jsonResponse(req, { error: "Invalid end_date format (expected YYYY-MM-DD)" }, 400);
  }

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // ── Parameterized WHERE fragment helpers ───────────────────────────
    // postgres.js tagged templates auto-parameterize interpolated values.
    // Static SQL fragments use sql`` (empty interpolation = safe literal).
    const productFilter = sql`(
      UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%'
      OR UPPER(TRIM(plan_code)) LIKE '%HI%' OR UPPER(TRIM(plan_code)) LIKE '%HIP%'
      OR UPPER(TRIM(plan_code)) LIKE '%UHL%'
    )`;

    const dateFilter = startDate && endDate
      ? sql`AND app_recvd_date >= ${startDate}::date AND app_recvd_date < ${endDate}::date`
      : sql``;

    const agencyWhere = agencyFilter
      ? agencyFilter === FYM_MGA_WN
        ? sql`AND (TRIM(ga) = ${agencyFilter} OR ga IS NULL OR TRIM(ga) = '')`
        : sql`AND TRIM(ga) = ${agencyFilter}`
      : sql``;

    const agentWhere = agentFilter
      ? sql`AND TRIM(wa) = ${agentFilter}`
      : sql``;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    let result: unknown;

    switch (type) {
      // ── RECRUITING ROI ──────────────────────────────────────────────
      case "recruiting_roi": {
        let names: string[] = [];
        try {
          const body = await req.json();
          names = (body.names ?? [])
            .map((n: string) => (typeof n === "string" ? n.trim().toUpperCase() : ""))
            .filter(Boolean);
        } catch { /* query-param only is fine */ }

        // Use parameterized ANY($1) instead of IN(...) string interpolation
        const nameFilter = names.length > 0
          ? sql`AND UPPER(TRIM(wa_name)) = ANY(${names})`
          : sql``;

        const rows = await sql`
          WITH base AS (
            SELECT *,
              COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS resolved_agency_wn
            FROM typed.unl_fym_policy_latest_load
            WHERE TRIM(wa) IS NOT NULL AND TRIM(wa) != ''
              ${nameFilter}
          )
          SELECT
            TRIM(wa) AS writing_number,
            TRIM(wa_name) AS agent_name,
            resolved_agency_wn AS agency_wn,
            COALESCE(TRIM(ga_name), '') AS agency_name,
            COUNT(*) AS total_policies,
            COUNT(CASE WHEN UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL THEN 1 END) AS active_policies,
            ROUND(SUM(CASE WHEN term_date IS NULL THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS active_ap,
            ROUND(SUM(COALESCE(annual_premium, 0))::numeric, 2) AS total_ap,
            MIN(issue_date) AS first_issue_date,
            MAX(issue_date) AS last_issue_date
          FROM base
          GROUP BY TRIM(wa), TRIM(wa_name), resolved_agency_wn, COALESCE(TRIM(ga_name), '')
          ORDER BY active_ap DESC
        `;

        const elapsedMs = Math.round(performance.now() - started);
        return jsonResponse(req, { data: rows, _source: "prod_direct", _elapsed_ms: elapsedMs });
      }

      // ── AGENCY ──────────────────────────────────────────────────────
      case "agency": {
        const rows = await sql`
          WITH base AS (
            SELECT *,
              COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_id
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
          )
          SELECT
            agency_id,
            MIN(CASE WHEN agency_id = ${FYM_MGA_WN} THEN 'FYM' ELSE TRIM(ga_name) END) AS agency_name,
            COUNT(*) AS total_policies,
            ROUND(SUM(COALESCE(annual_premium, 0))::numeric, 2) AS total_annual_premium,
            COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL) AS active_policies,
            COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) = 'T') AS terminated_policies,
            COUNT(*) FILTER (WHERE UPPER(TRIM(cntrct_code)) NOT IN ('A', 'T', 'S')) AS pending_policies,
            COUNT(*) FILTER (WHERE COALESCE(at_risk_policy, false) = true AND UPPER(TRIM(cntrct_code)) = 'A') AS at_risk_policies,
            ROUND(SUM(CASE WHEN UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL THEN COALESCE(annual_premium, 0) / 12 ELSE 0 END)::numeric, 2) AS active_monthly_premium,
            ROUND(SUM(CASE WHEN UPPER(TRIM(cntrct_code)) = 'A' AND term_date IS NULL THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS active_annual_premium,
            ROUND(SUM(CASE WHEN UPPER(TRIM(cntrct_code)) = 'T' THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS terminated_annual_premium,
            ROUND(SUM(CASE WHEN UPPER(TRIM(cntrct_code)) NOT IN ('A', 'T', 'S') THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS pending_annual_premium,
            ROUND(SUM(CASE WHEN COALESCE(at_risk_policy, false) = true AND UPPER(TRIM(cntrct_code)) = 'A' THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS at_risk_annual_premium,
            COUNT(*) FILTER (WHERE TO_CHAR(app_recvd_date, 'YYYY-MM') = ${thisMonth}) AS policies_this_month,
            ROUND(SUM(CASE WHEN TO_CHAR(app_recvd_date, 'YYYY-MM') = ${thisMonth} THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS ap_this_month,
            COUNT(*) FILTER (WHERE TO_CHAR(app_recvd_date, 'YYYY-MM') = ${lastMonthKey}) AS policies_last_month,
            ROUND(SUM(CASE WHEN TO_CHAR(app_recvd_date, 'YYYY-MM') = ${lastMonthKey} THEN COALESCE(annual_premium, 0) ELSE 0 END)::numeric, 2) AS ap_last_month
          FROM base
          GROUP BY agency_id
          ORDER BY active_annual_premium DESC
        `;

        const agencies = rows.map((r: Record<string, unknown>) => ({
          agency_id: r.agency_id as string,
          agency_name: r.agency_name as string | null,
          total_policies: Number(r.total_policies) || 0,
          total_annual_premium: Number(r.total_annual_premium) || 0,
          active_policies: Number(r.active_policies) || 0,
          terminated_policies: Number(r.terminated_policies) || 0,
          pending_policies: Number(r.pending_policies) || 0,
          at_risk_policies: Number(r.at_risk_policies) || 0,
          active_monthly_premium: Number(r.active_monthly_premium) || 0,
          active_annual_premium: Number(r.active_annual_premium) || 0,
          terminated_annual_premium: Number(r.terminated_annual_premium) || 0,
          pending_annual_premium: Number(r.pending_annual_premium) || 0,
          at_risk_annual_premium: Number(r.at_risk_annual_premium) || 0,
          policies_this_month: Number(r.policies_this_month) || 0,
          ap_this_month: Number(r.ap_this_month) || 0,
          policies_last_month: Number(r.policies_last_month) || 0,
          ap_last_month: Number(r.ap_last_month) || 0,
          avg_annual_premium: Number(r.active_policies) > 0
            ? Math.round((Number(r.active_annual_premium) / Number(r.active_policies)) * 100) / 100
            : 0,
        }));
        result = agencies;
        break;
      }

      // ── AGENT ───────────────────────────────────────────────────────
      case "agent": {
        const rows = await sql`
          WITH policy_data AS (
            SELECT
              TRIM(wa) AS agent_wn,
              TRIM(wa_name) AS wa_name,
              COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_wn,
              UPPER(TRIM(cntrct_code)) AS status_code,
              COALESCE(annual_premium, 0) AS annual_premium,
              COALESCE(at_risk_policy, false) AS at_risk_policy,
              app_recvd_date,
              paid_to_date,
              COALESCE(billing_mode, 1) AS billing_mode,
              term_date
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
              AND TRIM(wa) IS NOT NULL AND TRIM(wa) != ''
          ),
          with_draft AS (
            SELECT *,
              CASE status_code
                WHEN 'A' THEN 'active'
                WHEN 'T' THEN 'terminated'
                WHEN 'P' THEN 'pending'
                WHEN 'S' THEN 'suspended'
                ELSE 'pending'
              END AS status,
              CASE
                WHEN paid_to_date IS NOT NULL AND app_recvd_date IS NOT NULL
                  AND paid_to_date >= app_recvd_date
                THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (paid_to_date::timestamp - app_recvd_date::timestamp)) / 86400 /
                  CASE WHEN billing_mode = 12 THEN 365
                       WHEN billing_mode = 6 THEN 182
                       WHEN billing_mode = 3 THEN 91
                       ELSE 30 END))
                ELSE 0
              END AS draft_count
            FROM policy_data
          )
          SELECT
            agent_wn AS agent_id,
            MIN(wa_name) AS wa_name,
            MIN(agency_wn) AS agency_id,
            COUNT(*) AS total_policies,
            COUNT(*) FILTER (WHERE status = 'active') AS active_policies,
            COUNT(*) FILTER (WHERE status = 'terminated') AS terminated_policies,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending_policies,
            COUNT(*) FILTER (WHERE at_risk_policy = true AND status = 'active') AS at_risk_policies,
            COALESCE(SUM(annual_premium / 12) FILTER (WHERE status = 'active'), 0) AS active_monthly_premium,
            COALESCE(SUM(annual_premium) FILTER (WHERE status = 'active'), 0) AS active_annual_premium,
            COUNT(*) FILTER (WHERE TO_CHAR(app_recvd_date, 'YYYY-MM') = ${thisMonth}) AS policies_this_month,
            COALESCE(SUM(annual_premium) FILTER (WHERE TO_CHAR(app_recvd_date, 'YYYY-MM') = ${thisMonth}), 0) AS ap_this_month,
            COUNT(*) FILTER (WHERE draft_count >= 1) AS ever_drafted,
            COUNT(*) FILTER (WHERE draft_count >= 3) AS retained_policies,
            MIN(app_recvd_date) AS earliest_issue_date
          FROM with_draft
          GROUP BY agent_wn
          ORDER BY active_annual_premium DESC
        `;

        const agents = rows.map((r: Record<string, unknown>) => {
          const rawWaName = (r.wa_name as string | null)?.trim() || null;
          const agentName = rawWaName
            ? rawWaName.replace(/\b\w+/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            : null;
          const activePolicies = Number(r.active_policies) || 0;
          const activeAP = Number(r.active_annual_premium) || 0;
          const everDrafted = Number(r.ever_drafted) || 0;
          const retained = Number(r.retained_policies) || 0;
          return {
            agent_id: r.agent_id as string,
            agent_name: agentName,
            writing_number: r.agent_id as string,
            agency_id: r.agency_id as string,
            total_policies: Number(r.total_policies) || 0,
            active_policies: activePolicies,
            terminated_policies: Number(r.terminated_policies) || 0,
            pending_policies: Number(r.pending_policies) || 0,
            at_risk_policies: Number(r.at_risk_policies) || 0,
            active_monthly_premium: Math.round((Number(r.active_monthly_premium) || 0) * 100) / 100,
            active_annual_premium: activeAP,
            policies_this_month: Number(r.policies_this_month) || 0,
            ap_this_month: Number(r.ap_this_month) || 0,
            retained_policies: retained,
            ever_drafted: everDrafted,
            avg_annual_premium: activePolicies > 0 ? Math.round((activeAP / activePolicies) * 100) / 100 : 0,
            retention_pct: everDrafted > 0 ? Math.round((retained / everDrafted) * 1000) / 10 : null,
            earliest_issue_date: r.earliest_issue_date
              ? new Date(r.earliest_issue_date as string).toISOString().split("T")[0]
              : null,
          };
        });
        result = agents;
        break;
      }

      // ── DAILY ───────────────────────────────────────────────────────
      case "daily": {
        // Submitted (by app_recvd_date)
        const submittedRows = await sql`
          WITH base AS (
            SELECT *,
              COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_id
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
              AND app_recvd_date IS NOT NULL
          )
          SELECT
            agency_id,
            TO_CHAR(app_recvd_date, 'YYYY-MM-DD') AS day,
            COUNT(*) AS policies,
            ROUND(SUM(COALESCE(annual_premium, 0))::numeric, 2) AS annual_premium
          FROM base
          GROUP BY agency_id, TO_CHAR(app_recvd_date, 'YYYY-MM-DD')
          ORDER BY day
        `;

        // Effectuated (by issue_date) — separate query for policies that became
        // active within the window, regardless of when submitted
        let effectuatedMap: Record<string, Record<string, number>> = {};
        if (startDate && endDate) {
          const effRows = await sql`
            WITH base AS (
              SELECT *,
                COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_id
              FROM typed.unl_fym_policy_latest_load
              WHERE issue_date >= ${startDate}::date
                AND issue_date < ${endDate}::date
                AND UPPER(TRIM(cntrct_code)) = 'A'
                AND term_date IS NULL
                ${agencyWhere} ${agentWhere}
                AND ${productFilter}
            )
            SELECT
              agency_id,
              TO_CHAR(issue_date, 'YYYY-MM-DD') AS day,
              COUNT(*) AS issued
            FROM base
            GROUP BY agency_id, TO_CHAR(issue_date, 'YYYY-MM-DD')
          `;
          for (const r of effRows) {
            const aid = r.agency_id as string;
            const day = r.day as string;
            if (!effectuatedMap[aid]) effectuatedMap[aid] = {};
            effectuatedMap[aid][day] = Number(r.issued) || 0;
          }
        }

        // Merge submitted + effectuated
        const dailyRows = submittedRows.map((r: Record<string, unknown>) => ({
          agency_id: r.agency_id as string,
          day: r.day as string,
          policies: Number(r.policies) || 0,
          annual_premium: Number(r.annual_premium) || 0,
          issued: effectuatedMap[r.agency_id as string]?.[r.day as string] || 0,
        }));

        // Add effectuated-only days (issued but not submitted in same window)
        for (const [agencyId, days] of Object.entries(effectuatedMap)) {
          for (const [day, issued] of Object.entries(days)) {
            const exists = dailyRows.some(
              (r: { agency_id: string; day: string }) => r.agency_id === agencyId && r.day === day
            );
            if (!exists) {
              dailyRows.push({ agency_id: agencyId, day, policies: 0, annual_premium: 0, issued });
            }
          }
        }

        result = dailyRows;
        break;
      }

      // ── MONTHLY ─────────────────────────────────────────────────────
      case "monthly": {
        const rows = await sql`
          WITH base AS (
            SELECT *,
              COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_id
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
              AND app_recvd_date IS NOT NULL
          )
          SELECT
            agency_id,
            TO_CHAR(app_recvd_date, 'YYYY-MM') AS month,
            COUNT(*) AS policies,
            ROUND(SUM(COALESCE(annual_premium, 0))::numeric, 2) AS annual_premium
          FROM base
          GROUP BY agency_id, TO_CHAR(app_recvd_date, 'YYYY-MM')
          ORDER BY month
        `;

        result = rows.map((r: Record<string, unknown>) => ({
          agency_id: r.agency_id as string,
          month: r.month as string,
          policies: Number(r.policies) || 0,
          annual_premium: Number(r.annual_premium) || 0,
        }));
        break;
      }

      // ── MONTHLY OVERLAY (submitted vs issued) ───────────────────────
      case "monthly_overlay": {
        const rows = await sql`
          WITH submitted AS (
            SELECT
              TO_CHAR(app_recvd_date, 'YYYY-MM') AS month,
              COUNT(*) AS policies,
              ROUND(SUM(COALESCE(annual_premium, 0))::numeric, 2) AS annual_premium
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
              AND app_recvd_date IS NOT NULL
            GROUP BY TO_CHAR(app_recvd_date, 'YYYY-MM')
          ),
          issued AS (
            SELECT
              TO_CHAR(issue_date, 'YYYY-MM') AS month,
              COUNT(*) AS policies,
              ROUND(SUM(COALESCE(annual_premium, 0))::numeric, 2) AS annual_premium
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
              AND issue_date IS NOT NULL
            GROUP BY TO_CHAR(issue_date, 'YYYY-MM')
          )
          SELECT
            COALESCE(s.month, i.month) AS month,
            COALESCE(s.policies, 0) AS submitted_policies,
            COALESCE(s.annual_premium, 0) AS submitted_ap,
            COALESCE(i.policies, 0) AS issued_policies,
            COALESCE(i.annual_premium, 0) AS issued_ap
          FROM submitted s
          FULL OUTER JOIN issued i ON s.month = i.month
          ORDER BY COALESCE(s.month, i.month)
        `;

        result = rows.map((r: Record<string, unknown>) => ({
          month: r.month as string,
          submitted_policies: Number(r.submitted_policies) || 0,
          submitted_ap: Number(r.submitted_ap) || 0,
          issued_policies: Number(r.issued_policies) || 0,
          issued_ap: Number(r.issued_ap) || 0,
        }));
        break;
      }

      // ── PRODUCT MIX ─────────────────────────────────────────────────
      case "product_mix": {
        const rows = await sql`
          WITH base AS (
            SELECT *,
              COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_id
            FROM typed.unl_fym_policy_latest_load
            WHERE ${productFilter} ${dateFilter} ${agencyWhere} ${agentWhere}
              AND UPPER(TRIM(cntrct_code)) = 'A'
              AND term_date IS NULL
          )
          SELECT
            agency_id,
            CASE
              WHEN UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%' THEN 'HHC'
              ELSE 'HI'
            END AS product_type,
            COUNT(*) AS count
          FROM base
          GROUP BY agency_id,
            CASE WHEN UPPER(TRIM(plan_code)) LIKE '%HHC%' OR UPPER(TRIM(plan_code)) LIKE '%AHH%' THEN 'HHC' ELSE 'HI' END
        `;

        result = rows.map((r: Record<string, unknown>) => ({
          agency_id: r.agency_id as string,
          product_type: r.product_type as string,
          count: Number(r.count) || 0,
        }));
        break;
      }

      default:
        return jsonResponse(req, { error: `Unknown type: ${type}` }, 400);
    }

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse(req, { data: result, _source: "prod_direct_sql", _elapsed_ms: elapsedMs });
  } catch (err) {
    console.error("prod-data error:", err);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
