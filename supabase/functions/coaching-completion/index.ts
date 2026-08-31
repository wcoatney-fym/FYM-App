/**
 * coaching-completion — Auto-complete coaching requirements from training data
 *
 * Bridges the portal DB (akhojh — agent_live_attendance, agent_live_sessions)
 * with FYM App DB (rcbzag — coaching_requirements, coaching_plans) to:
 *
 * 1. Auto-increment `completed_count` on `live_attendance` requirements
 *    when matching attendance records exist in the portal
 * 2. Auto-mark requirements as `is_completed` when count threshold is met
 * 3. Auto-advance coaching plans from `in_progress` → `review` when ALL
 *    requirements on that plan are complete
 *
 * Designed to run:
 *   - After coaching-trigger (nightly), or
 *   - On-demand via POST (e.g. after a live training session ends)
 *
 * Query params:
 *   plan_id=XX   — restrict to a single coaching plan (optional)
 *   dry_run=true — preview changes without writing (optional)
 */

import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsResponse, jsonResponse } from "../_shared/prod-db.ts";

interface CompletionAction {
  action: "incremented" | "completed" | "advanced" | "skipped";
  requirement_id?: string;
  plan_id: string;
  detail: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const planFilter = url.searchParams.get("plan_id");

  try {
    // ── 1. Connect to FYM App Supabase (rcbzag) ──────────────────────
    const appUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const appKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!appUrl || !appKey) {
      return jsonResponse({ error: "Missing APP_SUPABASE_URL or APP_SUPABASE_SERVICE_KEY" }, 500);
    }
    const appDb = createClient(appUrl, appKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 2. Connect to Portal Supabase (akhojh) ───────────────────────
    const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL") || "";
    const portalKey = Deno.env.get("PORTAL_SUPABASE_SERVICE_KEY") || "";
    if (!portalUrl || !portalKey) {
      return jsonResponse({ error: "Missing PORTAL_SUPABASE_URL or PORTAL_SUPABASE_SERVICE_KEY" }, 500);
    }
    const portalDb = createClient(portalUrl, portalKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 3. Load active coaching plans with live_attendance requirements ─
    const PAGE_SIZE = 500;
    const activePlans: Array<{
      plan_id: string;
      plan_stage: string;
      roster_agent_id: string;
      agency_id: string;
    }> = [];

    {
      let offset = 0;
      while (true) {
        let query = appDb
          .from("coaching_plans")
          .select("id, stage, roster_agent_id, agency_id")
          .in("stage", ["action_plan", "in_progress"])
          .range(offset, offset + PAGE_SIZE - 1);

        if (planFilter) {
          query = query.eq("id", planFilter);
        }

        const { data, error } = await query;
        if (error) {
          console.error("Plans load error:", error);
          break;
        }

        for (const p of data || []) {
          activePlans.push({
            plan_id: p.id,
            plan_stage: p.stage,
            roster_agent_id: p.roster_agent_id,
            agency_id: p.agency_id,
          });
        }

        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    if (activePlans.length === 0) {
      return jsonResponse({
        dry_run: dryRun,
        message: "No active coaching plans with actionable stages",
        plans_checked: 0,
        actions: [],
        elapsed_ms: Math.round(performance.now() - started),
      });
    }

    // ── 4. Load all incomplete requirements for these plans ───────────
    const planIds = activePlans.map(p => p.plan_id);
    interface ReqRow {
      id: string;
      plan_id: string;
      requirement_type: string;
      is_completed: boolean;
      completed_count: number;
      required_count: number | null;
      training_content_id: string | null;
    }
    const allRequirements: ReqRow[] = [];

    {
      let offset = 0;
      while (true) {
        const { data, error } = await appDb
          .from("coaching_requirements")
          .select("id, plan_id, requirement_type, is_completed, completed_count, required_count, training_content_id")
          .in("plan_id", planIds)
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error("Requirements load error:", error);
          break;
        }

        for (const r of data || []) {
          allRequirements.push(r as ReqRow);
        }

        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    // ── 5. Build roster agent → portal agent mapping ─────────────────
    //    agency_rosters has agent_id (portal FK) + unl_writing_number
    const rosterAgentIds = [...new Set(activePlans.map(p => p.roster_agent_id))];
    const rosterToPortalAgent = new Map<string, string>();

    {
      let offset = 0;
      while (true) {
        const { data, error } = await appDb
          .from("agency_rosters")
          .select("id, agent_id")
          .in("id", rosterAgentIds)
          .not("agent_id", "is", null)
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error("Roster mapping error:", error);
          break;
        }

        for (const r of data || []) {
          if (r.agent_id) {
            rosterToPortalAgent.set(r.id, r.agent_id);
          }
        }

        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    // ── 6. Load portal attendance for mapped agents ──────────────────
    const portalAgentIds = [...new Set(rosterToPortalAgent.values())];
    const attendanceByAgent = new Map<string, number>(); // portal_agent_id → total attendance count

    if (portalAgentIds.length > 0) {
      let offset = 0;
      while (true) {
        const { data, error } = await portalDb
          .from("agent_live_attendance")
          .select("agent_id")
          .in("agent_id", portalAgentIds)
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error("Portal attendance load error:", error);
          break;
        }

        for (const a of data || []) {
          const count = attendanceByAgent.get(a.agent_id) || 0;
          attendanceByAgent.set(a.agent_id, count + 1);
        }

        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    // ── 7. Process: update requirements + check plan completion ──────
    const actions: CompletionAction[] = [];

    // Group requirements by plan
    const reqsByPlan = new Map<string, ReqRow[]>();
    for (const req of allRequirements) {
      const list = reqsByPlan.get(req.plan_id) || [];
      list.push(req);
      reqsByPlan.set(req.plan_id, list);
    }

    for (const plan of activePlans) {
      const reqs = reqsByPlan.get(plan.plan_id) || [];
      if (reqs.length === 0) continue;

      const portalAgentId = rosterToPortalAgent.get(plan.roster_agent_id);

      // 7a. Update live_attendance requirements from portal data
      for (const req of reqs) {
        if (req.requirement_type !== "live_attendance") continue;
        if (req.is_completed) continue;
        if (!req.required_count) continue;
        if (!portalAgentId) {
          actions.push({
            action: "skipped",
            requirement_id: req.id,
            plan_id: plan.plan_id,
            detail: "No portal agent mapping for roster agent",
          });
          continue;
        }

        const totalAttendance = attendanceByAgent.get(portalAgentId) || 0;

        // Only update if portal count exceeds current completed_count
        if (totalAttendance <= req.completed_count) {
          actions.push({
            action: "skipped",
            requirement_id: req.id,
            plan_id: plan.plan_id,
            detail: `Portal attendance (${totalAttendance}) ≤ current count (${req.completed_count})`,
          });
          continue;
        }

        const newCount = Math.min(totalAttendance, req.required_count);
        const isNowComplete = newCount >= req.required_count;

        if (!dryRun) {
          const updates: Record<string, unknown> = {
            completed_count: newCount,
          };
          if (isNowComplete) {
            updates.is_completed = true;
            updates.completed_at = new Date().toISOString();
            updates.completed_by = null; // system-completed
          }

          await appDb
            .from("coaching_requirements")
            .update(updates)
            .eq("id", req.id);
        }

        // Mark the in-memory req as updated for plan-level check
        req.completed_count = newCount;
        if (isNowComplete) req.is_completed = true;

        actions.push({
          action: isNowComplete ? "completed" : "incremented",
          requirement_id: req.id,
          plan_id: plan.plan_id,
          detail: isNowComplete
            ? `Attendance ${newCount}/${req.required_count} — auto-completed`
            : `Attendance updated: ${req.completed_count} → ${newCount}/${req.required_count}`,
        });
      }

      // 7b. Check if ALL requirements on this plan are now complete
      const allComplete = reqs.length > 0 && reqs.every(r => r.is_completed);

      if (allComplete && plan.plan_stage === "in_progress") {
        if (!dryRun) {
          // Advance plan to review
          await appDb
            .from("coaching_plans")
            .update({ stage: "review" })
            .eq("id", plan.plan_id);

          // Record stage history
          await appDb.from("coaching_stage_history").insert({
            plan_id: plan.plan_id,
            from_stage: "in_progress",
            to_stage: "review",
            note: "Auto-advanced: all requirements completed",
          });
        }

        actions.push({
          action: "advanced",
          plan_id: plan.plan_id,
          detail: `All ${reqs.length} requirements complete — auto-advanced to review`,
        });
      }
    }

    // ── 8. Summary ────────────────────────────────────────────────────
    const elapsed = Math.round(performance.now() - started);

    return jsonResponse({
      dry_run: dryRun,
      plans_checked: activePlans.length,
      requirements_checked: allRequirements.filter(r => r.requirement_type === "live_attendance" && !r.is_completed).length,
      roster_to_portal_mappings: rosterToPortalAgent.size,
      portal_agents_with_attendance: attendanceByAgent.size,
      actions_summary: {
        incremented: actions.filter(a => a.action === "incremented").length,
        completed: actions.filter(a => a.action === "completed").length,
        advanced: actions.filter(a => a.action === "advanced").length,
        skipped: actions.filter(a => a.action === "skipped").length,
      },
      actions,
      elapsed_ms: elapsed,
    });
  } catch (err: unknown) {
    console.error("coaching-completion error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
