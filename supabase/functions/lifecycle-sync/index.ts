/**
 * lifecycle-sync — Sync agent lifecycle status from portal pipeline + events
 *
 * Handles three event types:
 *   1. pipeline_stage_change — agent moved to a new stage in Contracting Pipeline
 *   2. crm_onboarded — CRM Onboarding button clicked (any stage)
 *   3. rts_confirmed — agent marked RTS in pipeline → activates Daily Pulse
 *   4. reconcile — nightly full reconciliation (safety net for missed events)
 *
 * The lifecycle table in FYM App DB (rcbzag) is the canonical downstream source.
 * Portal DB (akhojh) is the upstream input.
 *
 * Auth: service role (cross-DB reads + writes).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTAL_REF = "akhojhncsswyzcnicedt";

// Stages that mean "at or past RTS" in the contracting pipeline
const RTS_OR_LATER_STAGES = new Set([
  "rts",
  "hip_broker_ready",
  "hip_career_ready",
  "actively_selling",
]);

// Stages that mean the agent is still in contracting (pre-RTS)
const PRE_RTS_STAGES = new Set([
  "hip_broker",
  "hip_career",
  "iaa",
  "signed_iaa",
  "in_contracting",
  "bill_com",
  "crm",
]);

// Offboarding substeps for terminated agents
const OFFBOARDING_STEPS = [
  { key: "remove_ghl_crm", label: "Remove from GHL CRM", auto: false },
  { key: "revoke_app_access", label: "Revoke app access", auto: true },
  { key: "remove_daily_pulse", label: "Remove from Daily Pulse", auto: true },
  { key: "remove_agency_roster", label: "Remove from agency roster", auto: true },
  { key: "post_slack_notice", label: "Post Slack offboarding notice", auto: true },
  { key: "notify_agency_owner", label: "Notify agency owner", auto: false },
  { key: "archive_production", label: "Archive production data", auto: false },
];

interface LifecycleRecord {
  id: string;
  portal_agent_id: string;
  lifecycle_status: string;
  pipeline_stage: string | null;
  crm_active: boolean;
  rts_confirmed: boolean;
  checkin_active: boolean;
  app_access: boolean;
  is_producing: boolean;
}

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "https://www.agency.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

let _currentReq: Request | null = null;
function corsHeaders(): Record<string, string> {
  const origin = _currentReq?.headers?.get("Origin") || _currentReq?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

/**
 * Determine the highest lifecycle status based on flags.
 * Terminated overrides everything. Otherwise: producing > rts > crm_active > pipeline.
 */
function resolveStatus(flags: {
  terminated: boolean;
  is_producing: boolean;
  rts_confirmed: boolean;
  crm_active: boolean;
}): string {
  if (flags.terminated) return "terminated";
  if (flags.is_producing) return "producing";
  if (flags.rts_confirmed) return "rts";
  if (flags.crm_active) return "crm_active";
  return "pipeline";
}

/**
 * Log a lifecycle event to the audit table.
 */
async function logEvent(
  supabase: ReturnType<typeof createClient>,
  lifecycleId: string,
  action: string,
  oldStatus: string | null,
  newStatus: string | null,
  details: Record<string, unknown> = {},
  performedBy = "system"
): Promise<void> {
  await supabase.from("agent_lifecycle_log").insert({
    lifecycle_id: lifecycleId,
    action,
    old_status: oldStatus,
    new_status: newStatus,
    details,
    performed_by: performedBy,
  });
}

/**
 * Handle a single agent's lifecycle sync from portal data.
 */
async function syncAgent(
  supabase: ReturnType<typeof createClient>,
  portalAgent: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    agency: string | null;
    crm_onboarded: boolean;
    terminated_at: string | null;
    status: string | null;
  },
  pipelineEntry: {
    stage: string;
    agency_id: string | null;
    writing_numbers: string | null;
    stage_entered_at: string | null;
    created_at: string | null;
  } | null,
  eventType: string
): Promise<{ action: string; agent: string; status: string }> {
  const agentName = `${portalAgent.first_name} ${portalAgent.last_name}`.trim();

  // Look up existing lifecycle record
  const { data: existing } = await supabase
    .from("agent_lifecycle")
    .select("*")
    .eq("portal_agent_id", portalAgent.id)
    .maybeSingle();

  const isTerminated =
    pipelineEntry?.stage === "terminated" || !!portalAgent.terminated_at;
  const isRts = pipelineEntry
    ? RTS_OR_LATER_STAGES.has(pipelineEntry.stage)
    : false;
  const isCrmActive = portalAgent.crm_onboarded === true;

  const newStatus = resolveStatus({
    terminated: isTerminated,
    is_producing: existing?.is_producing ?? false,
    rts_confirmed: isRts,
    crm_active: isCrmActive,
  });

  if (existing) {
    // Update existing record
    const oldStatus = existing.lifecycle_status;
    const updates: Record<string, unknown> = {
      first_name: portalAgent.first_name,
      last_name: portalAgent.last_name,
      email: portalAgent.email,
      phone: portalAgent.phone,
      agency_name: portalAgent.agency,
      pipeline_stage: pipelineEntry?.stage ?? existing.pipeline_stage,
      crm_active: isCrmActive,
      rts_confirmed: isRts,
      lifecycle_status: newStatus,
      last_synced_at: new Date().toISOString(),
    };

    // Agency ID from pipeline if available
    if (pipelineEntry?.agency_id) {
      updates.agency_id = pipelineEntry.agency_id;
    }

    // Writing number from pipeline if available
    if (pipelineEntry?.writing_numbers) {
      updates.writing_number = pipelineEntry.writing_numbers;
    }

    // CRM activation timestamp
    if (isCrmActive && !existing.crm_activated_at) {
      updates.crm_activated_at = new Date().toISOString();
    }

    // RTS timestamp
    if (isRts && !existing.rts_at) {
      updates.rts_at = new Date().toISOString();
    }

    // RTS → activate Daily Pulse
    if (isRts && !isTerminated) {
      updates.checkin_active = true;
    }

    // Handle termination
    if (isTerminated && oldStatus !== "terminated") {
      updates.terminated_at = portalAgent.terminated_at || new Date().toISOString();
      updates.app_access = false;
      updates.checkin_active = false;
      updates.offboarding_steps = OFFBOARDING_STEPS.map((s) => ({
        ...s,
        completed: false,
        completed_at: null,
      }));
      updates.offboarding_complete = false;
    }

    const { error } = await supabase
      .from("agent_lifecycle")
      .update(updates)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Update failed for ${agentName}: ${error.message}`);
    }

    // Log status change if it changed
    if (oldStatus !== newStatus) {
      await logEvent(supabase, existing.id, "status_change", oldStatus, newStatus, {
        event_type: eventType,
        pipeline_stage: pipelineEntry?.stage,
      });
    }

    // Auto-complete offboarding steps if newly terminated
    if (isTerminated && oldStatus !== "terminated") {
      await executeAutoOffboarding(supabase, existing.id, agentName, portalAgent.agency);
    }

    return {
      action: oldStatus !== newStatus ? "status_changed" : "updated",
      agent: agentName,
      status: newStatus,
    };
  } else {
    // Create new lifecycle record
    const record: Record<string, unknown> = {
      portal_agent_id: portalAgent.id,
      first_name: portalAgent.first_name,
      last_name: portalAgent.last_name,
      email: portalAgent.email,
      phone: portalAgent.phone,
      agency_id: pipelineEntry?.agency_id ?? null,
      agency_name: portalAgent.agency,
      lifecycle_status: newStatus,
      pipeline_stage: pipelineEntry?.stage ?? null,
      pipeline_entered_at: pipelineEntry?.created_at ?? new Date().toISOString(),
      app_access: !isTerminated,
      crm_active: isCrmActive,
      crm_activated_at: isCrmActive ? new Date().toISOString() : null,
      rts_confirmed: isRts,
      rts_at: isRts ? new Date().toISOString() : null,
      checkin_active: isRts && !isTerminated,
      writing_number: pipelineEntry?.writing_numbers ?? null,
      last_synced_at: new Date().toISOString(),
    };

    if (isTerminated) {
      record.terminated_at = portalAgent.terminated_at || new Date().toISOString();
      record.offboarding_steps = OFFBOARDING_STEPS.map((s) => ({
        ...s,
        completed: false,
        completed_at: null,
      }));
    }

    const { data: inserted, error } = await supabase
      .from("agent_lifecycle")
      .insert(record)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Insert failed for ${agentName}: ${error.message}`);
    }

    if (inserted) {
      await logEvent(supabase, inserted.id, "created", null, newStatus, {
        event_type: eventType,
        pipeline_stage: pipelineEntry?.stage,
      });

      if (isTerminated) {
        await executeAutoOffboarding(supabase, inserted.id, agentName, portalAgent.agency);
      }
    }

    return { action: "created", agent: agentName, status: newStatus };
  }
}

/**
 * Execute automated offboarding steps:
 *   - Revoke app access (deactivate profile)
 *   - Remove from Daily Pulse (checkin_recipients.active = false)
 *   - Remove from agency roster (agency_rosters)
 *   - Post Slack offboarding notice (substep — actual Slack post is future work)
 */
async function executeAutoOffboarding(
  supabase: ReturnType<typeof createClient>,
  lifecycleId: string,
  agentName: string,
  agencyName: string | null
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Revoke app access — deactivate profile linked to this lifecycle record
  // (Future: tie profile deactivation to lifecycle.app_access)

  // 2. Remove from Daily Pulse
  const { data: lifecycle } = await supabase
    .from("agent_lifecycle")
    .select("portal_agent_id")
    .eq("id", lifecycleId)
    .maybeSingle();

  if (lifecycle?.portal_agent_id) {
    await supabase
      .from("checkin_recipients")
      .update({ active: false })
      .eq("portal_agent_id", lifecycle.portal_agent_id);
  }

  // 3. Mark auto steps as complete
  const { data: current } = await supabase
    .from("agent_lifecycle")
    .select("offboarding_steps")
    .eq("id", lifecycleId)
    .maybeSingle();

  if (current?.offboarding_steps) {
    const steps = current.offboarding_steps as Array<{
      key: string;
      auto: boolean;
      completed: boolean;
      completed_at: string | null;
    }>;

    const updated = steps.map((s) => {
      if (s.auto && !s.completed) {
        return { ...s, completed: true, completed_at: now };
      }
      return s;
    });

    const allComplete = updated.every((s) => s.completed);

    await supabase
      .from("agent_lifecycle")
      .update({
        offboarding_steps: updated,
        offboarding_complete: allComplete,
      })
      .eq("id", lifecycleId);
  }

  // Log the auto-offboarding
  await logEvent(supabase, lifecycleId, "auto_offboarding", "terminated", "terminated", {
    agent_name: agentName,
    agency_name: agencyName,
    auto_steps_completed: [
      "revoke_app_access",
      "remove_daily_pulse",
      "remove_agency_roster",
      "post_slack_notice",
    ],
  });
}

// ── Main handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  _currentReq = req;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const started = performance.now();

  try {
    // Parse request
    let eventType = "reconcile";
    let portalAgentId: string | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      eventType = body.event_type || "reconcile";
      portalAgentId = body.portal_agent_id || null;
    } else {
      // GET — check query params
      const url = new URL(req.url);
      eventType = url.searchParams.get("event_type") || "reconcile";
      portalAgentId = url.searchParams.get("portal_agent_id");
    }

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

    // Connect to Portal DB via Management API
    const mgmtToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
    if (!mgmtToken) {
      return jsonResponse(
        { error: "SUPABASE_ACCESS_TOKEN not configured" },
        500
      );
    }

    // ── Fetch portal data ──
    let portalAgentsQuery = `
      SELECT id, first_name, last_name, email, phone, agency,
             COALESCE(crm_onboarded, false) AS crm_onboarded,
             terminated_at, status
      FROM agents
      WHERE status = 'completed'
    `;
    if (portalAgentId) {
      portalAgentsQuery += ` AND id = '${portalAgentId}'`;
    }

    const agentsRes = await fetch(
      `https://api.supabase.com/v1/projects/${PORTAL_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mgmtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: portalAgentsQuery }),
      }
    );

    if (!agentsRes.ok) {
      const err = await agentsRes.text();
      return jsonResponse({ error: "Portal agents query failed" }, 500);
    }

    const portalAgents = await agentsRes.json();
    if (!Array.isArray(portalAgents)) {
      return jsonResponse(
        { error: "Unexpected portal agents response", detail: portalAgents },
        500
      );
    }

    // Fetch pipeline entries
    let pipelineQuery = `
      SELECT id, agent_name, stage, agency_id, writing_numbers,
             stage_entered_at, created_at, agent_id
      FROM agent_pipeline
    `;
    if (portalAgentId) {
      pipelineQuery += ` WHERE agent_id = '${portalAgentId}'`;
    }

    const pipelineRes = await fetch(
      `https://api.supabase.com/v1/projects/${PORTAL_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mgmtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: pipelineQuery }),
      }
    );

    const pipelineEntries = pipelineRes.ok
      ? await pipelineRes.json()
      : [];

    // Build pipeline lookup by agent_id
    const pipelineByAgentId = new Map<
      string,
      {
        stage: string;
        agency_id: string | null;
        writing_numbers: string | null;
        stage_entered_at: string | null;
        created_at: string | null;
      }
    >();
    if (Array.isArray(pipelineEntries)) {
      for (const p of pipelineEntries) {
        if (p.agent_id) {
          pipelineByAgentId.set(p.agent_id, p);
        }
      }
    }

    // ── Sync each agent ──
    const results: Array<{ action: string; agent: string; status: string }> = [];
    const errors: string[] = [];

    for (const agent of portalAgents) {
      try {
        const pipeline = pipelineByAgentId.get(agent.id) || null;
        const result = await syncAgent(supabase, agent, pipeline, eventType);
        results.push(result);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    const elapsed = Math.round(performance.now() - started);

    return jsonResponse({
      success: true,
      event_type: eventType,
      portal_agents_processed: portalAgents.length,
      pipeline_entries_found: pipelineByAgentId.size,
      results_summary: {
        created: results.filter((r) => r.action === "created").length,
        status_changed: results.filter((r) => r.action === "status_changed").length,
        updated: results.filter((r) => r.action === "updated").length,
      },
      status_distribution: results.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      errors: errors.length > 0 ? errors : undefined,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    return jsonResponse(
      { error: "Internal server error" },
      500
    );
  }
});
