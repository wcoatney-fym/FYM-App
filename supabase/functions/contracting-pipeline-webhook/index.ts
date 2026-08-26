/**
 * contracting-pipeline-webhook — Receive GHL pipeline stage changes → update FYM App.
 *
 * Public endpoint hit by GHL workflow webhooks when a stage change happens
 * in the contracting sub-account's pipeline. The GHL workflow checks for the
 * suppression tag "app | contracting pipeline trigger" BEFORE firing — if the
 * tag is present, GHL drops the event and never calls this webhook.
 *
 * So any request that reaches this endpoint is a genuine GHL-native change.
 *
 * Payload (from GHL webhook):
 *   - opportunity_id:  GHL opportunity ID
 *   - contact_id:      GHL contact ID
 *   - pipeline_stage:  New stage name in GHL
 *   - location_id:     GHL location ID
 *
 * Auth: Webhook secret in query param (?secret=<value>).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Portal DB client (akhojh) — pipeline data + config lives here */
function getPortalClient() {
  const url = Deno.env.get("CONTRACTING_SUPABASE_URL")!;
  const key =
    Deno.env.get("CONTRACTING_SUPABASE_SERVICE_KEY") ||
    Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY")!;
  return createClient(url, key);
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
    const expectedSecret = Deno.env.get("CONTRACTING_WEBHOOK_SECRET");

    if (expectedSecret && secret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json();
    const portal = getPortalClient();

    // Extract location ID
    const locationId =
      payload.locationId || payload.location_id || null;

    if (!locationId) {
      return json({ error: "Missing locationId" }, 400);
    }

    // Verify this location is configured — check both config tables
    const { data: config } = await portal
      .from("agency_ghl_configs")
      .select("agency_id, hierarchy_agencies(id, name)")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    const { data: pipelineConfig } = await portal
      .from("agent_pipeline_ghl_config")
      .select("ghl_location_id")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (!config && !pipelineConfig) {
      return json(
        { error: "No agency mapped to this location" },
        404
      );
    }

    // Extract opportunity data
    const opportunity = payload.opportunity || payload;
    const ghlOpportunityId =
      opportunity.id ||
      payload.opportunity_id ||
      payload.opportunityId ||
      null;

    if (!ghlOpportunityId) {
      return json({
        success: true,
        message: "No opportunity ID in payload, skipping",
      });
    }

    // Get the stage name from the payload
    const stageName =
      opportunity.pipelineStageName ||
      opportunity.pipeline_stage_name ||
      opportunity.stageName ||
      opportunity.stage_name ||
      payload.pipeline_stage ||
      payload.pipelineStage ||
      payload.stage_name ||
      payload.stageName ||
      null;

    if (!stageName) {
      return json({
        success: true,
        message: "No stage name in payload, skipping",
      });
    }

    // Look up the internal stage from the mapping table
    const { data: stageMapping } = await portal
      .from("agent_pipeline_stage_map")
      .select("internal_stage, ghl_stage_id")
      .eq("ghl_stage_name", stageName)
      .maybeSingle();

    if (!stageMapping) {
      return json({
        success: true,
        message: `Unknown stage name "${stageName}", skipping`,
      });
    }

    // Auto-learn GHL stage ID from incoming webhook if not already stored
    const incomingGhlStageId =
      opportunity.pipelineStageId ||
      opportunity.pipeline_stage_id ||
      null;
    if (incomingGhlStageId && !stageMapping.ghl_stage_id) {
      await portal
        .from("agent_pipeline_stage_map")
        .update({ ghl_stage_id: incomingGhlStageId })
        .eq("ghl_stage_name", stageName);
    }

    // Extract contact info
    const contact = opportunity.contact || {};
    const contactId =
      payload.contact_id ||
      payload.contactId ||
      contact.id ||
      opportunity.contactId ||
      null;
    const contactName = contact.name || opportunity.name || "";
    const nameParts = contactName.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const agencyName = config
      ? (config.hierarchy_agencies as { id: string; name: string } | null)
          ?.name || null
      : null;
    const agencyId = config ? config.agency_id : null;

    // Check if the record already exists (for loop detection)
    const { data: existing } = await portal
      .from("agent_pipeline")
      .select("id, stage, last_updated_by, ghl_sync_status")
      .eq("ghl_opportunity_id", ghlOpportunityId)
      .maybeSingle();

    // LOOP GUARD (DB-side fallback): if stage already matches the incoming
    // stage and the record was last updated by something other than ghl_webhook,
    // this is an echo from the app's own push — skip it.
    // The primary guard is the tag check in the GHL workflow; this is
    // belt-and-suspenders.
    if (
      existing &&
      existing.stage === stageMapping.internal_stage &&
      existing.last_updated_by !== "ghl_webhook"
    ) {
      return json({
        success: true,
        message: "Echo detected (stage unchanged, non-GHL source), skipping",
      });
    }

    const stageChanged =
      !existing || existing.stage !== stageMapping.internal_stage;

    const pipelineData: Record<string, unknown> = {
      ghl_opportunity_id: ghlOpportunityId,
      ghl_pipeline_id:
        opportunity.pipelineId || opportunity.pipeline_id || null,
      ghl_stage_id: incomingGhlStageId,
      ghl_contact_id: contactId,
      stage: stageMapping.internal_stage,
      agent_name: contactName,
      first_name: firstName,
      last_name: lastName,
      email: contact.email || opportunity.email || null,
      phone: contact.phone || opportunity.phone || null,
      agency: agencyName,
      agency_id: agencyId,
      last_updated_by: "ghl_webhook",
      ghl_sync_status: "synced",
      updated_at: new Date().toISOString(),
    };

    if (stageChanged) {
      pipelineData.stage_entered_at = new Date().toISOString();
    }

    const { error } = await portal
      .from("agent_pipeline")
      .upsert(pipelineData, { onConflict: "ghl_opportunity_id" });

    if (error) {
      return json({ success: false, error: error.message }, 500);
    }

    return json({
      success: true,
      message: `Agent "${contactName}" ${existing ? "updated to" : "added at"} stage "${stageMapping.internal_stage}"`,
    });
  } catch (err: any) {
    console.error("contracting-pipeline-webhook error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
