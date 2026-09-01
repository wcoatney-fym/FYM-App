/**
 * push-contracting-stage — Push contracting pipeline stage changes from FYM App → GHL.
 *
 * Called by the front-end after a stage change in the Contracting Pipeline tab.
 * Reads GHL config from the portal DB (akhojh) `agent_pipeline_ghl_config`,
 * pushes the stage change to GHL, and adds a suppression tag to prevent
 * the GHL workflow from echoing back.
 *
 * Actions:
 *   - push:   Push a single stage change to GHL
 *   - sync:   Full pull of GHL pipeline state → App (bulk reconciliation)
 *   - status: Check GHL connection status
 *
 * Auth: Requires FYM App authenticated session.
 * Secrets: CONTRACTING_SUPABASE_URL, CONTRACTING_SUPABASE_SERVICE_KEY (portal DB access),
 *          plus GHL API key from agent_pipeline_ghl_config.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const SUPPRESSION_TAG = "app | contracting pipeline trigger";
const PAGE_LIMIT = 20;
const MAX_PAGES = 50;
const PAGE_DELAY_MS = 200;

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "https://www.agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

function CORS_HEADERS(req?: Request | null): Record<string, string> {
  const origin = req?.headers?.get("Origin") || req?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS(req), "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

/** Portal DB client (akhojh) — config + pipeline data lives here */
function getPortalClient() {
  const url = Deno.env.get("CONTRACTING_SUPABASE_URL");
  const key =
    Deno.env.get("CONTRACTING_SUPABASE_SERVICE_KEY") ||
    Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error(
      "Missing CONTRACTING_SUPABASE_URL or CONTRACTING_SUPABASE_SERVICE_KEY"
    );
  }
  return createClient(url, key);
}

/** Load GHL config (single-row table) */
async function loadGhlConfig(portal: ReturnType<typeof createClient>) {
  const { data: config } = await portal
    .from("agent_pipeline_ghl_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (
    !config ||
    !config.ghl_api_key ||
    !config.ghl_location_id ||
    !config.ghl_pipeline_id
  ) {
    return null;
  }

  return {
    apiKey: config.ghl_api_key as string,
    locationId: config.ghl_location_id as string,
    pipelineId: config.ghl_pipeline_id as string,
    connectionStatus: config.connection_status as string | null,
    id: config.id,
  };
}

/** Load stage map: internal_stage → { ghl_stage_id, ghl_stage_name } */
async function loadStageMap(portal: ReturnType<typeof createClient>) {
  const { data: maps } = await portal
    .from("agent_pipeline_stage_map")
    .select("internal_stage, ghl_stage_id, ghl_stage_name");

  const forward: Record<string, { ghlStageId: string; ghlStageName: string }> =
    {};
  const reverse: Record<string, string> = {};

  for (const m of maps || []) {
    if (m.ghl_stage_id) {
      forward[m.internal_stage] = {
        ghlStageId: m.ghl_stage_id,
        ghlStageName: m.ghl_stage_name || "",
      };
      reverse[m.ghl_stage_id] = m.internal_stage;
    }
    if (m.ghl_stage_name) {
      reverse[m.ghl_stage_name.toLowerCase()] = m.internal_stage;
    }
  }

  return { forward, reverse };
}

function ghlHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: GHL_API_VERSION,
    Accept: "application/json",
  };
}

/** Add suppression tag to a GHL contact */
async function addSuppressionTag(
  apiKey: string,
  contactId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: "PUT",
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ tags: [SUPPRESSION_TAG] }),
    });
    if (!res.ok) {
      console.warn(`Failed to add suppression tag: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to add suppression tag:", err);
    return false;
  }
}

/** Resolve contact ID from an opportunity if not stored on the record */
async function resolveContactId(
  apiKey: string,
  opportunityId: string
): Promise<string | null> {
  try {
    const res = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
      headers: ghlHeaders(apiKey),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.opportunity?.contactId || data.contactId || null;
  } catch {
    return null;
  }
}

// ── Push handler ─────────────────────────────────────────────────────────────

async function handlePush(body: any): Promise<Response> {
  const { record_id, new_stage, updated_by, updated_by_source, changed_by_user_id } = body;

  if (!record_id || !new_stage) {
    return json({ error: "record_id and new_stage are required" }, 400);
  }

  const attributedTo: string =
    updated_by ?? (updated_by_source === "training_hub" ? "Bianca" : "Tracey");
  const source: string = updated_by_source ?? "contracting_portal";

  const portal = getPortalClient();

  // Load the pipeline record
  const { data: record, error: recordErr } = await portal
    .from("agent_pipeline")
    .select("*")
    .eq("id", record_id)
    .maybeSingle();

  if (recordErr || !record) {
    return json({ error: "Pipeline record not found" }, 404);
  }

  // Load GHL config
  const config = await loadGhlConfig(portal);
  if (!config) {
    // No GHL config — update locally only
    const { data: updated } = await portal
      .from("agent_pipeline")
      .update({
        stage: new_stage,
        last_updated_by: attributedTo,
        last_updated_by_display: attributedTo,
        updated_by_source: source,
        ghl_sync_status: "synced",
        stage_entered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", record_id)
      .select()
      .maybeSingle();

    return json({
      success: true,
      record: updated,
      ghl_pushed: false,
      reason: "no_config",
    });
  }

  // Load stage map
  const { forward: stageMap } = await loadStageMap(portal);
  const mapping = stageMap[new_stage];

  if (!mapping) {
    // No GHL stage mapping — update locally only
    const { data: updated } = await portal
      .from("agent_pipeline")
      .update({
        stage: new_stage,
        last_updated_by: attributedTo,
        last_updated_by_display: attributedTo,
        updated_by_source: source,
        ghl_sync_status: "synced",
        stage_entered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", record_id)
      .select()
      .maybeSingle();

    return json({
      success: true,
      record: updated,
      ghl_pushed: false,
      reason: "no_stage_mapping",
    });
  }

  // Mark as pushing
  await portal
    .from("agent_pipeline")
    .update({ ghl_sync_status: "pushing" })
    .eq("id", record_id);

  const headers = ghlHeaders(config.apiKey);

  // Find the GHL opportunity — by stored ID or phone match
  let opportunityId = record.ghl_opportunity_id;
  let matchedByPhone = false;

  if (record.phone) {
    const normalizedPhone = normalizePhone(record.phone);
    const searchUrl = `${GHL_BASE}/opportunities/search?location_id=${config.locationId}&pipeline_id=${config.pipelineId}&q=${encodeURIComponent(normalizedPhone)}`;

    const searchRes = await fetch(searchUrl, { headers });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const opportunities = searchData.opportunities || [];
      const matched = opportunities.find(
        (opp: { contact?: { phone?: string } }) => {
          const oppPhone = normalizePhone(opp.contact?.phone || "");
          return (
            oppPhone &&
            (oppPhone === normalizedPhone ||
              oppPhone.endsWith(normalizedPhone.slice(-10)) ||
              normalizedPhone.endsWith(oppPhone.slice(-10)))
          );
        }
      );
      if (matched) {
        opportunityId = matched.id;
        matchedByPhone = true;
      }
    }
  }

  if (!opportunityId) {
    // Revert sync status
    await portal
      .from("agent_pipeline")
      .update({ ghl_sync_status: "synced" })
      .eq("id", record_id);

    return json({
      success: true,
      record,
      ghl_pushed: false,
      reason: "no_opportunity_found",
    });
  }

  // Push stage change to GHL
  const pushRes = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      pipelineId: config.pipelineId,
      pipelineStageId: mapping.ghlStageId,
    }),
  });

  if (!pushRes.ok) {
    const errText = await pushRes.text();

    // Revert sync status
    await portal
      .from("agent_pipeline")
      .update({ ghl_sync_status: "synced" })
      .eq("id", record_id);

    // Log failed push
    await portal.from("webhook_log").insert({
      source: "push-contracting-stage",
      event_type: "push_failed",
      payload: {
        record_id,
        new_stage,
        opportunity_id: opportunityId,
        error: errText.slice(0, 500),
      },
    });

    return json({
      success: false,
      error: `GHL API returned ${pushRes.status}: ${errText.slice(0, 200)}`,
      ghl_pushed: false,
    });
  }

  // ── Suppression tag (loop prevention) ────────────────────────────────────
  let contactId = record.ghl_contact_id || null;
  let tagAdded = false;

  if (contactId) {
    tagAdded = await addSuppressionTag(config.apiKey, contactId);
  } else {
    // No stored contact ID — resolve from the opportunity
    contactId = await resolveContactId(config.apiKey, opportunityId);
    if (contactId) {
      tagAdded = await addSuppressionTag(config.apiKey, contactId);
      // Cache the contact ID for next time
      await portal
        .from("agent_pipeline")
        .update({ ghl_contact_id: contactId })
        .eq("id", record_id);
    }
  }

  // Update local record
  const { data: updated } = await portal
    .from("agent_pipeline")
    .update({
      stage: new_stage,
      ghl_stage_id: mapping.ghlStageId,
      last_updated_by: attributedTo,
      last_updated_by_display: attributedTo,
      updated_by_source: source,
      ghl_sync_status: "synced",
      stage_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", record_id)
    .select()
    .maybeSingle();

  // Log successful push
  await portal.from("webhook_log").insert({
    source: "push-contracting-stage",
    event_type: "push_success",
    payload: {
      record_id,
      new_stage,
      opportunity_id: opportunityId,
      matched_by_phone: matchedByPhone,
      suppression_tag_added: tagAdded,
    },
  });

  return json({ success: true, record: updated, ghl_pushed: true });
}

// ── Sync handler (bulk pull GHL → App) ───────────────────────────────────────

async function handleSync(): Promise<Response> {
  const portal = getPortalClient();
  const config = await loadGhlConfig(portal);

  if (!config) {
    return json(
      { success: false, error: "No GHL config found. Configure settings first." },
      400
    );
  }

  const headers = ghlHeaders(config.apiKey);
  const { reverse: reverseMap } = await loadStageMap(portal);

  // Also check agency info from location
  const { data: agencyConfig } = await portal
    .from("agency_ghl_configs")
    .select("agency_id, hierarchy_agencies(id, name)")
    .eq("ghl_location_id", config.locationId)
    .maybeSingle();

  const agencyName = agencyConfig
    ? (agencyConfig.hierarchy_agencies as { id: string; name: string } | null)
        ?.name || null
    : null;
  const agencyId = agencyConfig ? agencyConfig.agency_id : null;

  // Fetch all opportunities from the pipeline (paginated)
  const allOpportunities: any[] = [];
  let startAfterId: string | undefined;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    let url = `${GHL_BASE}/opportunities/search?location_id=${config.locationId}&pipeline_id=${config.pipelineId}&limit=${PAGE_LIMIT}`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;

    const res = await fetch(url, { method: "GET", headers });

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = parseInt(
          res.headers.get("retry-after") || "3",
          10
        );
        await sleep(retryAfter * 1000);
        continue;
      }
      const text = await res.text();
      return json(
        {
          success: false,
          error: `GHL API error ${res.status}: ${text}`,
          fetched: allOpportunities.length,
        },
        502
      );
    }

    const data = await res.json();
    const opportunities = data.opportunities || [];
    if (opportunities.length === 0) break;

    allOpportunities.push(...opportunities);
    startAfterId = opportunities[opportunities.length - 1].id;
    pageCount++;

    if (opportunities.length < PAGE_LIMIT) break;
    await sleep(PAGE_DELAY_MS);
  }

  if (allOpportunities.length === 0) {
    return json({
      success: true,
      message: "No opportunities found in GHL pipeline",
      synced: 0,
    });
  }

  // Pre-load custom field label map (GHL field ID → human-readable name)
  const { data: fieldMapRows } = await portal
    .from("ghl_custom_field_map")
    .select("ghl_field_id, field_name");
  const fieldLabelMap: Record<string, string> = {};
  for (const row of fieldMapRows || []) {
    if (row.ghl_field_id && row.field_name) {
      fieldLabelMap[row.ghl_field_id] = row.field_name;
    }
  }

  // Pre-load existing records for stage-change detection
  const { data: existingRows } = await portal
    .from("agent_pipeline")
    .select("ghl_opportunity_id, stage");
  const existingByOppId: Record<string, string> = {};
  for (const row of existingRows || []) {
    if (row.ghl_opportunity_id)
      existingByOppId[row.ghl_opportunity_id] = row.stage;
  }

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const opp of allOpportunities) {
    const ghlStageId = opp.pipelineStageId || null;
    const internalStage = ghlStageId ? reverseMap[ghlStageId] : null;

    if (!internalStage) {
      skipped++;
      continue;
    }

    const oppContact = opp.contact || {};
    const contactId = oppContact.id || opp.contactId || null;

    // Enrich with full contact detail
    let detail: any = null;
    if (contactId) {
      try {
        const cRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
          headers,
        });
        if (cRes.status === 429) {
          const retryAfter = parseInt(
            cRes.headers.get("retry-after") || "3",
            10
          );
          await sleep(retryAfter * 1000);
          const retry = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
            headers,
          });
          if (retry.ok) {
            const rj = await retry.json();
            detail = rj.contact || rj || null;
          }
        } else if (cRes.ok) {
          const cData = await cRes.json();
          detail = cData.contact || cData || null;
        }
      } catch {
        // non-fatal
      }
    }

    const contactName =
      detail?.name || oppContact.name || opp.name || "";
    const nameParts = contactName.split(" ");
    const firstName =
      detail?.firstName || oppContact.firstName || nameParts[0] || "";
    const lastName =
      detail?.lastName ||
      oppContact.lastName ||
      nameParts.slice(1).join(" ") ||
      "";
    const tags = detail?.tags || [];

    // Map custom fields — resolve GHL field IDs to human-readable labels
    const customFields: Record<string, unknown> = {};
    for (const f of detail?.customFields || []) {
      const rawKey = f.id || f.key || "";
      // Resolve: use the label map first, then fall back to f.name, then raw ID
      const key = fieldLabelMap[rawKey] || f.name || rawKey;
      if (key) customFields[key] = f.value ?? f.fieldValue ?? null;
    }

    const prevStage = existingByOppId[opp.id];
    const stageChanged =
      prevStage === undefined || prevStage !== internalStage;

    const pipelineData: Record<string, unknown> = {
      ghl_opportunity_id: opp.id,
      ghl_contact_id: contactId,
      ghl_pipeline_id: opp.pipelineId || config.pipelineId,
      ghl_stage_id: ghlStageId,
      stage: internalStage,
      agent_name: contactName || `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      email: detail?.email || oppContact.email || null,
      phone: detail?.phone || oppContact.phone || null,
      agency: agencyName,
      agency_id: agencyId,
      tags,
      custom_fields: customFields,
      last_updated_by: "ghl_webhook",
      ghl_sync_status: "synced",
      updated_at: new Date().toISOString(),
    };

    if (stageChanged) {
      pipelineData.stage_entered_at = new Date().toISOString();
    }

    const { error: upsertErr } = await portal
      .from("agent_pipeline")
      .upsert(pipelineData, { onConflict: "ghl_opportunity_id" });

    if (upsertErr) {
      errors.push(`${opp.id}: ${upsertErr.message}`);
    } else {
      synced++;
    }

    if (contactId) await sleep(PAGE_DELAY_MS);
  }

  // Update connection status
  await portal
    .from("agent_pipeline_ghl_config")
    .update({
      connection_status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id);

  return json({
    success: true,
    message: `Synced ${synced} opportunities from GHL pipeline`,
    synced,
    skipped,
    total_fetched: allOpportunities.length,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  });
}

// ── Status handler ───────────────────────────────────────────────────────────

async function handleStatus(): Promise<Response> {
  const portal = getPortalClient();
  const config = await loadGhlConfig(portal);

  return json({
    enabled: !!config,
    config: config
      ? {
          locationId: config.locationId,
          pipelineId: config.pipelineId,
          connectionStatus: config.connectionStatus,
        }
      : null,
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS(req) });
  }

  try {
    const body = await req.json();
    const action = body.action || "push";

    switch (action) {
      case "push":
        return await handlePush(body);
      case "sync":
        return await handleSync();
      case "status":
        return await handleStatus();
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("push-contracting-stage error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
