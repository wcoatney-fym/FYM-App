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
 *   agent_id:   filter by agent writing number (narrows to a single agent)
 *   days:       retention window in days (default: 90)
 */

import {
  createProdConnection,
  CONTRACT_STATUS,
  FYM_MGA_WN,
  planToProductType,
  extractAgencyWritingNumber,
  extractAgentWritingNumber,
  resolveAgencyWn,
  resolveAgentWn,
  resolveRiskFlag,
  estimateDraftCount,
  jsonResponse,
  corsResponse,
  verifyAuth,
} from "../_shared/prod-db.ts";
import { loadRosterMap } from "../_shared/roster-map.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  // ── Auth gate ──────────────────────────────────────────────────────
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return jsonResponse({ error: authError || "Unauthorized" }, 401, req);
  }

  const started = performance.now();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "summary";
  const agencyFilter = url.searchParams.get("agency_id");
  const agentFilter = url.searchParams.get("agent_id");
  const retentionDays = Number(url.searchParams.get("days") || "90");

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();

    // ── FAST PATH: SQL-level aggregation for single-agency summary ─────
    // When filtering to a specific agency with type=summary, push ALL
    // aggregation to Postgres in one query. Skips roster map + pagination.
    if (type === "summary" && agencyFilter) {
      const retCutoff = new Date(Date.now() - retentionDays * 86400000)
        .toISOString().split("T")[0];
      const now = new Date();
      // Recent 3-month window
      const recent3moEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const r3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const recent3moStart = `${r3Start.getFullYear()}-${String(r3Start.getMonth() + 1).padStart(2, "0")}`;
      // Prior 3-month window
      const p3Start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const prior3moStart = `${p3Start.getFullYear()}-${String(p3Start.getMonth() + 1).padStart(2, "0")}`;

      const rows = await sql`
        -- Method A: issue_date anchor, pure paid_to_date persistence.
        -- Denominator: issued >= retentionDays ago, paid_to_date >= issue_date + 1 month.
        -- Numerator: paid_to_date >= issue_date + retentionDays.
        -- No term_date or at_risk filter for persistency.
        WITH filtered AS (
          SELECT
            COALESCE(NULLIF(TRIM(ga), ''), '202JVV00') AS agency_wn,
            COALESCE(NULLIF(TRIM(ga_name), ''), 'FYM') AS ga_name,
            UPPER(TRIM(cntrct_code)) AS status_code,
            COALESCE(annual_premium, 0) AS annual_premium,
            COALESCE(at_risk_policy, false) AS at_risk_policy,
            issue_date,
            paid_to_date,
            COALESCE(billing_mode, 1) AS billing_mode,
            TRIM(plan_code) AS plan_code
          FROM typed.unl_fym_policy_latest_load
          WHERE ${agencyFilter === FYM_MGA_WN
            ? sql`(TRIM(ga) = ${agencyFilter} OR ga IS NULL OR TRIM(ga) = '')`
            : sql`TRIM(ga) = ${agencyFilter}`}
        ),
        with_status AS (
          SELECT *,
            CASE status_code
              WHEN 'A' THEN 'active'
              WHEN 'T' THEN 'terminated'
              WHEN 'P' THEN 'pending'
              WHEN 'S' THEN 'suspended'
              ELSE 'pending'
            END AS status,
            CASE
              WHEN UPPER(plan_code) LIKE '%HHC%' OR UPPER(plan_code) LIKE '%AHH%' THEN 'HHC'
              ELSE 'HI'
            END AS product_type,
            -- Method A eligibility: issued >= retention window ago AND first draft succeeded
            CASE WHEN issue_date IS NOT NULL AND issue_date <= ${retCutoff}::date
                  AND paid_to_date >= issue_date + INTERVAL '1 month' THEN true ELSE false END AS is_eligible,
            -- Method A retained: paid_to_date >= issue_date + retention window
            CASE WHEN issue_date IS NOT NULL AND issue_date <= ${retCutoff}::date
                  AND paid_to_date >= issue_date + INTERVAL '1 month'
                  AND paid_to_date >= issue_date + make_interval(days => ${retentionDays}) THEN true ELSE false END AS is_retained
          FROM filtered
        ),
        hi_hhc AS (
          SELECT * FROM with_status WHERE product_type IN ('HI', 'HHC')
        )
        SELECT
          agency_wn AS agency_id,
          MIN(ga_name) AS agency_name,
          COUNT(*) FILTER (WHERE status = 'active') AS active_policies,
          COUNT(*) FILTER (WHERE status = 'terminated') AS terminated_policies,
          COALESCE(SUM(annual_premium / 12) FILTER (WHERE status = 'active'), 0) AS active_premium,
          COUNT(*) FILTER (WHERE at_risk_policy = true AND status = 'active') AS at_risk_count,
          COUNT(*) FILTER (WHERE is_eligible) AS eligible_90d,
          COUNT(*) FILTER (WHERE is_retained) AS retained_90d,
          -- Recent 3-month cohort (by issue_date)
          COUNT(*) FILTER (WHERE is_eligible AND TO_CHAR(issue_date, 'YYYY-MM') >= ${recent3moStart} AND TO_CHAR(issue_date, 'YYYY-MM') < ${recent3moEnd}) AS recent_3mo_eligible,
          COUNT(*) FILTER (WHERE is_retained AND TO_CHAR(issue_date, 'YYYY-MM') >= ${recent3moStart} AND TO_CHAR(issue_date, 'YYYY-MM') < ${recent3moEnd}) AS recent_3mo_retained,
          -- Prior 3-month cohort (by issue_date)
          COUNT(*) FILTER (WHERE is_eligible AND TO_CHAR(issue_date, 'YYYY-MM') >= ${prior3moStart} AND TO_CHAR(issue_date, 'YYYY-MM') < ${recent3moStart}) AS prior_3mo_eligible,
          COUNT(*) FILTER (WHERE is_retained AND TO_CHAR(issue_date, 'YYYY-MM') >= ${prior3moStart} AND TO_CHAR(issue_date, 'YYYY-MM') < ${recent3moStart}) AS prior_3mo_retained
        FROM hi_hhc
        GROUP BY agency_wn
      `;

      const agencies = rows.map((r: Record<string, unknown>) => {
        const eligible = Number(r.eligible_90d) || 0;
        const retained = Number(r.retained_90d) || 0;
        const r3e = Number(r.recent_3mo_eligible) || 0;
        const r3r = Number(r.recent_3mo_retained) || 0;
        const p3e = Number(r.prior_3mo_eligible) || 0;
        const p3r = Number(r.prior_3mo_retained) || 0;
        const agencyName = r.agency_id === '202JVV00' ? 'FYM' : ((r.agency_name as string | null)?.trim() || null);
        return {
          agency_id: r.agency_id as string,
          agency_name: agencyName,
          active_policies: Number(r.active_policies) || 0,
          terminated_policies: Number(r.terminated_policies) || 0,
          active_premium: Math.round((Number(r.active_premium) || 0) * 100) / 100,
          at_risk_count: Number(r.at_risk_count) || 0,
          retained_90d: retained,
          eligible_90d: eligible,
          retention_pct: eligible > 0 ? Math.round((retained / eligible) * 1000) / 10 : null,
          recent_3mo_pct: r3e > 0 ? Math.round((r3r / r3e) * 1000) / 10 : null,
          prior_3mo_pct: p3e > 0 ? Math.round((p3r / p3e) * 1000) / 10 : null,
        };
      });

      const orgEligible = agencies.reduce((s, a) => s + a.eligible_90d, 0);
      const orgRetained = agencies.reduce((s, a) => s + a.retained_90d, 0);

      // Per-product summary (fast path — separate GROUP BY product_type query)
      const productRows = await sql`
        WITH filtered AS (
          SELECT
            UPPER(TRIM(cntrct_code)) AS status_code,
            COALESCE(annual_premium, 0) AS annual_premium,
            COALESCE(at_risk_policy, false) AS at_risk_policy,
            issue_date,
            paid_to_date,
            COALESCE(billing_mode, 1) AS billing_mode,
            TRIM(plan_code) AS plan_code
          FROM typed.unl_fym_policy_latest_load
          WHERE ${agencyFilter === FYM_MGA_WN
            ? sql`(TRIM(ga) = ${agencyFilter} OR ga IS NULL OR TRIM(ga) = '')`
            : sql`TRIM(ga) = ${agencyFilter}`}
        ),
        with_product AS (
          SELECT *,
            CASE
              WHEN status_code = 'A' THEN 'active'
              WHEN status_code = 'T' THEN 'terminated'
              ELSE 'pending'
            END AS status,
            CASE
              WHEN UPPER(plan_code) LIKE '%HHC%' OR UPPER(plan_code) LIKE '%AHH%' THEN 'HHC'
              ELSE 'HI'
            END AS product_type,
            -- Method A eligibility: issued >= retention window ago AND first draft succeeded
            CASE WHEN issue_date IS NOT NULL AND issue_date <= ${retCutoff}::date
                  AND paid_to_date >= issue_date + INTERVAL '1 month' THEN true ELSE false END AS is_eligible,
            -- Method A retained: paid_to_date >= issue_date + retention window
            CASE WHEN issue_date IS NOT NULL AND issue_date <= ${retCutoff}::date
                  AND paid_to_date >= issue_date + INTERVAL '1 month'
                  AND paid_to_date >= issue_date + make_interval(days => ${retentionDays}) THEN true ELSE false END AS is_retained
          FROM filtered
          WHERE CASE
            WHEN UPPER(plan_code) LIKE '%HHC%' OR UPPER(plan_code) LIKE '%AHH%' THEN 'HHC'
            ELSE 'HI'
          END IN ('HI', 'HHC')
        )
        SELECT
          product_type,
          COUNT(*) FILTER (WHERE status = 'active') AS active_policies,
          COUNT(*) FILTER (WHERE status = 'terminated') AS terminated_policies,
          COALESCE(SUM(annual_premium / 12) FILTER (WHERE status = 'active'), 0) AS active_premium,
          COUNT(*) FILTER (WHERE at_risk_policy = true AND status = 'active') AS at_risk_count,
          COUNT(*) FILTER (WHERE is_eligible) AS eligible_90d,
          COUNT(*) FILTER (WHERE is_retained) AS retained_90d
        FROM with_product
        GROUP BY product_type
      `;

      const productSummary = productRows.map((r: Record<string, unknown>) => {
        const elig = Number(r.eligible_90d) || 0;
        const ret = Number(r.retained_90d) || 0;
        return {
          product_type: r.product_type as string,
          active_policies: Number(r.active_policies) || 0,
          terminated_policies: Number(r.terminated_policies) || 0,
          active_premium: Math.round((Number(r.active_premium) || 0) * 100) / 100,
          at_risk_count: Number(r.at_risk_count) || 0,
          eligible_90d: elig,
          retained_90d: ret,
          retention_pct: elig > 0 ? Math.round((ret / elig) * 1000) / 10 : null,
        };
      });

      const elapsedMs = Math.round(performance.now() - started);
      return jsonResponse({
        data: {
          org_wide: {
            total_agencies: agencies.length,
            total_active_policies: agencies.reduce((s, a) => s + a.active_policies, 0),
            total_terminated_policies: agencies.reduce((s, a) => s + a.terminated_policies, 0),
            total_active_premium: Math.round(agencies.reduce((s, a) => s + a.active_premium, 0) * 100) / 100,
            total_at_risk: agencies.reduce((s, a) => s + a.at_risk_count, 0),
            eligible_90d: orgEligible,
            retained_90d: orgRetained,
            retention_pct: orgEligible > 0 ? Math.round((orgRetained / orgEligible) * 1000) / 10 : null,
          },
          agencies,
          product_summary: productSummary,
        },
        _source: "retention_direct_sql_agg",
        _elapsed_ms: elapsedMs,
      });
    }

    // ── STANDARD PATH: row-by-row scan (org-wide or complex queries) ───
    // Load roster-based agent→agency overrides from FYM App DB.
    const rosterMap = await loadRosterMap();

    const FETCH_SIZE = 5000;
    let offset = 0;

    // Push agency/agent filters to SQL level for performance.
    const agencySQL = agencyFilter
      ? agencyFilter === FYM_MGA_WN
        ? sql`AND (TRIM(ga) = ${agencyFilter} OR ga IS NULL OR TRIM(ga) = '')`
        : sql`AND TRIM(ga) = ${agencyFilter}`
      : sql``;
    const agentSQL = agentFilter
      ? sql`AND TRIM(wa) = ${agentFilter}`
      : sql``;

    // Per-agency retention accumulators
    interface RetentionBucket {
      agency_id: string;
      agency_name: string | null;
      total_policies: number;
      active_policies: number;
      terminated_policies: number;
      active_premium: number;
      at_risk_count: number;
      eligible: number;   // Method A: issued >= window ago AND first draft succeeded
      retained: number;   // Method A: paid_to_date >= issue_date + window
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

    // Per-product accumulators (HI vs HHC — org-wide or agency-scoped)
    interface ProductBucket {
      active_policies: number;
      terminated_policies: number;
      active_premium: number;
      at_risk_count: number;
      eligible: number;
      retained: number;
    }
    const productBuckets = new Map<string, ProductBucket>();

    // Cohort map: issue month → { eligible, retained }
    const cohortMap = new Map<string, { eligible: number; retained: number }>();
    // Per-product cohort map: "HI:YYYY-MM" or "HHC:YYYY-MM" → { eligible, retained }
    const productCohortMap = new Map<string, { eligible: number; retained: number }>();
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
          issue_date,
          paid_to_date,
          term_date,
          annual_premium,
          billing_mode,
          at_risk_policy,
          TRIM(first_name) AS first_name,
          TRIM(last_name) AS last_name,
          TRIM(ga) AS ga,
          TRIM(ga_name) AS ga_name,
          TRIM(wa) AS wa,
          roster_hierarchy_json
        FROM typed.unl_fym_policy_latest_load
        WHERE 1=1 ${agencySQL} ${agentSQL}
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
        const issueDate = row.issue_date
          ? new Date(row.issue_date as string).toISOString().split("T")[0]
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

        // Primary path: flattened ga/wa fields (always populated)
        // Fallback: roster_hierarchy_json (currently empty in Max's DB)
        const hierarchyAgencyWn = resolveAgencyWn(row, roster);
        const agentWn = resolveAgentWn(row, roster);

        // Roster override: scan ALL hierarchy writing numbers for a roster match
        const agencyWn = rosterMap.resolveAgencyFromHierarchy(roster, hierarchyAgencyWn);

        // Agency filter
        if (agencyFilter && agencyWn !== agencyFilter) continue;

        // Agent filter — skip policies not belonging to the requested agent
        if (agentFilter && agentWn !== agentFilter) continue;

        const agencyId = agencyWn || "unknown";

        const { isAtRisk, flagType } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        // draftCount kept for at-risk list display only (not used in retention calc)
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
        // Resolve agency name from flattened ga_name field
        // FYM house production has blank ga_name — hardcode it
        const rawGaName = agencyId === '202JVV00' ? 'FYM' : ((row.ga_name as string | null)?.trim() || null);

        if (!buckets.has(agencyId)) {
          buckets.set(agencyId, {
            agency_id: agencyId,
            agency_name: rawGaName,
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

        // Accumulate per-product stats
        if (!productBuckets.has(productType)) {
          productBuckets.set(productType, {
            active_policies: 0, terminated_policies: 0,
            active_premium: 0, at_risk_count: 0,
            eligible: 0, retained: 0,
          });
        }
        const pb = productBuckets.get(productType)!;
        if (status === "active") {
          pb.active_policies++;
          pb.active_premium += monthlyPremium;
        }
        if (status === "terminated") {
          pb.terminated_policies++;
        }
        if (isAtRisk) {
          pb.at_risk_count++;
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

        // Method A retention: issue_date anchor, paid_to_date persistence.
        // Eligible = issued >= retentionDays ago AND first draft succeeded
        //   (paid_to_date >= issue_date + 1 month).
        // Retained = paid_to_date >= issue_date + retentionDays.
        // No term_date or at_risk filter.
        if (issueDate) {
          const issueDateObj = new Date(issueDate);

          if (issueDateObj <= retentionCutoff) {
            // Method A: first draft check
            const paidMs = paidToDate ? new Date(paidToDate).getTime() : 0;
            const issueMs = issueDateObj.getTime();
            const oneMonthMs = new Date(issueDate);
            oneMonthMs.setMonth(oneMonthMs.getMonth() + 1);
            const draftedFirst = paidMs >= oneMonthMs.getTime();

            // Retained = paid_to_date >= issue_date + retentionDays
            // Hoisted above the draftedFirst gate so cohort tracking can also use it
            const windowMs = new Date(issueDate);
            windowMs.setDate(windowMs.getDate() + retentionDays);
            const isRetained = draftedFirst && paidMs >= windowMs.getTime();

            if (draftedFirst) {
              bucket.eligible++;
              pb.eligible++;

              if (isRetained) {
                bucket.retained++;
                pb.retained++;
              }
            }

            // Cohort tracking (org-wide + per-product + per-agency)
            if ((type === "cohort" || type === "summary") && draftedFirst) {
              const monthKey = issueDate.slice(0, 7);
              if (!cohortMap.has(monthKey)) {
                cohortMap.set(monthKey, { eligible: 0, retained: 0 });
              }
              const cohort = cohortMap.get(monthKey)!;
              cohort.eligible++;
              if (isRetained) cohort.retained++;

              // Per-product cohort (HI vs HHC)
              const productKey = `${productType}:${monthKey}`;
              if (!productCohortMap.has(productKey)) {
                productCohortMap.set(productKey, { eligible: 0, retained: 0 });
              }
              const pc = productCohortMap.get(productKey)!;
              pc.eligible++;
              if (isRetained) pc.retained++;

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
          agency_name: b.agency_name,
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

        // Per-product summary (HI vs HHC)
        const productSummary = Array.from(productBuckets.entries()).map(([pt, pb]) => ({
          product_type: pt,
          active_policies: pb.active_policies,
          terminated_policies: pb.terminated_policies,
          active_premium: Math.round(pb.active_premium * 100) / 100,
          at_risk_count: pb.at_risk_count,
          eligible_90d: pb.eligible,
          retained_90d: pb.retained,
          retention_pct: pb.eligible > 0
            ? Math.round((pb.retained / pb.eligible) * 1000) / 10
            : null,
        }));

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
          product_summary: productSummary,
        };
        break;
      }

      case "at_risk": {
        // Return at-risk policy lists, optionally scoped by agency.
        // Task data (stage, ghl IDs) is enriched server-side using the
        // service role key — this bypasses RLS so the frontend does not
        // need a separate atrisk_tasks query.
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
          task_id?: string | null;
          task_stage?: string | null;
          task_assigned_to?: string | null;
          task_due_date?: string | null;
          task_created_at?: string | null;
          ghl_contact_id?: string | null;
          ghl_opportunity_id?: string | null;
        }> = [];

        for (const bucket of buckets.values()) {
          for (const p of bucket.at_risk_list) {
            atRiskRows.push({ agency_id: bucket.agency_id, ...p });
          }
        }

        // ── Server-side task enrichment ────────────────────────────────
        const _dbg: Record<string, unknown> = {};
        try {
          const svcUrl = Deno.env.get("SUPABASE_URL") || "";
          const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
          _dbg.has_url = !!svcUrl;
          _dbg.has_key = !!svcKey;
          _dbg.key_len = svcKey.length;

          if (svcUrl && svcKey) {
            const svc = createClient(svcUrl, svcKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            });

            // Quick probe — do we get rows at all?
            const probe = await svc
              .from("atrisk_tasks")
              .select("id, policy_number, stage", { count: "exact" })
              .limit(3);
            _dbg.probe_count = probe.count;
            _dbg.probe_rows = probe.data?.length ?? 0;
            _dbg.probe_error = probe.error?.message ?? null;

            if (probe.data && probe.data.length > 0) {
              // Full paginated fetch
              const taskMap = new Map<string, {
                id: string; stage: string; assigned_to: string | null;
                due_date: string | null; created_at: string;
                ghl_contact_id: string | null; ghl_opportunity_id: string | null;
              }>();
              const PG = 1000;
              let off = 0;
              while (true) {
                const { data: batch } = await svc
                  .from("atrisk_tasks")
                  .select("id, policy_number, stage, assigned_to, due_date, created_at, ghl_contact_id, ghl_opportunity_id")
                  .range(off, off + PG - 1);
                if (!batch || batch.length === 0) break;
                for (const t of batch as any[]) {
                  taskMap.set(t.policy_number, {
                    id: t.id, stage: t.stage, assigned_to: t.assigned_to,
                    due_date: t.due_date, created_at: t.created_at,
                    ghl_contact_id: t.ghl_contact_id, ghl_opportunity_id: t.ghl_opportunity_id,
                  });
                }
                if (batch.length < PG) break;
                off += PG;
              }
              _dbg.task_map_size = taskMap.size;

              let merged = 0;
              for (const row of atRiskRows) {
                const t = taskMap.get(row.policy_number);
                if (t) {
                  row.task_id = t.id;
                  row.task_stage = t.stage;
                  row.task_assigned_to = t.assigned_to;
                  row.task_due_date = t.due_date;
                  row.task_created_at = t.created_at;
                  row.ghl_contact_id = t.ghl_contact_id;
                  row.ghl_opportunity_id = t.ghl_opportunity_id;
                  merged++;
                }
              }
              _dbg.merged = merged;
            }
          }
        } catch (err: any) {
          _dbg.exception = err?.message || String(err);
        }

        // Sort by days idle descending (most urgent first)
        atRiskRows.sort((a, b) => b.days_idle - a.days_idle);

        result = {
          total_at_risk: atRiskRows.length,
          policies: atRiskRows,
          _task_debug: _dbg,
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

        // Per-product monthly cohort breakdown (HI vs HHC)
        const productCohorts: Array<{
          product_type: string;
          month: string;
          eligible: number;
          retained: number;
          retention_pct: number | null;
        }> = [];
        for (const [key, c] of productCohortMap) {
          const [pt, month] = key.split(":");
          productCohorts.push({
            product_type: pt,
            month,
            eligible: c.eligible,
            retained: c.retained,
            retention_pct: c.eligible > 0
              ? Math.round((c.retained / c.eligible) * 1000) / 10
              : null,
          });
        }
        productCohorts.sort((a, b) =>
          a.product_type.localeCompare(b.product_type) || a.month.localeCompare(b.month)
        );

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

        result = { cohorts, product_cohorts: productCohorts, agency_cohorts: agencyCohorts };
        break;
      }

      default:
        return jsonResponse({ error: `Unknown type: ${type}` }, 400, req);
    }

    const elapsedMs = Math.round(performance.now() - started);
    return jsonResponse({ data: result, _source: "prod_direct", _elapsed_ms: elapsedMs }, req);
  } catch (err) {
    console.error("retention-data error:", err);
    return jsonResponse({ error: "Internal server error" }, 500, req);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
