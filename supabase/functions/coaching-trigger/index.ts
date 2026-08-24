/**
 * coaching-trigger — Auto-flag agents for coaching pipeline
 *
 * Scans Max's production DB for agents breaching coaching thresholds,
 * then upserts coaching_plans in the FYM App Supabase.
 *
 * Three flag types:
 *   🟡 production  — below min policies in trailing window
 *   🔴 quality     — at-risk % or terminated % above threshold
 *   🟢 rts_watch   — agent moved to RTS in contracting pipeline
 *
 * For each flagged agent:
 *   1. Resolve roster_agent_id via agency_rosters (match on unl_writing_number)
 *   2. Check for existing active coaching_plan (same agent + flag type)
 *   3. If no active plan exists → insert new plan at 'flagged' stage
 *   4. If active plan exists → skip (don't re-flag)
 *
 * Also auto-resolves stale plans: if an agent was flagged but now passes
 * thresholds and is still at 'flagged' stage (no human has touched it),
 * auto-resolve with resolution_type = 'auto_resolved'.
 *
 * Auth: service role (bypasses RLS for writes)
 * Schedule: called nightly after sync-policy-cache, or manually via POST
 *
 * Query params:
 *   dry_run=true  — compute flags but don't write (returns what would happen)
 *   agency_id=XX  — restrict scan to a single agency writing number
 */

import {
  createProdConnection,
  FYM_MGA_WN,
  toTitleCase,
  jsonResponse,
  corsResponse,
} from "../_shared/prod-db.ts";

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

interface AgentStats {
  writing_number: string;
  agent_name: string | null;
  agency_wn: string;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  at_risk_pct: number;
  terminated_pct: number;
  recent_policies_30d: number;
}

interface Thresholds {
  retention_pct_min: number;
  at_risk_pct_max: number;
  terminated_pct_max: number;
  min_eligible_policies: number;
  production_min_policies: number;
  /** Trailing days to evaluate production (default 14 = bi-weekly) */
  production_lookback_days: number;
  /** Days agent has to resolve a production flag (default 30) */
  production_deadline_days: number;
  /** Trailing days to evaluate quality metrics (default 60) */
  quality_lookback_days: number;
  /** Days agent has to resolve a quality flag (default 30) */
  quality_deadline_days: number;
  /** Days agent has to resolve an RTS watch flag (default 30) */
  rts_deadline_days: number;
}

interface FlagResult {
  writing_number: string;
  agent_name: string | null;
  agency_wn: string;
  flag_type: "production" | "quality" | "rts_watch";
  trigger_metric: Record<string, unknown>;
  target_metric: Record<string, unknown>;
}

interface ActionResult {
  action: "created" | "skipped" | "auto_resolved" | "no_roster_match";
  writing_number: string;
  flag_type: string;
  plan_id?: string;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const agencyFilter = url.searchParams.get("agency_id");

  let sql: ReturnType<typeof createProdConnection> | null = null;

  try {
    // ── 1. Connect to FYM App Supabase ────────────────────────────────
    const appUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const appKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!appUrl || !appKey) {
      return jsonResponse({ error: "Missing APP_SUPABASE_URL or APP_SUPABASE_SERVICE_KEY" }, 500);
    }

    const supabase = createClient(appUrl, appKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 2. Load thresholds ────────────────────────────────────────────
    const { data: thresholdRow, error: thErr } = await supabase
      .from("coaching_thresholds")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (thErr) {
      return jsonResponse({ error: `Thresholds load failed: ${thErr.message}` }, 500);
    }

    const thresholds: Thresholds = {
      retention_pct_min: Number(thresholdRow?.retention_pct_min ?? 90),
      at_risk_pct_max: Number(thresholdRow?.at_risk_pct_max ?? 15),
      terminated_pct_max: Number(thresholdRow?.terminated_pct_max ?? 20),
      min_eligible_policies: Number(thresholdRow?.min_eligible_policies ?? 5),
      production_min_policies: Number(thresholdRow?.production_min_policies ?? 10),
      production_lookback_days: Number(thresholdRow?.production_lookback_days ?? 14),
      production_deadline_days: Number(thresholdRow?.production_deadline_days ?? 30),
      quality_lookback_days: Number(thresholdRow?.quality_lookback_days ?? 60),
      quality_deadline_days: Number(thresholdRow?.quality_deadline_days ?? 30),
      rts_deadline_days: Number(thresholdRow?.rts_deadline_days ?? 30),
    };

    // ── 3. Load agency roster mapping (writing_number → roster id + agency_id) ──
    const rosterMap = new Map<string, { roster_id: string; agency_id: string }>();
    const PAGE_SIZE = 500;
    let offset = 0;

    while (true) {
      const { data: rosterPage, error: rosterErr } = await supabase
        .from("agency_rosters")
        .select("id, agency_id, unl_writing_number")
        .not("unl_writing_number", "is", null)
        .neq("unl_writing_number", "")
        .range(offset, offset + PAGE_SIZE - 1);

      if (rosterErr) {
        console.error("Roster load error:", rosterErr);
        break;
      }

      for (const r of rosterPage || []) {
        if (r.unl_writing_number) {
          rosterMap.set(r.unl_writing_number.trim(), {
            roster_id: r.id,
            agency_id: r.agency_id,
          });
        }
      }

      if (!rosterPage || rosterPage.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // ── 4. Load agency writing_number → agency uuid mapping ───────────
    const agencyWnToId = new Map<string, string>();
    {
      const { data: agencies } = await supabase
        .from("agencies")
        .select("id, writing_number")
        .not("writing_number", "is", null);

      for (const a of agencies || []) {
        if (a.writing_number) {
          agencyWnToId.set(a.writing_number.trim(), a.id);
        }
      }
    }

    // ── 5. Load existing active coaching plans ────────────────────────
    const activePlans = new Map<string, { id: string; stage: string; flag_type: string }>();
    {
      let planOffset = 0;
      while (true) {
        const { data: planPage } = await supabase
          .from("coaching_plans")
          .select("id, roster_agent_id, flag_type, stage")
          .not("stage", "in", '("resolved","escalated")')
          .range(planOffset, planOffset + PAGE_SIZE - 1);

        for (const p of planPage || []) {
          const key = `${p.roster_agent_id}:${p.flag_type}`;
          activePlans.set(key, { id: p.id, stage: p.stage, flag_type: p.flag_type });
        }

        if (!planPage || planPage.length < PAGE_SIZE) break;
        planOffset += PAGE_SIZE;
      }
    }

    // ── 6. Query Max's prod DB for per-agent stats ────────────────────
    sql = createProdConnection();

    const agencyWhere = agencyFilter
      ? sql`AND agency_wn = ${agencyFilter}`
      : sql``;

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

    const prodWindowDaysAgo = new Date(now);
    prodWindowDaysAgo.setDate(prodWindowDaysAgo.getDate() - thresholds.production_lookback_days);
    const prodWindowStr = prodWindowDaysAgo.toISOString().slice(0, 10);

    const rows = await sql`
      WITH base AS (
        SELECT
          TRIM(wa) AS writing_number,
          TRIM(wa_name) AS wa_name,
          COALESCE(NULLIF(TRIM(ga), ''), ${FYM_MGA_WN}) AS agency_wn,
          UPPER(TRIM(cntrct_code)) AS status_code,
          COALESCE(annual_premium, 0) AS annual_premium,
          COALESCE(at_risk_policy, false) AS at_risk_flag,
          issue_date,
          paid_to_date,
          COALESCE(billing_mode::text, '1') AS billing_mode
        FROM typed.unl_fym_policy_latest_load
        WHERE TRIM(wa) IS NOT NULL
          AND TRIM(wa) != ''
      ),
      filtered AS (
        SELECT * FROM base
        WHERE 1=1
          ${agencyWhere}
      ),
      agent_agg AS (
        SELECT
          writing_number,
          MAX(wa_name) AS agent_name,
          agency_wn,
          COUNT(*) AS total_policies,
          COUNT(*) FILTER (WHERE status_code = 'A') AS active_policies,
          COUNT(*) FILTER (WHERE status_code = 'T') AS terminated_policies,
          COUNT(*) FILTER (WHERE status_code = 'A' AND at_risk_flag = true) AS at_risk_count,
          -- 90-day retention
          COUNT(*) FILTER (
            WHERE issue_date <= ${threeMonthsAgoStr}::date
              AND (
                (billing_mode = '1'
                  AND paid_to_date >= issue_date + INTERVAL '3 months')
                OR (billing_mode != '1'
                  AND paid_to_date >= issue_date + INTERVAL '1 month')
              )
          ) AS retained_90d,
          COUNT(*) FILTER (
            WHERE issue_date <= ${threeMonthsAgoStr}::date
              AND paid_to_date >= issue_date + INTERVAL '1 month'
          ) AS eligible_90d,
          -- Recent production (trailing window)
          COUNT(*) FILTER (
            WHERE issue_date >= ${prodWindowStr}::date
          ) AS recent_policies_30d
        FROM filtered
        GROUP BY writing_number, agency_wn
      )
      SELECT * FROM agent_agg
    `;

    // ── 7. Compute flags ──────────────────────────────────────────────
    const agentStats: AgentStats[] = rows.map((r: any) => ({
      writing_number: r.writing_number,
      agent_name: r.agent_name ? toTitleCase(r.agent_name) : null,
      agency_wn: r.agency_wn,
      total_policies: Number(r.total_policies),
      active_policies: Number(r.active_policies),
      terminated_policies: Number(r.terminated_policies),
      at_risk_count: Number(r.at_risk_count),
      retained_90d: Number(r.retained_90d),
      eligible_90d: Number(r.eligible_90d),
      retention_pct: Number(r.eligible_90d) > 0
        ? Math.round(1000 * Number(r.retained_90d) / Number(r.eligible_90d)) / 10
        : null,
      at_risk_pct: Number(r.active_policies) > 0
        ? Math.round(1000 * Number(r.at_risk_count) / Number(r.active_policies)) / 10
        : 0,
      terminated_pct: Number(r.total_policies) > 0
        ? Math.round(1000 * Number(r.terminated_policies) / Number(r.total_policies)) / 10
        : 0,
      recent_policies_30d: Number(r.recent_policies_30d),
    }));

    // Determine flags per agent
    const flags: FlagResult[] = [];

    for (const agent of agentStats) {
      // Production flag: below min policies in trailing window
      if (agent.recent_policies_30d < thresholds.production_min_policies
          && agent.total_policies >= thresholds.min_eligible_policies) {
        flags.push({
          writing_number: agent.writing_number,
          agent_name: agent.agent_name,
          agency_wn: agent.agency_wn,
          flag_type: "production",
          trigger_metric: {
            policies_in_window: agent.recent_policies_30d,
            threshold: thresholds.production_min_policies,
            lookback_days: thresholds.production_lookback_days,
          },
          target_metric: {
            metric: "policies_in_window",
            target: thresholds.production_min_policies,
            lookback_days: thresholds.production_lookback_days,
          },
        });
      }

      // Quality flag: at-risk % or terminated % above threshold
      const qualityFlagged =
        (agent.active_policies >= thresholds.min_eligible_policies
          && agent.at_risk_pct > thresholds.at_risk_pct_max) ||
        (agent.total_policies >= thresholds.min_eligible_policies
          && agent.terminated_pct > thresholds.terminated_pct_max) ||
        (agent.eligible_90d >= thresholds.min_eligible_policies
          && agent.retention_pct !== null
          && agent.retention_pct < thresholds.retention_pct_min);

      if (qualityFlagged) {
        flags.push({
          writing_number: agent.writing_number,
          agent_name: agent.agent_name,
          agency_wn: agent.agency_wn,
          flag_type: "quality",
          trigger_metric: {
            at_risk_pct: agent.at_risk_pct,
            at_risk_threshold: thresholds.at_risk_pct_max,
            terminated_pct: agent.terminated_pct,
            terminated_threshold: thresholds.terminated_pct_max,
            retention_pct: agent.retention_pct,
            retention_threshold: thresholds.retention_pct_min,
          },
          target_metric: {
            metric: "quality_composite",
            at_risk_target: thresholds.at_risk_pct_max,
            terminated_target: thresholds.terminated_pct_max,
            retention_target: thresholds.retention_pct_min,
          },
        });
      }

      // RTS Watch: handled separately — triggered by contracting pipeline
      // status changes, not by prod DB metrics. The trigger for rts_watch
      // comes from the contracting pipeline when an agent moves to RTS.
      // This function handles production + quality only.
    }

    // ── 8. Build the set of currently-flagged writing numbers per flag type ──
    const currentlyFlagged = new Set(flags.map(f => `${f.writing_number}:${f.flag_type}`));

    // ── 9. Process: create new plans + auto-resolve stale ones ────────
    const actions: ActionResult[] = [];

    if (!dryRun) {
      // 9a. Create new coaching plans for newly-flagged agents
      for (const flag of flags) {
        const roster = rosterMap.get(flag.writing_number);
        if (!roster) {
          actions.push({
            action: "no_roster_match",
            writing_number: flag.writing_number,
            flag_type: flag.flag_type,
            reason: `No roster entry for WN ${flag.writing_number}`,
          });
          continue;
        }

        const planKey = `${roster.roster_id}:${flag.flag_type}`;
        if (activePlans.has(planKey)) {
          actions.push({
            action: "skipped",
            writing_number: flag.writing_number,
            flag_type: flag.flag_type,
            plan_id: activePlans.get(planKey)!.id,
            reason: "Active plan already exists",
          });
          continue;
        }

        // Calculate deadline — how long the agent has to resolve the flag
        const deadlineDays = flag.flag_type === "production"
          ? thresholds.production_deadline_days
          : flag.flag_type === "quality"
            ? thresholds.quality_deadline_days
            : thresholds.rts_deadline_days;

        const deadline = new Date();
        deadline.setDate(deadline.getDate() + deadlineDays);

        const { data: newPlan, error: insertErr } = await supabase
          .from("coaching_plans")
          .insert({
            agency_id: roster.agency_id,
            roster_agent_id: roster.roster_id,
            flag_type: flag.flag_type,
            stage: "flagged",
            deadline: deadline.toISOString(),
            trigger_metric: flag.trigger_metric,
            target_metric: flag.target_metric,
          })
          .select("id")
          .single();

        if (insertErr) {
          // Unique constraint violation = plan was created between our check and insert
          if (insertErr.code === "23505") {
            actions.push({
              action: "skipped",
              writing_number: flag.writing_number,
              flag_type: flag.flag_type,
              reason: "Concurrent insert — plan already exists",
            });
          } else {
            console.error(`Insert error for ${flag.writing_number}/${flag.flag_type}:`, insertErr);
            actions.push({
              action: "skipped",
              writing_number: flag.writing_number,
              flag_type: flag.flag_type,
              reason: `Insert error: ${insertErr.message}`,
            });
          }
          continue;
        }

        // Record initial stage history
        if (newPlan) {
          await supabase.from("coaching_stage_history").insert({
            plan_id: newPlan.id,
            from_stage: null,
            to_stage: "flagged",
            note: `Auto-flagged: ${flag.flag_type} — ${JSON.stringify(flag.trigger_metric)}`,
          });
        }

        actions.push({
          action: "created",
          writing_number: flag.writing_number,
          flag_type: flag.flag_type,
          plan_id: newPlan?.id,
        });
      }

      // 9b. Auto-resolve stale plans: agents still at 'flagged' stage but no longer breaching
      // Only auto-resolve plans that:
      //   - Are still at 'flagged' stage (no human has touched them)
      //   - The agent's writing number is no longer in the flagged set
      //   - The agent is in the roster (so we can match)
      const reverseRoster = new Map<string, string>(); // roster_id → writing_number
      for (const [wn, entry] of rosterMap) {
        reverseRoster.set(entry.roster_id, wn);
      }

      for (const [key, plan] of activePlans) {
        if (plan.stage !== "flagged") continue; // only auto-resolve untouched plans

        const [rosterId, flagType] = key.split(":");
        const wn = reverseRoster.get(rosterId);
        if (!wn) continue;

        const flagKey = `${wn}:${flagType}`;
        if (currentlyFlagged.has(flagKey)) continue; // still flagged

        // Agent no longer breaches threshold — auto-resolve
        const { error: resolveErr } = await supabase
          .from("coaching_plans")
          .update({
            stage: "resolved",
            resolved_at: new Date().toISOString(),
            resolution_type: "auto_resolved",
            resolution_note: "Agent no longer breaches threshold — auto-resolved by nightly scan",
          })
          .eq("id", plan.id);

        if (!resolveErr) {
          await supabase.from("coaching_stage_history").insert({
            plan_id: plan.id,
            from_stage: "flagged",
            to_stage: "resolved",
            note: "Auto-resolved: agent metrics now within thresholds",
          });

          actions.push({
            action: "auto_resolved",
            writing_number: wn,
            flag_type: flagType,
            plan_id: plan.id,
          });
        }
      }
    }

    // ── 10. Build summary ─────────────────────────────────────────────
    const elapsed = Math.round(performance.now() - started);

    const summary = {
      dry_run: dryRun,
      agents_scanned: agentStats.length,
      agents_flagged: new Set(flags.map(f => f.writing_number)).size,
      flags_total: flags.length,
      flags_by_type: {
        production: flags.filter(f => f.flag_type === "production").length,
        quality: flags.filter(f => f.flag_type === "quality").length,
        rts_watch: flags.filter(f => f.flag_type === "rts_watch").length,
      },
      roster_coverage: rosterMap.size,
      thresholds,
      elapsed_ms: elapsed,
    };

    if (dryRun) {
      return jsonResponse({
        ...summary,
        flags,
        note: "Dry run — no coaching plans were created or modified",
      });
    }

    const actionSummary = {
      created: actions.filter(a => a.action === "created").length,
      skipped: actions.filter(a => a.action === "skipped").length,
      auto_resolved: actions.filter(a => a.action === "auto_resolved").length,
      no_roster_match: actions.filter(a => a.action === "no_roster_match").length,
    };

    return jsonResponse({
      ...summary,
      actions: actionSummary,
      details: actions,
    });
  } catch (err: any) {
    console.error("coaching-trigger error:", err);
    return jsonResponse({ error: err.message ?? "Internal error" }, 500);
  } finally {
    if (sql) await sql.end();
  }
});
