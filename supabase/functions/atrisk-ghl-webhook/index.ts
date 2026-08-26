/**
 * atrisk-ghl-webhook — Receive GHL pipeline stage changes → update FYM App.
 *
 * Public endpoint hit by GHL workflow webhooks when a stage change happens
 * in a GHL sub-account's At-Risk Pipeline. The GHL workflow checks for the
 * suppression tag "app | manager pipeline trigger" BEFORE firing — if the
 * tag is present, GHL drops the event and never calls this webhook.
 *
 * So any request that reaches this endpoint is a genuine GHL-native change.
 *
 * Payload (from GHL webhook):
 *   - opportunity_id:  GHL opportunity ID
 *   - contact_id:      GHL contact ID
 *   - pipeline_stage:  New stage name in GHL (e.g. "Responded", "Code Red")
 *   - location_id:     GHL location ID (identifies the agency)
 *   - agency_id:       FYM agency ID (passed as query param for routing)
 *
 * Auth: Webhook secret in query param (?secret=<value>) matched against
 *       per-agency config or a global webhook secret.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// GHL stage name → App stage key (reverse of push mapping)
const STAGE_REVERSE_MAP: Record<string, string> = {
  new: "new",
  responded: "responded",
  manager: "manager_outreach",
  "manager outreach": "manager_outreach",
  "manager | outreach": "manager_outreach",
  agent: "agent_outreach",
  "agent outreach": "agent_outreach",
  "agent | outreach": "agent_outreach",
  "code red": "code_red",
  pending: "agent_saved_pending",
  "agent | saved pending": "agent_saved_pending",
  "agent saved pending": "agent_saved_pending",
  saved: "saved",
  lost: "lost",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getAppClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

function getPortalClient() {
  const url = Deno.env.get("CONTRACTING_SUPABASE_URL")!;
  const key = Deno.env.get("CONTRACTING_SUPABASE_SERVICE_KEY") || Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY")!;
  return createClient(url, key);
}

/**
 * Check if manager_pipeline_enabled is true for the given agency.
 * Uses agency_id directly, or resolves from location_id.
 */
async function isPipelineEnabled(
  agencyId: string | null,
  locationId: string | null
): Promise<{ enabled: boolean; resolvedAgencyId: string | null }> {
  const portal = getPortalClient();

  // Try by agency_id first
  if (agencyId) {
    const { data } = await portal
      .from("agency_ghl_configs")
      .select("manager_pipeline_enabled")
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (data) {
      return { enabled: !!data.manager_pipeline_enabled, resolvedAgencyId: agencyId };
    }
  }

  // Fallback: resolve by location_id
  if (locationId) {
    const { data } = await portal
      .from("agency_ghl_configs")
      .select("agency_id, manager_pipeline_enabled")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (data) {
      return { enabled: !!data.manager_pipeline_enabled, resolvedAgencyId: data.agency_id };
    }
  }

  return { enabled: false, resolvedAgencyId: null };
}

/** Resolve a GHL stage name to our internal stage key */
function resolveStage(ghlStageName: string): string | null {
  const normalized = ghlStageName.trim().toLowerCase();
  return STAGE_REVERSE_MAP[normalized] || null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Auth: check webhook secret
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const expectedSecret = Deno.env.get("GHL_WEBHOOK_SECRET");

    if (expectedSecret && secret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const rawBody = await req.text();
    let body: any = {};
    try { body = JSON.parse(rawBody); } catch { /* non-JSON body */ }

    // DEBUG: log incoming request (temporary — remove after testing)
    try {
      const portal = getPortalClient();
      await portal.from('webhook_debug_log').insert({
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
        body: typeof body === 'object' ? body : { raw: rawBody },
        query_params: Object.fromEntries(url.searchParams.entries()),
        result: 'atrisk-received',
      });
    } catch { /* logging is best-effort */ }

    // GHL webhook payloads vary — normalize the fields
    const opportunityId =
      body.opportunity_id ||
      body.opportunityId ||
      body.id ||
      body.opportunity?.id;

    const contactId =
      body.contact_id ||
      body.contactId ||
      body.opportunity?.contact?.id ||
      body.opportunity?.contactId;

    const pipelineStage =
      body.pipeline_stage ||
      body.pipelineStage ||
      body.pipleline_stage ||  // GHL typo — this is the actual field name in standard data
      body.stage_name ||
      body.stageName ||
      body.opportunity?.pipelineStage?.name ||
      body.opportunity?.stageName;

    const locationId =
      body.location_id ||
      body.locationId ||
      body.location?.id ||
      body.opportunity?.locationId;

    const agencyId =
      body.agency_id ||
      url.searchParams.get("agency_id");

    // Gate: check manager_pipeline_enabled before processing.
    // If pipeline isn't enabled, this agency hasn't completed CRM team
    // sync confirmation — silently skip the webhook.
    const { enabled: pipelineEnabled } = await isPipelineEnabled(agencyId, locationId);
    if (!pipelineEnabled) {
      return json({
        success: true,
        skipped: true,
        reason: "Manager pipeline not yet enabled — awaiting CRM team sync confirmation",
      });
    }

    if (!opportunityId || !pipelineStage) {
      console.warn("atrisk-ghl-webhook: missing opportunity_id or pipeline_stage", body);
      return json({
        error: "Missing opportunity_id or pipeline_stage",
        received: { opportunityId, pipelineStage, contactId, locationId },
      }, 400);
    }

    // Resolve the GHL stage to our internal stage
    const appStage = resolveStage(pipelineStage);
    if (!appStage) {
      console.warn(`atrisk-ghl-webhook: unknown GHL stage "${pipelineStage}"`);
      return json({
        success: true,
        skipped: true,
        reason: `Unknown GHL stage: "${pipelineStage}"`,
      });
    }

    const app = getAppClient();

    // Find the existing task by ghl_opportunity_id
    const { data: existingTask } = await app
      .from("atrisk_tasks")
      .select("id, policy_number, agency_id, stage, ghl_contact_id")
      .eq("ghl_opportunity_id", opportunityId)
      .maybeSingle();

    if (!existingTask) {
      // No matching task — could be an opportunity we didn't create.
      // If we have a contact ID, try to find by that
      if (contactId) {
        const { data: contactTask } = await app
          .from("atrisk_tasks")
          .select("id, policy_number, agency_id, stage, ghl_opportunity_id")
          .eq("ghl_contact_id", contactId)
          .maybeSingle();

        if (contactTask) {
          // Found by contact — update it
          return await updateTask(app, contactTask, appStage, opportunityId, contactId);
        }
      }

      // Truly unknown — log and skip
      console.warn(
        `atrisk-ghl-webhook: no task found for opportunity ${opportunityId}, contact ${contactId}`
      );
      return json({
        success: true,
        skipped: true,
        reason: "No matching task found in FYM App",
        ghl_opportunity_id: opportunityId,
      });
    }

    // Task found — check if the stage actually changed
    if (existingTask.stage === appStage) {
      return json({
        success: true,
        skipped: true,
        reason: "Stage already matches",
      });
    }

    return await updateTask(app, existingTask, appStage, opportunityId, contactId);
  } catch (err: any) {
    console.error("atrisk-ghl-webhook error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});

/** Update a task from a GHL webhook event */
async function updateTask(
  app: ReturnType<typeof createClient>,
  task: any,
  newStage: string,
  opportunityId: string | null,
  contactId: string | null
): Promise<Response> {
  const oldStage = task.stage;

  // Update the task
  const updatePayload: Record<string, any> = {
    stage: newStage,
    status: newStage as any,
    stage_changed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Store GHL IDs if we didn't have them
  if (opportunityId && !task.ghl_opportunity_id) {
    updatePayload.ghl_opportunity_id = opportunityId;
  }
  if (contactId && !task.ghl_contact_id) {
    updatePayload.ghl_contact_id = contactId;
  }

  await app
    .from("atrisk_tasks")
    .update(updatePayload)
    .eq("id", task.id);

  // Log stage history with source='ghl' — this is the loop guard
  await app.from("atrisk_stage_history").insert({
    task_id: task.id,
    from_stage: oldStage,
    to_stage: newStage,
    source: "ghl",
    note: `Stage changed in GHL (opportunity: ${opportunityId})`,
  });

  return json({
    success: true,
    task_id: task.id,
    policy_number: task.policy_number,
    from_stage: oldStage,
    to_stage: newStage,
    source: "ghl",
  });
}
