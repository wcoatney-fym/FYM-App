/**
 * atrisk-ghl-push — Push at-risk pipeline stage changes from FYM App → GHL.
 *
 * Called by the front-end after a stage change in the Workboard.
 * Looks up the agency's GHL credentials from the portal DB (akhojh),
 * checks ghl_api_enabled, and if enabled:
 *   1. Moves the GHL opportunity to the matching pipeline stage
 *   2. Adds the suppression tag "app | manager pipeline trigger"
 *      (prevents the GHL webhook workflow from echoing back)
 *
 * Actions:
 *   - push:     Push a single stage change to GHL
 *   - seed:     One-time seed of all current app pipeline state → GHL (on opt-in)
 *   - import:   One-time pull of GHL pipeline state → App (initial sync on enable)
 *   - status:   Check GHL connection status for an agency
 *
 * Auth: Requires FYM App authenticated session.
 * Secrets: CONTRACTING_SUPABASE_URL, CONTRACTING_SUPABASE_ANON_KEY (portal DB access),
 *          plus per-agency GHL API keys from agency_ghl_configs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────

const SUPPRESSION_TAG = "app | manager pipeline trigger";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// App stage → GHL pipeline stage name mapping (1:1 per Charlie)
const STAGE_MAP: Record<string, string> = {
  new: "New",
  responded: "Responded",
  manager_outreach: "Manager",
  agent_outreach: "Agent",
  code_red: "Code Red",
  agent_saved_pending: "Pending",
  saved: "Saved",
  lost: "Lost",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Create Supabase client for FYM App DB (rcbzag) */
function getAppClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

/** Create Supabase client for Portal DB (akhojh) */
function getPortalClient() {
  const url = Deno.env.get("CONTRACTING_SUPABASE_URL");
  const key = Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Missing CONTRACTING_SUPABASE_URL or CONTRACTING_SUPABASE_ANON_KEY");
  }
  return createClient(url, key);
}

/** Look up GHL credentials for an agency */
async function getAgencyGhlConfig(agencyId: string) {
  const portal = getPortalClient();

  // First check if the agency has ghl_api_enabled in the tracker
  // (hierarchy_agencies in portal DB has ghl_api_enabled)
  const { data: agency } = await portal
    .from("hierarchy_agencies")
    .select("id, ghl_api_enabled")
    .eq("id", agencyId)
    .maybeSingle();

  if (!agency?.ghl_api_enabled) {
    return null; // GHL not enabled for this agency
  }

  // Get the GHL config
  const { data: config } = await portal
    .from("agency_ghl_configs")
    .select("ghl_api_key, ghl_location_id, connection_status")
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!config || config.connection_status !== "connected" || !config.ghl_api_key) {
    return null;
  }

  return {
    apiKey: config.ghl_api_key,
    locationId: config.ghl_location_id,
  };
}

// ── GHL API calls ────────────────────────────────────────────────────────────

/** Find or create the at-risk pipeline in a GHL location */
async function getOrCreatePipeline(apiKey: string, locationId: string) {
  // List existing pipelines
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${locationId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GHL pipeline list failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const pipelines = data.pipelines || [];

  // Look for existing "At-Risk Pipeline" or "Manager Pipeline"
  const existing = pipelines.find(
    (p: any) =>
      p.name === "At-Risk Pipeline" || p.name === "Manager Pipeline"
  );

  if (existing) {
    return existing;
  }

  // Create the pipeline with our 8 stages
  const createRes = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId,
        name: "At-Risk Pipeline",
        stages: Object.values(STAGE_MAP).map((name, i) => ({
          name,
          position: i,
        })),
      }),
    }
  );

  if (!createRes.ok) {
    throw new Error(
      `GHL pipeline create failed: ${createRes.status} ${await createRes.text()}`
    );
  }

  return (await createRes.json()).pipeline;
}

/** Find the stage ID in a GHL pipeline by name */
function findStageId(pipeline: any, stageName: string): string | null {
  const stages = pipeline.stages || [];
  const stage = stages.find(
    (s: any) => s.name.toLowerCase() === stageName.toLowerCase()
  );
  return stage?.id || null;
}

/** Move a GHL opportunity to a new stage */
async function moveOpportunity(
  apiKey: string,
  opportunityId: string,
  pipelineId: string,
  stageId: string
): Promise<void> {
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/${opportunityId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        pipelineId,
        pipelineStageId: stageId,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `GHL opportunity move failed: ${res.status} ${await res.text()}`
    );
  }
}

/** Create a GHL opportunity for a policy */
async function createOpportunity(
  apiKey: string,
  locationId: string,
  pipelineId: string,
  stageId: string,
  contactId: string,
  policyNumber: string,
  clientName: string | null,
  premium: number | null
): Promise<string> {
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId,
        pipelineId,
        pipelineStageId: stageId,
        contactId,
        name: `At-Risk: ${clientName || policyNumber}`,
        monetaryValue: premium ? premium * 12 : 0,
        status: "open",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `GHL opportunity create failed: ${res.status} ${await res.text()}`
    );
  }

  const data = await res.json();
  return data.opportunity?.id || data.id;
}

/** Add a tag to a GHL contact (suppression tag for loop prevention) */
async function addContactTag(
  apiKey: string,
  contactId: string,
  tag: string
): Promise<void> {
  const res = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        tags: [tag],
      }),
    }
  );

  if (!res.ok) {
    console.warn(`Failed to add suppression tag: ${res.status}`);
    // Non-fatal — the push still succeeded, worst case GHL echoes back
    // and our source guard catches it
  }
}

/** Search for a GHL contact by email or name */
async function findContact(
  apiKey: string,
  locationId: string,
  clientName: string | null,
  policyNumber: string
): Promise<string | null> {
  // Search by name first
  if (clientName) {
    const res = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${locationId}&name=${encodeURIComponent(clientName)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const contacts = data.contacts || [];
      if (contacts.length > 0) {
        return contacts[0].id;
      }
    }
  }

  return null;
}

// ── Push handler ─────────────────────────────────────────────────────────────

async function handlePush(body: any): Promise<Response> {
  const {
    policy_number,
    agency_id,
    new_stage,
    client_name,
    plan_premium,
    ghl_contact_id,
    ghl_opportunity_id,
    task_id,
  } = body;

  if (!policy_number || !agency_id || !new_stage) {
    return json({ error: "Missing policy_number, agency_id, or new_stage" }, 400);
  }

  // Check if GHL is enabled for this agency
  const ghlConfig = await getAgencyGhlConfig(agency_id);
  if (!ghlConfig) {
    return json({
      success: true,
      skipped: true,
      reason: "GHL not enabled or not connected for this agency",
    });
  }

  const { apiKey, locationId } = ghlConfig;

  // Get or create the at-risk pipeline
  const pipeline = await getOrCreatePipeline(apiKey, locationId);
  const pipelineId = pipeline.id;

  // Resolve the target stage
  const ghlStageName = STAGE_MAP[new_stage];
  if (!ghlStageName) {
    return json({ error: `Unknown stage: ${new_stage}` }, 400);
  }

  const stageId = findStageId(pipeline, ghlStageName);
  if (!stageId) {
    return json({ error: `Stage "${ghlStageName}" not found in GHL pipeline` }, 400);
  }

  const app = getAppClient();

  // If we already have a GHL opportunity, just move it
  if (ghl_opportunity_id) {
    await moveOpportunity(apiKey, ghl_opportunity_id, pipelineId, stageId);

    // Add suppression tag if we have a contact ID
    if (ghl_contact_id) {
      await addContactTag(apiKey, ghl_contact_id, SUPPRESSION_TAG);
    }

    return json({
      success: true,
      ghl_opportunity_id,
      ghl_contact_id,
      stage_pushed: ghlStageName,
    });
  }

  // No existing opportunity — need to find/create contact and opportunity
  let contactId = ghl_contact_id;

  if (!contactId) {
    // Try to find the contact in GHL
    contactId = await findContact(apiKey, locationId, client_name, policy_number);
  }

  if (!contactId) {
    // Can't push without a contact — return gracefully
    return json({
      success: true,
      skipped: true,
      reason: "No GHL contact found for this policy. Contact must exist in GHL first.",
    });
  }

  // Create the opportunity
  const newOppId = await createOpportunity(
    apiKey,
    locationId,
    pipelineId,
    stageId,
    contactId,
    policy_number,
    client_name,
    plan_premium
  );

  // Store the GHL IDs back on the task
  if (task_id) {
    await app
      .from("atrisk_tasks")
      .update({
        ghl_contact_id: contactId,
        ghl_opportunity_id: newOppId,
      })
      .eq("id", task_id);
  }

  // Add suppression tag
  await addContactTag(apiKey, contactId, SUPPRESSION_TAG);

  return json({
    success: true,
    ghl_opportunity_id: newOppId,
    ghl_contact_id: contactId,
    stage_pushed: ghlStageName,
    created: true,
  });
}

// ── Seed handler (one-time push of all app state → GHL on opt-in) ────────

async function handleSeed(body: any): Promise<Response> {
  const { agency_id } = body;
  if (!agency_id) {
    return json({ error: "Missing agency_id" }, 400);
  }

  const ghlConfig = await getAgencyGhlConfig(agency_id);
  if (!ghlConfig) {
    return json({ error: "GHL not enabled or not connected for this agency" }, 400);
  }

  const app = getAppClient();

  // Get all active tasks for this agency
  const PAGE = 1000;
  let offset = 0;
  const tasks: any[] = [];

  while (true) {
    const { data } = await app
      .from("atrisk_tasks")
      .select("*")
      .eq("agency_id", agency_id)
      .range(offset, offset + PAGE - 1);

    if (!data || data.length === 0) break;
    tasks.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (tasks.length === 0) {
    return json({ success: true, seeded: 0, message: "No tasks to seed" });
  }

  // Push each task to GHL
  let seeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const task of tasks) {
    try {
      const result = await handlePush({
        policy_number: task.policy_number,
        agency_id: task.agency_id,
        new_stage: task.stage || task.status,
        client_name: null,
        plan_premium: null,
        ghl_contact_id: task.ghl_contact_id,
        ghl_opportunity_id: task.ghl_opportunity_id,
        task_id: task.id,
      });

      const body = await result.json();
      if (body.success && !body.skipped) {
        seeded++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      errors.push(`${task.policy_number}: ${err.message}`);
    }
  }

  return json({
    success: true,
    seeded,
    skipped,
    total: tasks.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}

// ── Import handler (one-time pull of GHL pipeline state → App) ──────────────

// Reverse map: GHL stage name → app stage key
const REVERSE_STAGE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(STAGE_MAP).map(([k, v]) => [v.toLowerCase(), k])
);

async function handleImport(body: any): Promise<Response> {
  const { agency_id, api_key, location_id } = body;
  if (!agency_id) {
    return json({ error: "Missing agency_id" }, 400);
  }

  // Use provided creds (from Save & Sync) or fall back to stored config
  let apiKey = api_key;
  let locationId = location_id;

  if (!apiKey || !locationId) {
    const ghlConfig = await getAgencyGhlConfig(agency_id);
    if (!ghlConfig) {
      return json({ error: "GHL not enabled or not connected for this agency" }, 400);
    }
    apiKey = ghlConfig.apiKey;
    locationId = ghlConfig.locationId;
  }

  // Find the at-risk / manager pipeline in GHL
  const pipeline = await getOrCreatePipeline(apiKey, locationId);
  const pipelineId = pipeline.id;
  const stages = pipeline.stages || [];

  // Build stage ID → app stage key lookup
  const stageIdToAppKey: Record<string, string> = {};
  for (const s of stages) {
    const appKey = REVERSE_STAGE_MAP[s.name.toLowerCase()];
    if (appKey) stageIdToAppKey[s.id] = appKey;
  }

  // Fetch all opportunities from this pipeline
  const opportunities: any[] = [];
  let hasMore = true;
  let startAfterId: string | undefined;

  while (hasMore) {
    const url = new URL("https://services.leadconnectorhq.com/opportunities/search");
    const searchBody: any = {
      locationId,
      pipelineId,
      limit: 100,
    };
    if (startAfterId) searchBody.startAfterId = startAfterId;

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: `GHL opportunity search failed: ${res.status} ${errText}` }, 500);
    }

    const data = await res.json();
    const batch = data.opportunities || [];
    opportunities.push(...batch);

    if (batch.length < 100) {
      hasMore = false;
    } else {
      startAfterId = batch[batch.length - 1].id;
    }
  }

  if (opportunities.length === 0) {
    return json({ success: true, imported: 0, message: "No opportunities found in GHL pipeline" });
  }

  const app = getAppClient();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const opp of opportunities) {
    try {
      const ghlStageId = opp.pipelineStageId;
      const appStage = stageIdToAppKey[ghlStageId];
      if (!appStage) {
        skipped++;
        continue;
      }

      const contactId = opp.contactId || opp.contact?.id;
      const oppId = opp.id;
      const oppName = opp.name || "";

      // Try to find existing task by ghl_opportunity_id
      const { data: existingTask } = await app
        .from("atrisk_tasks")
        .select("id, stage")
        .eq("ghl_opportunity_id", oppId)
        .maybeSingle();

      if (existingTask) {
        // Update stage if different
        if (existingTask.stage !== appStage) {
          await app
            .from("atrisk_tasks")
            .update({ stage: appStage })
            .eq("id", existingTask.id);

          // Log the transition
          await app.from("atrisk_stage_history").insert({
            task_id: existingTask.id,
            from_stage: existingTask.stage,
            to_stage: appStage,
            source: "ghl",
          });
        }
        imported++;
        continue;
      }

      // No existing task — try to match by contact to an existing task
      if (contactId) {
        const { data: taskByContact } = await app
          .from("atrisk_tasks")
          .select("id, stage")
          .eq("ghl_contact_id", contactId)
          .maybeSingle();

        if (taskByContact) {
          // Link the opportunity and update stage
          await app
            .from("atrisk_tasks")
            .update({
              ghl_opportunity_id: oppId,
              stage: appStage,
            })
            .eq("id", taskByContact.id);

          if (taskByContact.stage !== appStage) {
            await app.from("atrisk_stage_history").insert({
              task_id: taskByContact.id,
              from_stage: taskByContact.stage,
              to_stage: appStage,
              source: "ghl",
            });
          }
          imported++;
          continue;
        }
      }

      // No match found — create a new task from GHL data
      const { data: newTask } = await app
        .from("atrisk_tasks")
        .insert({
          agency_id,
          stage: appStage,
          ghl_contact_id: contactId || null,
          ghl_opportunity_id: oppId,
          policy_number: oppName.replace(/^At-Risk:\s*/i, "").trim() || null,
          source: "ghl",
        })
        .select("id")
        .maybeSingle();

      if (newTask) {
        await app.from("atrisk_stage_history").insert({
          task_id: newTask.id,
          from_stage: null,
          to_stage: appStage,
          source: "ghl",
        });
        imported++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      errors.push(`${opp.id}: ${err.message}`);
    }
  }

  return json({
    success: true,
    imported,
    skipped,
    total: opportunities.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const action = body.action || "push";

    switch (action) {
      case "push":
        return await handlePush(body);
      case "seed":
        return await handleSeed(body);
      case "import":
        return await handleImport(body);
      case "status": {
        const config = await getAgencyGhlConfig(body.agency_id);
        return json({ enabled: !!config, config: config ? { locationId: config.locationId } : null });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("atrisk-ghl-push error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
