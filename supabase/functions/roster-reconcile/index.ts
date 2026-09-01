/**
 * roster-reconcile — Compare agency_rosters against Max's production DB
 *
 * Detects agents who are:
 *   1. Active in roster but terminated in prod DB (cntrct_code = 'T')
 *   2. Active in roster but not found in prod DB at all (never wrote / wrong WN)
 *   3. Terminated in roster but still active in prod DB (possible reinstatement)
 *
 * Modes:
 *   GET  ?mode=dry-run           — report only, no changes (default)
 *   GET  ?mode=apply             — report + update roster statuses
 *   GET  ?agency_id=<uuid>       — limit to one agency
 *   GET  ?carrier=unl            — which carrier view to check (default: unl)
 *
 * Uses the termination tracking columns added in PR #399:
 *   termination_date, termination_reason, status_changed_at, status_changed_by
 *
 * Auth: service role (cross-DB reads + roster writes).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createProdConnection,
  CONTRACT_STATUS,
} from "../_shared/prod-db.ts";

// ── Lifecycle integration types ──────────────────────────────────────

interface LifecycleRecord {
  id: string;
  portal_agent_id: string;
  lifecycle_status: string;
  writing_number: string | null;
  first_name: string;
  last_name: string;
  is_producing: boolean;
  rts_confirmed: boolean;
  crm_active: boolean;
  app_access: boolean;
  checkin_active: boolean;
  offboarding_steps: Array<{
    key: string;
    label: string;
    auto: boolean;
    completed: boolean;
    completed_at: string | null;
  }> | null;
}

// Offboarding substeps — must match lifecycle-sync's definition
const OFFBOARDING_STEPS = [
  { key: "remove_ghl_crm", label: "Remove from GHL CRM", auto: false },
  { key: "revoke_app_access", label: "Revoke app access", auto: true },
  { key: "remove_daily_pulse", label: "Remove from Daily Pulse", auto: true },
  { key: "remove_agency_roster", label: "Remove from agency roster", auto: true },
  { key: "post_slack_notice", label: "Post Slack offboarding notice", auto: true },
  { key: "notify_agency_owner", label: "Notify agency owner", auto: false },
  { key: "archive_production", label: "Archive production data", auto: false },
];

// ── Helpers ──────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://www.agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

let _currentReq: Request | null = null;

function corsHeaders(): Record<string, string> {
  const origin = _currentReq?.headers?.get("Origin") || _currentReq?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

// Carrier → prod DB config (view, column names differ across carriers)
interface CarrierConfig {
  view: string;
  rosterColumn: string;       // column name in agency_rosters
  prodWnColumn: string;       // agent writing number column in prod view
  prodContractColumn: string; // contract status column in prod view
  prodTermDateColumn: string; // termination date column in prod view
  prodIssueDateColumn: string; // issue date column in prod view
}

const CARRIER_CONFIG: Record<string, CarrierConfig> = {
  unl: {
    view: "typed.unl_fym_policy_latest_load",
    rosterColumn: "unl_writing_number",
    prodWnColumn: "wa",
    prodContractColumn: "cntrct_code",
    prodTermDateColumn: "term_date",
    prodIssueDateColumn: "issue_date",
  },
  gtl: {
    view: "typed.gtl_fym_policy_latest_load",
    rosterColumn: "gtl_writing_number",
    prodWnColumn: "wa",
    prodContractColumn: "cntrct_code",
    prodTermDateColumn: "term_date",
    prodIssueDateColumn: "issue_date",
  },
  ahl: {
    view: "typed.ahl_fym_policy_latest_load",
    rosterColumn: "ahl_writing_number",
    prodWnColumn: "writing_agent_number",
    prodContractColumn: "contract_code",
    prodTermDateColumn: "contract_date",   // AHL uses contract_date for term
    prodIssueDateColumn: "issue_date",
  },
  manhattan: {
    view: "typed.manhattan_policy_latest_load",
    rosterColumn: "manhattan_writing_number",
    prodWnColumn: "writing_agent_1_number",
    prodContractColumn: "status",
    prodTermDateColumn: "status_last_change_date",
    prodIssueDateColumn: "issue_date",
  },
};

// ── Contract status helpers ──────────────────────────────────────────
// Carriers use different codes: UNL/GTL = T, AHL = T, Manhattan = text status
const TERMINATED_CODES = new Set(["T", "terminated", "Terminated", "TERMINATED"]);
const ACTIVE_CODES = new Set(["A", "P", "active", "Active", "ACTIVE", "pending", "Pending", "PENDING"]);

function isTerminatedCode(code: string): boolean {
  return TERMINATED_CODES.has(code);
}

function isActiveCode(code: string): boolean {
  return ACTIVE_CODES.has(code);
}

function statusPriority(code: string): number {
  if (isActiveCode(code)) {
    // A/active = 3, P/pending = 2
    const upper = code.toUpperCase();
    if (upper === "A" || upper === "ACTIVE") return 3;
    if (upper === "P" || upper === "PENDING") return 2;
    return 2;
  }
  if (code === "S" || code.toLowerCase() === "suspended") return 1;
  return 0; // terminated or unknown
}

/** Safely extract a carrier writing number from a roster entry */
function getWn(entry: RosterEntry, column: string): string | null {
  const val = entry[column as keyof RosterEntry];
  if (typeof val === "string") return val.trim() || null;
  return null;
}

// ── Types ────────────────────────────────────────────────────────────

interface RosterEntry {
  id: string;
  agency_id: string;
  first_name: string;
  last_name: string;
  status: string;
  unl_writing_number: string | null;
  gtl_writing_number: string | null;
  ahl_writing_number: string | null;
  manhattan_writing_number: string | null;
  agent_npn: string | null;
  termination_date: string | null;
  termination_reason: string | null;
}

interface ProdAgentRecord {
  writing_number: string;
  cntrct_code: string;
  term_date: string | null;
  latest_issue_date: string | null;
  policy_count: number;
}

interface ReconcileIssue {
  roster_id: string;
  agent_name: string;
  agency_id: string;
  writing_number: string;
  carrier: string;
  issue_type:
    | "roster_active_prod_terminated"
    | "roster_active_prod_missing"
    | "roster_terminated_prod_active";
  detail: string;
  prod_status: string | null;
  prod_term_date: string | null;
  action_taken: string | null;
  lifecycle_action: string | null;
}

// ── Lifecycle cascade helpers ────────────────────────────────────────

/**
 * Find lifecycle record by writing number (any carrier column).
 * Falls back to name+agency match if WN doesn't resolve.
 */
async function findLifecycleByWn(
  supabase: ReturnType<typeof createClient>,
  writingNumber: string,
  agencyId: string,
  agentName: string
): Promise<LifecycleRecord | null> {
  // Try by writing_number first
  const { data: byWn } = await supabase
    .from("agent_lifecycle")
    .select(
      "id, portal_agent_id, lifecycle_status, writing_number, first_name, last_name, is_producing, rts_confirmed, crm_active, app_access, checkin_active, offboarding_steps"
    )
    .eq("writing_number", writingNumber)
    .maybeSingle();

  if (byWn) return byWn as LifecycleRecord;

  // Fallback: name + agency match
  const [firstName, ...lastParts] = agentName.split(" ");
  const lastName = lastParts.join(" ");
  if (!firstName || !lastName) return null;

  const { data: byName } = await supabase
    .from("agent_lifecycle")
    .select(
      "id, portal_agent_id, lifecycle_status, writing_number, first_name, last_name, is_producing, rts_confirmed, crm_active, app_access, checkin_active, offboarding_steps"
    )
    .ilike("first_name", firstName)
    .ilike("last_name", lastName)
    .eq("agency_id", agencyId)
    .maybeSingle();

  return (byName as LifecycleRecord) || null;
}

/**
 * Cascade a roster termination into agent_lifecycle:
 * - Set lifecycle_status = 'terminated'
 * - Revoke app_access, disable Daily Pulse
 * - Initialize offboarding substeps
 * - Log the event
 */
async function cascadeTermination(
  supabase: ReturnType<typeof createClient>,
  lifecycle: LifecycleRecord,
  termDate: string | null,
  carrier: string,
  writingNumber: string
): Promise<string> {
  if (lifecycle.lifecycle_status === "terminated") {
    return "already_terminated";
  }

  const now = new Date().toISOString();
  const oldStatus = lifecycle.lifecycle_status;

  const offboardingInit = OFFBOARDING_STEPS.map((s) => ({
    ...s,
    completed: false,
    completed_at: null as string | null,
  }));

  const { error } = await supabase
    .from("agent_lifecycle")
    .update({
      lifecycle_status: "terminated",
      terminated_at: termDate || now,
      termination_reason: `roster_reconciliation:${carrier}`,
      app_access: false,
      checkin_active: false,
      offboarding_steps: offboardingInit,
      offboarding_complete: false,
      last_synced_at: now,
    })
    .eq("id", lifecycle.id);

  if (error) {
    return `error: ${error.message}`;
  }

  // Audit log
  await supabase.from("agent_lifecycle_log").insert({
    lifecycle_id: lifecycle.id,
    action: "status_change",
    old_status: oldStatus,
    new_status: "terminated",
    details: {
      source: "roster_reconciliation",
      carrier,
      writing_number: writingNumber,
      term_date: termDate,
    },
    performed_by: "system:roster-reconcile",
  });

  // Auto-complete the automated offboarding steps
  const autoCompleted = offboardingInit.map((s) =>
    s.auto ? { ...s, completed: true, completed_at: now } : s
  );
  const allComplete = autoCompleted.every((s) => s.completed);

  await supabase
    .from("agent_lifecycle")
    .update({
      offboarding_steps: autoCompleted,
      offboarding_complete: allComplete,
    })
    .eq("id", lifecycle.id);

  // Deactivate from Daily Pulse
  if (lifecycle.portal_agent_id) {
    await supabase
      .from("checkin_recipients")
      .update({ active: false })
      .eq("portal_agent_id", lifecycle.portal_agent_id);
  }

  // Log auto-offboarding
  await supabase.from("agent_lifecycle_log").insert({
    lifecycle_id: lifecycle.id,
    action: "auto_offboarding",
    old_status: "terminated",
    new_status: "terminated",
    details: {
      source: "roster_reconciliation",
      agent_name: `${lifecycle.first_name} ${lifecycle.last_name}`,
      auto_steps_completed: OFFBOARDING_STEPS.filter((s) => s.auto).map(
        (s) => s.key
      ),
    },
    performed_by: "system:roster-reconcile",
  });

  return "terminated";
}

/**
 * Handle reinstatement: a roster-terminated agent is still active in prod.
 * Flags for review — does NOT auto-reactivate (requires human decision).
 * Logs the detection so it shows up in the lifecycle audit trail.
 */
async function flagReinstatement(
  supabase: ReturnType<typeof createClient>,
  lifecycle: LifecycleRecord,
  carrier: string,
  writingNumber: string,
  prodStatus: string
): Promise<string> {
  // Don't flag if already non-terminated
  if (lifecycle.lifecycle_status !== "terminated") {
    return "not_terminated";
  }

  // Log the reinstatement signal for human review
  await supabase.from("agent_lifecycle_log").insert({
    lifecycle_id: lifecycle.id,
    action: "reinstatement_detected",
    old_status: "terminated",
    new_status: null, // No auto-change — human review required
    details: {
      source: "roster_reconciliation",
      carrier,
      writing_number: writingNumber,
      prod_status: prodStatus,
      note: "Agent terminated in roster but active in prod DB. Requires human review for reinstatement.",
    },
    performed_by: "system:roster-reconcile",
  });

  return "reinstatement_flagged";
}

// ── Main ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  _currentReq = req;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const started = performance.now();
  let prodDb: ReturnType<typeof createProdConnection> | null = null;

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "dry-run";
    const agencyFilter = url.searchParams.get("agency_id");
    const carrier = (url.searchParams.get("carrier") || "unl").toLowerCase();
    const persist = url.searchParams.get("persist") === "true";
    const triggeredBy = url.searchParams.get("triggered_by") || "api";

    // Validate carrier
    const cfg = CARRIER_CONFIG[carrier];
    if (!cfg) {
      return jsonResponse(
        {
          error: `Unknown carrier: ${carrier}. Valid: ${Object.keys(CARRIER_CONFIG).join(", ")}`,
        },
        400
      );
    }

    const wnColumn = cfg.rosterColumn;

    // Connect to FYM App DB
    const appUrl =
      Deno.env.get("APP_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const appKey =
      Deno.env.get("APP_SUPABASE_SERVICE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    if (!appUrl || !appKey) {
      return jsonResponse(
        { error: "App Supabase credentials not configured" },
        500
      );
    }

    const supabase = createClient(appUrl, appKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Load all roster entries ──

    const PAGE_SIZE = 500;
    let allRoster: RosterEntry[] = [];
    let offset = 0;

    while (true) {
      let query = supabase
        .from("agency_rosters")
        .select(
          "id, agency_id, first_name, last_name, status, unl_writing_number, gtl_writing_number, ahl_writing_number, manhattan_writing_number, agent_npn, termination_date, termination_reason"
        )
        .range(offset, offset + PAGE_SIZE - 1);

      if (agencyFilter) {
        query = query.eq("agency_id", agencyFilter);
      }

      const { data, error } = await query;

      if (error) {
        return jsonResponse(
          { error: "Failed to load roster" },
          500
        );
      }

      allRoster = allRoster.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Split into active and terminated roster entries
    const activeRoster = allRoster.filter((r) => r.status === "active");
    const terminatedRoster = allRoster.filter((r) => r.status === "terminated");

    // Collect all writing numbers for the target carrier
    const activeWns = new Set<string>();
    const terminatedWns = new Set<string>();

    for (const entry of activeRoster) {
      const wn = getWn(entry, wnColumn);
      if (wn) activeWns.add(wn);
    }

    for (const entry of terminatedRoster) {
      const wn = getWn(entry, wnColumn);
      if (wn) terminatedWns.add(wn);
    }

    const allWns = new Set([...activeWns, ...terminatedWns]);

    if (allWns.size === 0) {
      return jsonResponse({
        success: true,
        mode,
        carrier,
        message: `No roster entries with ${carrier} writing numbers found`,
        roster_total: allRoster.length,
        active: activeRoster.length,
        terminated: terminatedRoster.length,
        issues: [],
        elapsed_ms: Math.round(performance.now() - started),
      });
    }

    // ── 2. Query prod DB for contract status of all roster agents ──

    prodDb = createProdConnection();

    const BATCH_SIZE = 200;
    const prodMap = new Map<string, ProdAgentRecord>();
    const allWnArray = [...allWns];

    for (let i = 0; i < allWnArray.length; i += BATCH_SIZE) {
      const batch = allWnArray.slice(i, i + BATCH_SIZE);

      // Column names differ per carrier — build SQL with carrier-specific columns
      const rows = await prodDb.unsafe(`
        SELECT
          TRIM(${cfg.prodWnColumn}) AS writing_number,
          ${cfg.prodContractColumn} AS cntrct_code,
          MAX(${cfg.prodTermDateColumn})::text AS term_date,
          MAX(${cfg.prodIssueDateColumn})::text AS latest_issue_date,
          COUNT(*) AS policy_count
        FROM ${cfg.view}
        WHERE TRIM(${cfg.prodWnColumn}) = ANY($1)
        GROUP BY TRIM(${cfg.prodWnColumn}), ${cfg.prodContractColumn}
      `, [batch]);

      for (const row of rows) {
        const wn = row.writing_number;
        const existing = prodMap.get(wn);

        // Keep the "most significant" contract code per agent:
        // A (active) > P (pending) > T (terminated)
        if (
          !existing ||
          statusPriority(row.cntrct_code) >
            statusPriority(existing.cntrct_code)
        ) {
          prodMap.set(wn, {
            writing_number: wn,
            cntrct_code: row.cntrct_code,
            term_date: row.term_date,
            latest_issue_date: row.latest_issue_date,
            policy_count: Number(row.policy_count),
          });
        }
      }
    }

    // ── 3. Cross-reference: detect issues ──

    const issues: ReconcileIssue[] = [];

    // Check active roster agents against prod
    for (const entry of activeRoster) {
      const wn = getWn(entry, wnColumn);
      if (!wn) continue;

      const prod = prodMap.get(wn);
      const agentName = `${entry.first_name} ${entry.last_name}`.trim();

      if (!prod) {
        // Active in roster, not found in prod DB
        issues.push({
          roster_id: entry.id,
          agent_name: agentName,
          agency_id: entry.agency_id,
          writing_number: wn,
          carrier,
          issue_type: "roster_active_prod_missing",
          detail: `Agent ${agentName} (${wn}) is active in roster but has no policies in ${carrier.toUpperCase()} prod DB`,
          prod_status: null,
          prod_term_date: null,
          action_taken: null,
          lifecycle_action: null,
        });
      } else if (isTerminatedCode(prod.cntrct_code)) {
        // Active in roster, terminated in prod
        issues.push({
          roster_id: entry.id,
          agent_name: agentName,
          agency_id: entry.agency_id,
          writing_number: wn,
          carrier,
          issue_type: "roster_active_prod_terminated",
          detail: `Agent ${agentName} (${wn}) is active in roster but ALL ${prod.policy_count} policies are terminated in ${carrier.toUpperCase()} (term_date: ${prod.term_date || "unknown"})`,
          prod_status: CONTRACT_STATUS[prod.cntrct_code] || prod.cntrct_code,
          prod_term_date: prod.term_date,
          action_taken: null,
          lifecycle_action: null,
        });
      }
    }

    // Check terminated roster agents against prod (possible reinstatement)
    for (const entry of terminatedRoster) {
      const wn = getWn(entry, wnColumn);
      if (!wn) continue;

      const prod = prodMap.get(wn);
      const agentName = `${entry.first_name} ${entry.last_name}`.trim();

      if (prod && isActiveCode(prod.cntrct_code)) {
        // Terminated in roster but active/pending in prod
        issues.push({
          roster_id: entry.id,
          agent_name: agentName,
          agency_id: entry.agency_id,
          writing_number: wn,
          carrier,
          issue_type: "roster_terminated_prod_active",
          detail: `Agent ${agentName} (${wn}) is terminated in roster but has ${prod.policy_count} ${CONTRACT_STATUS[prod.cntrct_code] || prod.cntrct_code} policies in ${carrier.toUpperCase()}`,
          prod_status: CONTRACT_STATUS[prod.cntrct_code] || prod.cntrct_code,
          prod_term_date: null,
          action_taken: null,
          lifecycle_action: null,
        });
      }
    }

    // ── 4. Apply changes (if mode=apply) ──

    let applied = 0;
    let lifecycleCascades = 0;
    let reinstatementFlags = 0;
    const applyErrors: string[] = [];

    if (mode === "apply") {
      const now = new Date().toISOString();

      for (const issue of issues) {
        if (issue.issue_type === "roster_active_prod_terminated") {
          // Mark as terminated in roster
          const { error } = await supabase
            .from("agency_rosters")
            .update({
              status: "terminated",
              termination_date: issue.prod_term_date || now.split("T")[0],
              termination_reason: "roster_reconciliation",
              status_changed_at: now,
              status_changed_by: "system:roster-reconcile",
            })
            .eq("id", issue.roster_id);

          if (error) {
            applyErrors.push(
              `Failed to terminate ${issue.agent_name}: ${error.message}`
            );
            issue.action_taken = `error: ${error.message}`;
          } else {
            applied++;
            issue.action_taken = "terminated";

            // ── Lifecycle cascade: terminate in agent_lifecycle ──
            try {
              const lifecycle = await findLifecycleByWn(
                supabase,
                issue.writing_number,
                issue.agency_id,
                issue.agent_name
              );
              if (lifecycle) {
                const result = await cascadeTermination(
                  supabase,
                  lifecycle,
                  issue.prod_term_date,
                  issue.carrier,
                  issue.writing_number
                );
                issue.lifecycle_action = result;
                if (result === "terminated") lifecycleCascades++;
              } else {
                issue.lifecycle_action = "no_lifecycle_record";
              }
            } catch (err) {
              issue.lifecycle_action = `error: ${(err as Error).message}`;
              applyErrors.push(
                `Lifecycle cascade failed for ${issue.agent_name}: ${(err as Error).message}`
              );
            }
          }
        } else if (issue.issue_type === "roster_terminated_prod_active") {
          // ── Lifecycle: flag reinstatement for human review ──
          try {
            const lifecycle = await findLifecycleByWn(
              supabase,
              issue.writing_number,
              issue.agency_id,
              issue.agent_name
            );
            if (lifecycle) {
              const result = await flagReinstatement(
                supabase,
                lifecycle,
                issue.carrier,
                issue.writing_number,
                issue.prod_status || "active"
              );
              issue.lifecycle_action = result;
              if (result === "reinstatement_flagged") reinstatementFlags++;
            } else {
              issue.lifecycle_action = "no_lifecycle_record";
            }
          } catch (err) {
            issue.lifecycle_action = `error: ${(err as Error).message}`;
          }
        }
        // roster_active_prod_missing: flagged for human review only — no lifecycle action
      }
    }

    // ── 5. Build response ──

    const elapsed = Math.round(performance.now() - started);

    // Aggregate by agency for the summary
    const agencySummary = new Map<
      string,
      { active: number; terminated: number; issues: number }
    >();
    for (const entry of allRoster) {
      const agg = agencySummary.get(entry.agency_id) || {
        active: 0,
        terminated: 0,
        issues: 0,
      };
      if (entry.status === "active") agg.active++;
      else if (entry.status === "terminated") agg.terminated++;
      agencySummary.set(entry.agency_id, agg);
    }
    for (const issue of issues) {
      const agg = agencySummary.get(issue.agency_id);
      if (agg) agg.issues++;
    }

    const responseData = {
      success: true,
      mode,
      carrier,
      roster_total: allRoster.length,
      roster_active: activeRoster.length,
      roster_terminated: terminatedRoster.length,
      writing_numbers_checked: allWns.size,
      prod_agents_found: prodMap.size,
      issues_found: issues.length,
      issues_by_type: {
        roster_active_prod_terminated: issues.filter(
          (i) => i.issue_type === "roster_active_prod_terminated"
        ).length,
        roster_active_prod_missing: issues.filter(
          (i) => i.issue_type === "roster_active_prod_missing"
        ).length,
        roster_terminated_prod_active: issues.filter(
          (i) => i.issue_type === "roster_terminated_prod_active"
        ).length,
      },
      applied: mode === "apply" ? applied : undefined,
      lifecycle_cascades: mode === "apply" ? lifecycleCascades : undefined,
      reinstatement_flags: mode === "apply" ? reinstatementFlags : undefined,
      apply_errors:
        mode === "apply" && applyErrors.length > 0
          ? applyErrors
          : undefined,
      agency_summary: Object.fromEntries(agencySummary),
      issues,
      elapsed_ms: elapsed,
    };

    // ── Persist run to roster_reconcile_runs if requested ──
    if (persist) {
      try {
        await supabase.from("roster_reconcile_runs").insert({
          carrier,
          mode,
          agency_id: agencyFilter || null,
          roster_total: allRoster.length,
          roster_active: activeRoster.length,
          roster_terminated: terminatedRoster.length,
          writing_numbers_checked: allWns.size,
          prod_agents_found: prodMap.size,
          issues_found: issues.length,
          active_prod_terminated: responseData.issues_by_type.roster_active_prod_terminated,
          active_prod_missing: responseData.issues_by_type.roster_active_prod_missing,
          terminated_prod_active: responseData.issues_by_type.roster_terminated_prod_active,
          applied: mode === "apply" ? applied : null,
          lifecycle_cascades: mode === "apply" ? lifecycleCascades : null,
          reinstatement_flags: mode === "apply" ? reinstatementFlags : null,
          issues: issues,
          errors: applyErrors.length > 0 ? applyErrors : null,
          elapsed_ms: elapsed,
          triggered_by: triggeredBy,
          completed_at: new Date().toISOString(),
        });
      } catch (persistErr) {
        console.error("[roster-reconcile] Failed to persist run:", (persistErr as Error).message);
      }
    }

    return jsonResponse(responseData);
  } catch (err) {
    return jsonResponse(
      { error: "Internal server error" },
      500
    );
  } finally {
    if (prodDb) {
      await prodDb.end();
    }
  }
});
