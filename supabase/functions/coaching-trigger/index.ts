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
  verifyAuth,
} from "../_shared/prod-db.ts";

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

/**
 * Coaching pipeline scope: FYM Direct agents only.
 * Only agents rostered under this agency are eligible for coaching flags.
 * Sub-agencies are excluded — they manage their own agents.
 */
const FYM_DIRECT_AGENCY_ID = "338230f2-2058-407c-9507-5aa88d6d5e14";
const FYM_DIRECT_AGENCY_WN = "202JVV00";

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
  if (req.method === "OPTIONS") return corsResponse(req);

  // ── Auth gate ──────────────────────────────────────────────────────
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return jsonResponse({ error: authError || "Unauthorized" }, 401, req);
  }

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
    //    SCOPED TO FYM DIRECT ONLY — only agents rostered under FYM are eligible
    const rosterMap = new Map<string, { roster_id: string; agency_id: string }>();
    const PAGE_SIZE = 500;
    let offset = 0;

    while (true) {
      const { data: rosterPage, error: rosterErr } = await supabase
        .from("agency_rosters")
        .select("id, agency_id, unl_writing_number")
        .eq("agency_id", FYM_DIRECT_AGENCY_ID)
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

    // ── 5. Load existing active coaching plans (one per agent, multi-flag) ──
    interface ActivePlan { id: string; stage: string; flags: Array<{ type: string; resolved: boolean; deadline: string }> }
    const activePlans = new Map<string, ActivePlan>(); // roster_agent_id → plan
    {
      let planOffset = 0;
      while (true) {
        const { data: planPage } = await supabase
          .from("coaching_plans")
          .select("id, roster_agent_id, stage, flags")
          .not("stage", "in", '("resolved","escalated")')
          .range(planOffset, planOffset + PAGE_SIZE - 1);

        for (const p of planPage || []) {
          activePlans.set(p.roster_agent_id, {
            id: p.id,
            stage: p.stage,
            flags: (p.flags as ActivePlan["flags"]) || [],
          });
        }

        if (!planPage || planPage.length < PAGE_SIZE) break;
        planOffset += PAGE_SIZE;
      }
    }

    // ── 6. Query Max's prod DB for per-agent stats ────────────────────
    //    Only query agents whose writing numbers are in the FYM Direct roster.
    //    This ensures we never flag sub-agency agents.
    sql = createProdConnection();

    const rosterWritingNumbers = [...rosterMap.keys()];
    if (rosterWritingNumbers.length === 0) {
      return jsonResponse({
        dry_run: dryRun,
        agents_scanned: 0,
        agents_flagged: 0,
        flags_total: 0,
        flags_by_type: { production: 0, quality: 0, rts_watch: 0 },
        roster_coverage: 0,
        note: "No FYM Direct roster agents found — nothing to scan",
        elapsed_ms: Math.round(performance.now() - started),
      });
    }

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
      roster_wns AS (
        SELECT unnest(${rosterWritingNumbers}::text[]) AS wn
      ),
      filtered AS (
        SELECT base.* FROM base
        JOIN roster_wns ON base.writing_number = roster_wns.wn
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

    // ── 8. Group flags by agent writing number ──────────────────────
    const flagsByAgent = new Map<string, FlagResult[]>();
    for (const flag of flags) {
      const list = flagsByAgent.get(flag.writing_number) || [];
      list.push(flag);
      flagsByAgent.set(flag.writing_number, list);
    }

    // Build set of currently-flagged flag types per agent WN
    const currentFlagTypes = new Map<string, Set<string>>();
    for (const [wn, agentFlags] of flagsByAgent) {
      currentFlagTypes.set(wn, new Set(agentFlags.map(f => f.flag_type)));
    }

    // ── 9. Process: upsert plans (one per agent, multi-flag) ────────
    const actions: ActionResult[] = [];

    if (!dryRun) {
      // 9a. For each flagged agent: create new plan or add flags to existing
      for (const [wn, agentFlags] of flagsByAgent) {
        const roster = rosterMap.get(wn);
        if (!roster) {
          actions.push({
            action: "no_roster_match",
            writing_number: wn,
            flag_type: agentFlags.map(f => f.flag_type).join(","),
            reason: `No roster entry for WN ${wn}`,
          });
          continue;
        }

        const existingPlan = activePlans.get(roster.roster_id);
        const existingFlagTypes = new Set(
          (existingPlan?.flags || []).filter(f => !f.resolved).map(f => f.type)
        );

        // Build new flag entries for types not already on the plan
        const newFlagEntries: Array<Record<string, unknown>> = [];
        for (const flag of agentFlags) {
          if (existingFlagTypes.has(flag.flag_type)) {
            actions.push({
              action: "skipped",
              writing_number: wn,
              flag_type: flag.flag_type,
              plan_id: existingPlan?.id,
              reason: "Flag type already active on plan",
            });
            continue;
          }

          const deadlineDays = flag.flag_type === "production"
            ? thresholds.production_deadline_days
            : flag.flag_type === "quality"
              ? thresholds.quality_deadline_days
              : thresholds.rts_deadline_days;
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + deadlineDays);

          newFlagEntries.push({
            type: flag.flag_type,
            flagged_at: new Date().toISOString(),
            deadline: deadline.toISOString(),
            trigger_metric: flag.trigger_metric,
            target_metric: flag.target_metric,
            resolved: false,
          });
        }

        if (newFlagEntries.length === 0) continue;

        if (existingPlan) {
          // Append new flags to existing plan
          const updatedFlags = [...existingPlan.flags, ...newFlagEntries];
          const earliestDeadline = updatedFlags
            .filter((f: any) => !f.resolved)
            .map((f: any) => new Date(f.deadline).getTime())
            .reduce((a, b) => Math.min(a, b), Infinity);

          const { error: updateErr } = await supabase
            .from("coaching_plans")
            .update({
              flags: updatedFlags,
              deadline: new Date(earliestDeadline).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingPlan.id);

          if (!updateErr) {
            for (const entry of newFlagEntries) {
              actions.push({
                action: "created",
                writing_number: wn,
                flag_type: entry.type as string,
                plan_id: existingPlan.id,
                reason: "Flag added to existing plan",
              });
            }
          }
        } else {
          // Create new plan with all flags
          const earliestDeadline = newFlagEntries
            .map((f: any) => new Date(f.deadline).getTime())
            .reduce((a, b) => Math.min(a, b), Infinity);

          const { data: newPlan, error: insertErr } = await supabase
            .from("coaching_plans")
            .insert({
              agency_id: roster.agency_id,
              roster_agent_id: roster.roster_id,
              flag_type: newFlagEntries.length === 1 ? newFlagEntries[0].type as string : null,
              stage: "flagged",
              deadline: new Date(earliestDeadline).toISOString(),
              flags: newFlagEntries,
              trigger_metric: newFlagEntries[0].trigger_metric as Record<string, unknown>,
              target_metric: newFlagEntries[0].target_metric as Record<string, unknown>,
            })
            .select("id")
            .single();

          if (insertErr) {
            if (insertErr.code === "23505") {
              actions.push({ action: "skipped", writing_number: wn, flag_type: newFlagEntries.map((f: any) => f.type).join(","), reason: "Concurrent insert" });
            } else {
              console.error(`Insert error for ${wn}:`, insertErr);
              actions.push({ action: "skipped", writing_number: wn, flag_type: newFlagEntries.map((f: any) => f.type).join(","), reason: insertErr.message });
            }
            continue;
          }

          if (newPlan) {
            await supabase.from("coaching_stage_history").insert({
              plan_id: newPlan.id,
              from_stage: null,
              to_stage: "flagged",
              note: `Auto-flagged: ${newFlagEntries.map((f: any) => f.type).join(" + ")}`,
            });

            for (const entry of newFlagEntries) {
              actions.push({
                action: "created",
                writing_number: wn,
                flag_type: entry.type as string,
                plan_id: newPlan.id,
              });
            }
          }
        }
      }

      // 9b. Auto-resolve individual flags that are no longer breaching
      // For plans at 'flagged' stage: if ALL flags are no longer breaching, auto-resolve the plan.
      // If only some flags resolved, mark those flags as resolved but keep the plan active.
      const reverseRoster = new Map<string, string>();
      for (const [wn, entry] of rosterMap) {
        reverseRoster.set(entry.roster_id, wn);
      }

      for (const [rosterId, plan] of activePlans) {
        if (plan.stage !== "flagged") continue;

        const wn = reverseRoster.get(rosterId);
        if (!wn) continue;

        const agentCurrentFlags = currentFlagTypes.get(wn) || new Set();
        let flagsChanged = false;
        let allResolved = true;

        const updatedFlags = plan.flags.map(f => {
          if (f.resolved) return f; // already resolved
          if (!agentCurrentFlags.has(f.type)) {
            // This flag type is no longer breaching — mark resolved
            flagsChanged = true;
            return { ...f, resolved: true };
          }
          allResolved = false;
          return f;
        });

        // Check if all flags are now resolved
        if (allResolved && updatedFlags.every(f => f.resolved)) {
          // Auto-resolve the entire plan
          const { error: resolveErr } = await supabase
            .from("coaching_plans")
            .update({
              stage: "resolved",
              flags: updatedFlags,
              resolved_at: new Date().toISOString(),
              resolution_type: "auto_resolved",
              resolution_note: "All flags cleared — auto-resolved by nightly scan",
            })
            .eq("id", plan.id);

          if (!resolveErr) {
            await supabase.from("coaching_stage_history").insert({
              plan_id: plan.id,
              from_stage: "flagged",
              to_stage: "resolved",
              note: "Auto-resolved: all flags cleared",
            });
            actions.push({ action: "auto_resolved", writing_number: wn, flag_type: "all", plan_id: plan.id });
          }
        } else if (flagsChanged) {
          // Some flags resolved but not all — update flags array + recalc deadline
          const activeDeadlines = updatedFlags
            .filter(f => !f.resolved)
            .map(f => new Date(f.deadline).getTime());
          const newDeadline = activeDeadlines.length > 0
            ? new Date(Math.min(...activeDeadlines)).toISOString()
            : plan.flags[0]?.deadline;

          await supabase
            .from("coaching_plans")
            .update({ flags: updatedFlags, deadline: newDeadline, updated_at: new Date().toISOString() })
            .eq("id", plan.id);

          const resolvedTypes = updatedFlags.filter(f => f.resolved).map(f => f.type);
          actions.push({
            action: "auto_resolved",
            writing_number: wn,
            flag_type: resolvedTypes.join(","),
            plan_id: plan.id,
            reason: `Partial: ${resolvedTypes.join(", ")} resolved, plan still active`,
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
    return jsonResponse({ error: "Internal server error" }, 500);
  } finally {
    if (sql) await sql.end();
  }
});
