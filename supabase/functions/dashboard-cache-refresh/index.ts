/**
 * dashboard-cache-refresh — Pre-compute and cache all dashboard data
 *
 * Queries Max's production DB directly (same as retention-data + prod-data),
 * computes retention summaries, cohorts, production stats, and product
 * breakdowns, then upserts the results into the dashboard_cache table
 * in rcbzag for instant frontend reads.
 *
 * Trigger: pg_cron hourly at :00, plus on-demand POST.
 * Auth: service role key required (writes to dashboard_cache).
 *
 * Cache keys written:
 *   - retention_summary  (org_wide + per-agency + product_summary)
 *   - retention_cohorts   (monthly cohorts, per-product, per-agency)
 *   - agency_production   (per-agency production stats)
 *   - monthly_production  (monthly trend data)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createProdConnection,
  CONTRACT_STATUS,
  FYM_MGA_WN,
  planToProductType,
  resolveAgencyWn,
  resolveAgentWn,
  resolveRiskFlag,
  estimateDraftCount,
  jsonResponse,
  corsResponse,
} from "../_shared/prod-db.ts";
import { loadRosterMap } from "../_shared/roster-map.ts";

const APP_URL = Deno.env.get("APP_SUPABASE_URL") ?? "";
const APP_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();
  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    sql = createProdConnection();
    const rosterMap = await loadRosterMap();
    const appClient = createClient(APP_URL, APP_SERVICE_KEY);

    const FETCH_SIZE = 5000;
    let offset = 0;

    // ── Accumulators ──────────────────────────────────────────────────

    // Per-agency
    interface AgencyBucket {
      agency_id: string;
      agency_name: string | null;
      total_policies: number;
      active_policies: number;
      terminated_policies: number;
      pending_policies: number;
      active_premium: number;
      active_annual_premium: number;
      pending_annual_premium: number;
      at_risk_count: number;
      at_risk_annual_premium: number;
      terminated_annual_premium: number;
      eligible: number;
      retained: number;
    }
    const agencyBuckets = new Map<string, AgencyBucket>();

    // Per-product (HI vs HHC)
    interface ProductBucket {
      active_policies: number;
      terminated_policies: number;
      active_premium: number;
      at_risk_count: number;
      eligible: number;
      retained: number;
    }
    const productBuckets = new Map<string, ProductBucket>();

    // Cohort maps
    const cohortMap = new Map<string, { eligible: number; retained: number }>();
    const productCohortMap = new Map<string, { eligible: number; retained: number }>();
    const agencyCohortMap = new Map<string, Map<string, { eligible: number; retained: number }>>();

    // Daily production (issue_date bucketed by day)
    const dailyProdMap = new Map<string, Map<string, { policies: number; annual_premium: number }>>();
    // Monthly production
    const monthlyProdMap = new Map<string, Map<string, { policies: number; annual_premium: number }>>();

    const now = new Date();
    const retentionDays = 90;
    const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    // ── Scan all policies ────────────────────────────────────────────

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
          TRIM(ga) AS ga,
          TRIM(ga_name) AS ga_name,
          TRIM(wa) AS wa,
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
          writing_number: string; depth: string; is_person: boolean; name: string;
        }> | null;

        const hierarchyAgencyWn = resolveAgencyWn(row, roster);
        const agencyWn = rosterMap.resolveAgencyFromHierarchy(roster, hierarchyAgencyWn);
        const agencyId = agencyWn || "unknown";

        const rawGaName = agencyId === '202JVV00' ? 'FYM' : ((row.ga_name as string | null)?.trim() || null);

        const { isAtRisk } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        const billingMode = (row.billing_mode as number | null) ?? 1;
        const draftCount = estimateDraftCount(appRecvdDate, paidToDate, billingMode);

        // ── Agency bucket ──
        if (!agencyBuckets.has(agencyId)) {
          agencyBuckets.set(agencyId, {
            agency_id: agencyId,
            agency_name: rawGaName,
            total_policies: 0,
            active_policies: 0,
            terminated_policies: 0,
            pending_policies: 0,
            active_premium: 0,
            active_annual_premium: 0,
            pending_annual_premium: 0,
            at_risk_count: 0,
            at_risk_annual_premium: 0,
            terminated_annual_premium: 0,
            eligible: 0,
            retained: 0,
          });
        }
        const ab = agencyBuckets.get(agencyId)!;
        ab.total_policies++;

        if (status === "active") {
          ab.active_policies++;
          ab.active_premium += monthlyPremium;
          ab.active_annual_premium += annualPremium;
        } else if (status === "terminated") {
          ab.terminated_policies++;
          ab.terminated_annual_premium += annualPremium;
        } else {
          ab.pending_policies++;
          ab.pending_annual_premium += annualPremium;
        }

        if (isAtRisk) {
          ab.at_risk_count++;
          ab.at_risk_annual_premium += annualPremium;
        }

        // ── Product bucket ──
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
        if (status === "terminated") pb.terminated_policies++;
        if (isAtRisk) pb.at_risk_count++;

        // ── Retention eligibility ──
        if (appRecvdDate) {
          const appDate = new Date(appRecvdDate);
          if (appDate <= retentionCutoff) {
            ab.eligible++;
            pb.eligible++;

            const isRetained = billingMode === 1 ? draftCount >= 3 : draftCount >= 1;
            if (isRetained) {
              ab.retained++;
              pb.retained++;
            }

            // Cohort tracking
            const monthKey = appRecvdDate.slice(0, 7);

            if (!cohortMap.has(monthKey)) cohortMap.set(monthKey, { eligible: 0, retained: 0 });
            const cohort = cohortMap.get(monthKey)!;
            cohort.eligible++;
            if (isRetained) cohort.retained++;

            const productKey = `${productType}:${monthKey}`;
            if (!productCohortMap.has(productKey)) productCohortMap.set(productKey, { eligible: 0, retained: 0 });
            const pc = productCohortMap.get(productKey)!;
            pc.eligible++;
            if (isRetained) pc.retained++;

            if (!agencyCohortMap.has(agencyId)) agencyCohortMap.set(agencyId, new Map());
            const am = agencyCohortMap.get(agencyId)!;
            if (!am.has(monthKey)) am.set(monthKey, { eligible: 0, retained: 0 });
            const ac = am.get(monthKey)!;
            ac.eligible++;
            if (isRetained) ac.retained++;
          }
        }

        // ── Production tracking (by issue date) ──
        if (appRecvdDate) {
          // Daily
          if (!dailyProdMap.has(agencyId)) dailyProdMap.set(agencyId, new Map());
          const dayMap = dailyProdMap.get(agencyId)!;
          if (!dayMap.has(appRecvdDate)) dayMap.set(appRecvdDate, { policies: 0, annual_premium: 0 });
          const day = dayMap.get(appRecvdDate)!;
          day.policies++;
          day.annual_premium += annualPremium;

          // Monthly
          const monthKey = appRecvdDate.slice(0, 7);
          if (!monthlyProdMap.has(agencyId)) monthlyProdMap.set(agencyId, new Map());
          const moMap = monthlyProdMap.get(agencyId)!;
          if (!moMap.has(monthKey)) moMap.set(monthKey, { policies: 0, annual_premium: 0 });
          const mo = moMap.get(monthKey)!;
          mo.policies++;
          mo.annual_premium += annualPremium;
        }
      }

      if (rows.length < FETCH_SIZE) break;
      offset += FETCH_SIZE;
    }

    // ── Build retention summary payload ──────────────────────────────

    // Recent 3-month windows for per-agency trend
    const now3mo = new Date(); now3mo.setMonth(now3mo.getMonth() - 3);
    const recent3moStart = now3mo.toISOString().slice(0, 7);
    const now6mo = new Date(); now6mo.setMonth(now6mo.getMonth() - 6);
    const prior3moStart = now6mo.toISOString().slice(0, 7);

    function compute3mo(agencyId: string, start: string, end: string): number | null {
      const months = agencyCohortMap.get(agencyId);
      if (!months) return null;
      let elig = 0, ret = 0;
      for (const [month, c] of months) {
        if (month >= start && month < end) { elig += c.eligible; ret += c.retained; }
      }
      return elig > 0 ? Math.round((ret / elig) * 1000) / 10 : null;
    }

    const agencySummaries = Array.from(agencyBuckets.values()).map((b) => ({
      agency_id: b.agency_id,
      agency_name: b.agency_name,
      active_policies: b.active_policies,
      terminated_policies: b.terminated_policies,
      active_premium: Math.round(b.active_premium * 100) / 100,
      at_risk_count: b.at_risk_count,
      retained_90d: b.retained,
      eligible_90d: b.eligible,
      retention_pct: b.eligible > 0 ? Math.round((b.retained / b.eligible) * 1000) / 10 : null,
      recent_3mo_pct: compute3mo(b.agency_id, recent3moStart, now.toISOString().slice(0, 7)),
      prior_3mo_pct: compute3mo(b.agency_id, prior3moStart, recent3moStart),
    }));

    const orgEligible = agencySummaries.reduce((s, a) => s + a.eligible_90d, 0);
    const orgRetained = agencySummaries.reduce((s, a) => s + a.retained_90d, 0);

    const productSummary = Array.from(productBuckets.entries()).map(([pt, pb]) => ({
      product_type: pt,
      active_policies: pb.active_policies,
      terminated_policies: pb.terminated_policies,
      active_premium: Math.round(pb.active_premium * 100) / 100,
      at_risk_count: pb.at_risk_count,
      eligible_90d: pb.eligible,
      retained_90d: pb.retained,
      retention_pct: pb.eligible > 0 ? Math.round((pb.retained / pb.eligible) * 1000) / 10 : null,
    }));

    const retentionSummaryPayload = {
      data: {
        org_wide: {
          total_agencies: agencySummaries.length,
          total_active_policies: agencySummaries.reduce((s, a) => s + a.active_policies, 0),
          total_terminated_policies: agencySummaries.reduce((s, a) => s + a.terminated_policies, 0),
          total_active_premium: Math.round(agencySummaries.reduce((s, a) => s + a.active_premium, 0) * 100) / 100,
          total_at_risk: agencySummaries.reduce((s, a) => s + a.at_risk_count, 0),
          eligible_90d: orgEligible,
          retained_90d: orgRetained,
          retention_pct: orgEligible > 0 ? Math.round((orgRetained / orgEligible) * 1000) / 10 : null,
        },
        agencies: agencySummaries.sort((a, b) => (b.retention_pct ?? 0) - (a.retention_pct ?? 0)),
        product_summary: productSummary,
      },
      _source: "dashboard_cache_refresh",
    };

    // ── Build cohort payload ─────────────────────────────────────────

    const cohorts = Array.from(cohortMap.entries())
      .map(([month, c]) => ({
        month, eligible: c.eligible, retained: c.retained,
        retention_pct: c.eligible > 0 ? Math.round((c.retained / c.eligible) * 1000) / 10 : null,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const pCohorts: Array<{ product_type: string; month: string; eligible: number; retained: number; retention_pct: number | null }> = [];
    for (const [key, c] of productCohortMap) {
      const [pt, month] = key.split(":");
      pCohorts.push({
        product_type: pt, month, eligible: c.eligible, retained: c.retained,
        retention_pct: c.eligible > 0 ? Math.round((c.retained / c.eligible) * 1000) / 10 : null,
      });
    }
    pCohorts.sort((a, b) => a.product_type.localeCompare(b.product_type) || a.month.localeCompare(b.month));

    const aCohorts: Array<{ agency_id: string; month: string; eligible: number; retained: number; retention_pct: number | null }> = [];
    for (const [agencyId, months] of agencyCohortMap) {
      for (const [month, c] of months) {
        aCohorts.push({
          agency_id: agencyId, month, eligible: c.eligible, retained: c.retained,
          retention_pct: c.eligible > 0 ? Math.round((c.retained / c.eligible) * 1000) / 10 : null,
        });
      }
    }
    aCohorts.sort((a, b) => a.agency_id.localeCompare(b.agency_id) || a.month.localeCompare(b.month));

    const cohortPayload = {
      data: { cohorts, product_cohorts: pCohorts, agency_cohorts: aCohorts },
      _source: "dashboard_cache_refresh",
    };

    // ── Build agency production payload ──────────────────────────────

    const agencyProduction = Array.from(agencyBuckets.values()).map((b) => ({
      agency_id: b.agency_id,
      agency_name: b.agency_name,
      total_policies: b.total_policies,
      active_policies: b.active_policies,
      terminated_policies: b.terminated_policies,
      pending_policies: b.pending_policies,
      total_annual_premium: Math.round((b.active_annual_premium + b.pending_annual_premium + b.terminated_annual_premium) * 100) / 100,
      active_annual_premium: Math.round(b.active_annual_premium * 100) / 100,
      pending_annual_premium: Math.round(b.pending_annual_premium * 100) / 100,
      at_risk_policies: b.at_risk_count,
      at_risk_annual_premium: Math.round(b.at_risk_annual_premium * 100) / 100,
      terminated_annual_premium: Math.round(b.terminated_annual_premium * 100) / 100,
    }));

    // ── Build monthly production payload ─────────────────────────────

    const monthlyProduction: Array<{ month: string; agency_id: string; policies: number; annual_premium: number }> = [];
    for (const [agencyId, moMap] of monthlyProdMap) {
      for (const [month, data] of moMap) {
        monthlyProduction.push({
          month, agency_id: agencyId,
          policies: data.policies,
          annual_premium: Math.round(data.annual_premium * 100) / 100,
        });
      }
    }
    monthlyProduction.sort((a, b) => a.month.localeCompare(b.month) || a.agency_id.localeCompare(b.agency_id));

    // ── Build daily production payload (last 90 days only) ───────────

    const dailyCutoff = new Date(now.getTime() - 90 * 86400000).toISOString().split("T")[0];
    const dailyProduction: Array<{ day: string; agency_id: string; policies: number; annual_premium: number }> = [];
    for (const [agencyId, dayMap] of dailyProdMap) {
      for (const [day, data] of dayMap) {
        if (day >= dailyCutoff) {
          dailyProduction.push({
            day, agency_id: agencyId,
            policies: data.policies,
            annual_premium: Math.round(data.annual_premium * 100) / 100,
          });
        }
      }
    }
    dailyProduction.sort((a, b) => a.day.localeCompare(b.day) || a.agency_id.localeCompare(b.agency_id));

    // ── Upsert all cache entries ─────────────────────────────────────

    const elapsedMs = Math.round(performance.now() - started);
    const refreshedAt = new Date().toISOString();

    const cacheEntries = [
      { cache_key: "retention_summary", payload: retentionSummaryPayload },
      { cache_key: "retention_cohorts", payload: cohortPayload },
      { cache_key: "agency_production", payload: agencyProduction },
      { cache_key: "monthly_production", payload: monthlyProduction },
      { cache_key: "daily_production", payload: dailyProduction },
    ];

    for (const entry of cacheEntries) {
      const { error } = await appClient
        .from("dashboard_cache")
        .upsert({
          cache_key: entry.cache_key,
          payload: entry.payload,
          refreshed_at: refreshedAt,
          elapsed_ms: elapsedMs,
        }, { onConflict: "cache_key" });

      if (error) {
        console.error(`Failed to upsert ${entry.cache_key}:`, error);
      }
    }

    const totalElapsed = Math.round(performance.now() - started);

    return jsonResponse({
      status: "ok",
      cache_keys: cacheEntries.map((e) => e.cache_key),
      agencies_processed: agencyBuckets.size,
      policies_scanned: offset + (agencyBuckets.size > 0 ? Array.from(agencyBuckets.values()).reduce((s, b) => s + b.total_policies, 0) : 0),
      refreshed_at: refreshedAt,
      _elapsed_ms: totalElapsed,
    });
  } catch (err) {
    console.error("dashboard-cache-refresh error:", err);
    return jsonResponse({ error: String(err) }, 500);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
});
