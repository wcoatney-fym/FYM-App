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
 *   - push:              Push a single stage change to GHL
 *   - seed:              One-time seed of all current app pipeline state → GHL (on opt-in)
 *   - import:            One-time pull of GHL pipeline state → App (initial sync on enable)
 *   - status:            Check GHL connection status for an agency
 *   - resolve_direction: Detect sync direction (app→ghl or ghl→app) without executing.
 *                        Returns recommendation + counts for CRM team manual review.
 *   - create_sync_task:  Create a cc_tasks entry in the portal DB for CRM team to
 *                        manually confirm sync direction before enabling pipeline.
 *   - execute_sync:      Execute the confirmed sync direction (seed or import) and
 *                        flip manager_pipeline_enabled to true. Called after CRM team
 *                        confirms direction via the task board.
 *
 * Auth: Requires FYM App authenticated session.
 * Secrets: CONTRACTING_SUPABASE_URL, CONTRACTING_SUPABASE_ANON_KEY (portal DB access),
 *          plus per-agency GHL API keys from agency_ghl_configs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createProdConnection, toTitleCase, FYM_MGA_WN } from "../_shared/prod-db.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const SUPPRESSION_TAG = "app | manager pipeline trigger";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "https://www.agency.teamfym.com",
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

function json(data: unknown, status = 200, request?: Request | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS(request), "Content-Type": "application/json" },
  });
}

/** Create Supabase client for FYM App DB (rcbzag) */
function getAppClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// Per-agency GHL API key fallback map (env var → location ID)
// Used when the key stored in agency_ghl_configs lacks pipeline/opportunities scope.
// These are the CRM Ops API keys set as edge function secrets.
const AGENCY_API_FALLBACK: Record<string, { envKey: string; locationId: string }> = {
  "FYM": { envKey: "CRM_OPS_FYM_AGENCY_API", locationId: "YM9XmCanfO6p28b1sQOH" },
  "Wisechoice": { envKey: "CRM_OPS_WISECHOICE_AGENCY_API", locationId: "I7Mw22ovq7fPgJWV5eWL" },
  "Aspire": { envKey: "CRM_OPS_ASPIRE_AGENCY_API", locationId: "MrRGbMxuEFqc6y00tr5A" },
  "MHA (IFG)": { envKey: "CRM_OPS_MHA_IFG_AGENCY_API", locationId: "W2d8rLlhu7zchstuX3m9" },
  "MHA (YFMO)": { envKey: "CRM_OPS_MHA_YFMO_AGENCY_API", locationId: "OAd1PnliebjgodpEGuCI" },
  "360 Insurance": { envKey: "CRM_OPS_360_INSURANCE_AGENCY_API", locationId: "Uc3AEjz4qy9D672Q4IsC" },
};

/** Create Supabase client for Portal DB (akhojh) — uses service key to bypass RLS */
function getPortalClient() {
  const url = Deno.env.get("CONTRACTING_SUPABASE_URL");
  // Prefer service key (bypasses RLS on agency_ghl_configs which requires auth.uid())
  const key = Deno.env.get("CONTRACTING_SUPABASE_SERVICE_KEY") || Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Missing CONTRACTING_SUPABASE_URL or CONTRACTING_SUPABASE_SERVICE_KEY");
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
    .select("id, name, ghl_api_enabled")
    .eq("id", agencyId)
    .maybeSingle();

  if (!agency?.ghl_api_enabled) {
    return null; // GHL not enabled for this agency
  }

  // Get the GHL config
  const { data: config } = await portal
    .from("agency_ghl_configs")
    .select("ghl_api_key, ghl_location_id, connection_status, manager_pipeline_enabled")
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!config || config.connection_status !== "connected") {
    return null;
  }

  // Try CRM Ops API key fallback if the stored key is missing or known to lack scope
  let apiKey = config.ghl_api_key;
  let locationId = config.ghl_location_id;

  if (agency.name) {
    const fallback = AGENCY_API_FALLBACK[agency.name];
    if (fallback) {
      const envKey = Deno.env.get(fallback.envKey);
      if (envKey) {
        apiKey = envKey;
        locationId = fallback.locationId;
      }
    }
  }

  if (!apiKey) return null;

  return {
    apiKey,
    locationId,
    managerPipelineEnabled: !!config.manager_pipeline_enabled,
    agencyName: agency.name || null,
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

  // Look for existing at-risk pipeline — prefer exact name match, then fuzzy
  const PREFERRED_NAME = "At-Risk Pipeline";
  const FALLBACK_NAMES = [
    "Manager Pipeline",
    "Ancillary | At Risk Pipeline",
    "Ancillary At Risk Pipeline",
  ];

  // Exact match first
  const exactMatch = pipelines.find((p: any) => p.name === PREFERRED_NAME);
  if (exactMatch) return exactMatch;

  // Fallback to known alternate names
  const fallbackMatch = pipelines.find(
    (p: any) => FALLBACK_NAMES.includes(p.name) ||
      p.name.toLowerCase().includes("at risk") ||
      p.name.toLowerCase().includes("at-risk")
  );
  if (fallbackMatch) return fallbackMatch;

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

  // Gate: manager_pipeline_enabled must be true for live pushes.
  // Pipeline stays disabled until CRM team confirms sync direction.
  // Internal calls from handleSeed/handleExecuteSync pass _bypass_gate
  // to skip this check (they run before the pipeline is enabled).
  if (!ghlConfig.managerPipelineEnabled && !body._bypass_gate) {
    return json({
      success: true,
      skipped: true,
      reason: "Manager pipeline not yet enabled — awaiting CRM team sync confirmation",
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

// ── Seed handler (one-time push of at-risk policies → GHL on opt-in) ────────
//
// Two-phase seed:
//   Phase 1: If atrisk_tasks exist for this agency, push them to GHL (existing flow).
//   Phase 2: If atrisk_tasks are empty, pull at-risk policies from Max's prod DB,
//            match to existing GHL contacts/opportunities, create atrisk_tasks with
//            real policy numbers, and link to GHL. This is the initial seed.
//
// The seed is one-time per agency. After the seed, two-way sync is ongoing.

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
  const { apiKey, locationId } = ghlConfig;

  // Check if tasks already exist for this agency
  const { count: existingCount } = await app
    .from("atrisk_tasks")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agency_id);

  if (existingCount && existingCount > 0) {
    // Phase 1: Push existing tasks to GHL
    return await handleSeedExistingTasks(app, agency_id, ghlConfig, body._bypass_gate);
  }

  // Phase 2: Pull at-risk policies from Max's DB and seed both App + GHL
  return await handleSeedFromProd(app, agency_id, ghlConfig, body._bypass_gate);
}

/** Phase 1: Push existing atrisk_tasks to GHL */
async function handleSeedExistingTasks(
  app: ReturnType<typeof getAppClient>,
  agency_id: string,
  ghlConfig: { apiKey: string; locationId: string },
  bypassGate: boolean
): Promise<Response> {
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
        _bypass_gate: true,
      });

      const pushResult = await result.json();
      if (pushResult.success && !pushResult.skipped) seeded++;
      else skipped++;
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

/** Phase 2: Pull at-risk policies from Max's DB, match GHL contacts, create tasks + push */
async function handleSeedFromProd(
  app: ReturnType<typeof getAppClient>,
  agency_id: string,
  ghlConfig: { apiKey: string; locationId: string },
  bypassGate: boolean
): Promise<Response> {
  const { apiKey, locationId } = ghlConfig;

  // 1. Get the agency's writing number from the portal DB
  const portal = getPortalClient();
  const { data: agencyRow } = await portal
    .from("hierarchy_agencies")
    .select("unl_writing_number, name")
    .eq("id", agency_id)
    .maybeSingle();

  const agencyWn = agencyRow?.unl_writing_number?.trim() || null;
  const agencyName = agencyRow?.name || "Unknown";
  const isFymDirect = !agencyWn || agencyName.toUpperCase() === "FYM";

  // 2. Query Max's DB for at-risk policies for this agency
  let sql: ReturnType<typeof createProdConnection> | null = null;
  let atRiskPolicies: Array<{
    policy_nbr: string;
    first_name: string;
    last_name: string;
    client_name: string;
    annual_premium: number;
    plan_code: string;
  }> = [];

  try {
    sql = createProdConnection();

    const agencyFilter = isFymDirect
      ? sql`(TRIM(ga) = ${FYM_MGA_WN} OR ga IS NULL OR TRIM(ga) = '')`
      : sql`TRIM(ga) = ${agencyWn}`;

    const rows = await sql`
      SELECT
        TRIM(policy_nbr) AS policy_nbr,
        TRIM(first_name) AS first_name,
        TRIM(last_name) AS last_name,
        annual_premium,
        TRIM(plan_code) AS plan_code,
        TRIM(cntrct_code) AS cntrct_code
      FROM typed.unl_fym_policy_latest_load
      WHERE at_risk_policy = true
        AND term_date IS NULL
        AND cntrct_code = 'A'
        AND ${agencyFilter}
      ORDER BY policy_nbr
    `;

    for (const r of rows) {
      const fn = (r.first_name as string || "").trim();
      const ln = (r.last_name as string || "").trim();
      atRiskPolicies.push({
        policy_nbr: (r.policy_nbr as string).trim(),
        first_name: fn,
        last_name: ln,
        client_name: toTitleCase([fn, ln].filter(Boolean).join(" ")),
        annual_premium: Number(r.annual_premium) || 0,
        plan_code: (r.plan_code as string || "").trim(),
      });
    }
  } catch (err: any) {
    return json({ error: "Failed to query production DB" }, 500);
  } finally {
    if (sql) await sql.end().catch(() => {});
  }

  if (atRiskPolicies.length === 0) {
    return json({ success: true, seeded: 0, message: "No at-risk policies found for this agency" });
  }

  // 3. Get the at-risk pipeline and all existing GHL opportunities
  const pipeline = await getOrCreatePipeline(apiKey, locationId);
  const pipelineId = pipeline.id;
  const stages = pipeline.stages || [];

  // Build name → GHL opportunity lookup from existing pipeline data
  const ghlOppsByName = new Map<string, { id: string; contactId: string; stageName: string; stageId: string }>();

  for (const stage of stages) {
    let startAfter = "";
    let stageHasMore = true;

    while (stageHasMore) {
      const params = new URLSearchParams({
        location_id: locationId!,
        pipeline_id: pipelineId,
        pipeline_stage_id: stage.id,
        limit: "100",
      });
      if (startAfter) params.set("startAfter", startAfter);

      const res = await fetch(
        `https://services.leadconnectorhq.com/opportunities/search?${params}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) break;

      const data = await res.json();
      const batch = data.opportunities || [];
      for (const opp of batch) {
        const contactName = opp.contact?.name || opp.name?.split("|")[0]?.trim() || "";
        const normalized = contactName.replace(/\s+/g, " ").trim().toLowerCase();
        if (normalized) {
          ghlOppsByName.set(normalized, {
            id: opp.id,
            contactId: opp.contactId || opp.contact?.id || "",
            stageName: stage.name,
            stageId: stage.id,
          });
        }
      }
      if (batch.length < 100 || !data.meta?.nextPageUrl) {
        stageHasMore = false;
      } else {
        startAfter = batch[batch.length - 1].id;
      }
    }
  }

  // Build stage name → app stage key reverse map
  const stageNameToAppKey: Record<string, string> = {};
  for (const [appKey, ghlName] of Object.entries(STAGE_MAP)) {
    stageNameToAppKey[ghlName.toLowerCase()] = appKey;
  }
  // Add aliases for pipe-separated naming
  for (const [alias, appKey] of Object.entries(REVERSE_STAGE_MAP)) {
    stageNameToAppKey[alias] = appKey;
  }

  // 4. For each at-risk policy: create atrisk_task, link to GHL
  let seeded = 0;
  let matched = 0;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const policy of atRiskPolicies) {
    try {
      const normalizedName = policy.client_name.replace(/\s+/g, " ").trim().toLowerCase();
      const ghlMatch = ghlOppsByName.get(normalizedName);

      let taskStage = "new";
      let ghlContactId: string | null = null;
      let ghlOpportunityId: string | null = null;

      if (ghlMatch) {
        // Found existing GHL opportunity — preserve its stage
        const appStage = stageNameToAppKey[ghlMatch.stageName.toLowerCase()];
        taskStage = appStage || "new";
        ghlContactId = ghlMatch.contactId;
        ghlOpportunityId = ghlMatch.id;
        matched++;
      }

      // Create atrisk_task with real policy number
      const monthlyPremium = Math.round((policy.annual_premium / 12) * 100) / 100;
      const { data: newTask, error: insertErr } = await app
        .from("atrisk_tasks")
        .insert({
          agency_id,
          policy_number: policy.policy_nbr,
          stage: taskStage,
          status: taskStage as any,
          priority: "normal",
          flag_type: "at_risk",
          ghl_contact_id: ghlContactId,
          ghl_opportunity_id: ghlOpportunityId,
        })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        errors.push(`${policy.policy_nbr}: ${insertErr.message}`);
        skipped++;
        continue;
      }

      if (!newTask) {
        skipped++;
        continue;
      }

      // Log stage entry
      await app.from("atrisk_stage_history").insert({
        task_id: newTask.id,
        from_stage: null,
        to_stage: taskStage,
        source: ghlMatch ? "ghl" : "seed",
      });

      // If no GHL match, push to GHL to create opportunity
      if (!ghlMatch) {
        try {
          const pushResult = await handlePush({
            policy_number: policy.policy_nbr,
            agency_id,
            new_stage: taskStage,
            client_name: policy.client_name,
            plan_premium: monthlyPremium,
            ghl_contact_id: null,
            ghl_opportunity_id: null,
            task_id: newTask.id,
            _bypass_gate: true,
          });
          const pushBody = await pushResult.json();
          if (pushBody.success) created++;
        } catch {
          // Non-fatal — task created, GHL push failed
        }
      }

      seeded++;
    } catch (err: any) {
      errors.push(`${policy.policy_nbr}: ${err.message}`);
      skipped++;
    }
  }

  return json({
    success: true,
    seeded,
    matched_ghl: matched,
    created_ghl: created,
    skipped,
    total: atRiskPolicies.length,
    ghl_existing: ghlOppsByName.size,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}

// ── Import handler (one-time pull of GHL pipeline state → App) ──────────────

// Reverse map: GHL stage name (lowercased) → app stage key
// Built from STAGE_MAP + additional aliases for real pipeline naming variants
const REVERSE_STAGE_MAP: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(STAGE_MAP).map(([k, v]) => [v.toLowerCase(), k])
  ),
  // Handle "Ancillary | At Risk Pipeline" actual stage names
  "agent | outreach": "agent_outreach",
  "agent outreach": "agent_outreach",
  "manager | outreach": "manager_outreach",
  "manager outreach": "manager_outreach",
  "agent | saved pending": "agent_saved_pending",
  "agent saved pending": "agent_saved_pending",
};

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

  // Fetch all opportunities from this pipeline (per-stage GET iteration)
  const opportunities: any[] = [];

  for (const stage of stages) {
    let startAfter = "";
    let stageHasMore = true;

    while (stageHasMore) {
      const params = new URLSearchParams({
        location_id: locationId!,
        pipeline_id: pipelineId,
        pipeline_stage_id: stage.id,
        limit: "100",
      });
      if (startAfter) params.set("startAfter", startAfter);

      const res = await fetch(
        `https://services.leadconnectorhq.com/opportunities/search?${params}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        return json({ error: `GHL opportunity search failed: ${res.status} ${errText}` }, 500);
      }

      const data = await res.json();
      const batch = data.opportunities || [];
      for (const opp of batch) {
        opp._stageName = stage.name;
      }
      opportunities.push(...batch);

      if (batch.length < 100 || !data.meta?.nextPageUrl) {
        stageHasMore = false;
      } else {
        startAfter = batch[batch.length - 1].id;
      }
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
      // policy_number is NOT NULL — use opp name or opp ID as fallback
      const policyNum = oppName.replace(/^At-Risk:\s*/i, "").trim() || oppId;
      const { data: newTask, error: insertErr } = await app
        .from("atrisk_tasks")
        .insert({
          agency_id,
          stage: appStage,
          ghl_contact_id: contactId || null,
          ghl_opportunity_id: oppId,
          policy_number: policyNum,
        })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        errors.push(`${oppId} insert: ${insertErr.message}`);
        skipped++;
        continue;
      }

      if (newTask) {
        await app.from("atrisk_stage_history").insert({
          task_id: newTask.id,
          from_stage: null,
          to_stage: appStage,
          source: "ghl",
        });
        imported++;
      } else {
        errors.push(`${oppId}: insert returned null`);
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

// ── Resolve direction handler ────────────────────────────────────────────────

/**
 * Detect sync direction for an agency without executing anything.
 *
 * Checks:
 *   1. App side: atrisk_tasks rows + atrisk_stage_history with source='app'
 *   2. GHL side: pipeline opportunity count + any non-"New" stages
 *
 * Returns one of:
 *   - app_to_ghl:  Agency has worked the App pipeline; seed App → GHL
 *   - ghl_to_app:  Agency has worked GHL; import GHL → App
 *   - conflict:    Both sides have worked state; needs manual decision
 *   - empty:       Neither side has data; no sync needed yet
 */
async function handleResolveDirection(body: any): Promise<Response> {
  const { agency_id } = body;
  if (!agency_id) {
    return json({ error: "Missing agency_id" }, 400);
  }

  // ── App side ───────────────────────────────────────────────────────
  const app = getAppClient();

  // Count tasks in atrisk_tasks for this agency
  const { count: appTaskCount } = await app
    .from("atrisk_tasks")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agency_id);

  // Count app-sourced stage transitions (human work done in the App)
  const { count: appWorkCount } = await app
    .from("atrisk_stage_history")
    .select("*", { count: "exact", head: true })
    .eq("source", "app")
    .in(
      "task_id",
      // subquery: get task IDs for this agency
      // Supabase JS doesn't support subqueries, so we do it in two steps
      [] // placeholder — handled below
    );

  // Actually: do the two-step approach
  let appWorkedCount = 0;
  if ((appTaskCount || 0) > 0) {
    // Get task IDs for this agency
    const { data: taskIds } = await app
      .from("atrisk_tasks")
      .select("id")
      .eq("agency_id", agency_id);

    if (taskIds && taskIds.length > 0) {
      const ids = taskIds.map((t: any) => t.id);
      // Count stage transitions with source='app' for these tasks
      const { count } = await app
        .from("atrisk_stage_history")
        .select("*", { count: "exact", head: true })
        .eq("source", "app")
        .in("task_id", ids);
      appWorkedCount = count || 0;
    }
  }

  // Count non-"new" tasks in app (someone moved them)
  const { count: appMovedCount } = await app
    .from("atrisk_tasks")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agency_id)
    .neq("stage", "new");

  const appHasWork = appWorkedCount > 0 || (appMovedCount || 0) > 0;

  // ── GHL side ──────────────────────────────────────────────────────
  let ghlTotal = 0;
  let ghlWorkedCount = 0;
  let ghlStageBreakdown: Record<string, number> = {};
  let ghlError: string | null = null;

  // Try to get GHL creds — use stored config or CRM Ops fallback keys
  // even if manager_pipeline_enabled is false (we're resolving BEFORE enabling)
  const portal = getPortalClient();
  const { data: config } = await portal
    .from("agency_ghl_configs")
    .select("ghl_api_key, ghl_location_id, connection_status")
    .eq("agency_id", agency_id)
    .maybeSingle();

  // Resolve credentials: prefer CRM Ops env key (has full scope), fall back to stored key
  let ghlApiKey = config?.ghl_api_key || null;
  let ghlLocationId = config?.ghl_location_id || null;

  // Look up agency name for fallback
  const { data: agencyRow } = await portal
    .from("hierarchy_agencies")
    .select("name")
    .eq("id", agency_id)
    .maybeSingle();

  if (agencyRow?.name) {
    const fallback = AGENCY_API_FALLBACK[agencyRow.name];
    if (fallback) {
      const envKey = Deno.env.get(fallback.envKey);
      if (envKey) {
        ghlApiKey = envKey;
        ghlLocationId = fallback.locationId;
      }
    }
  }

  if (ghlApiKey && ghlLocationId && (config?.connection_status === "connected" || ghlApiKey !== config?.ghl_api_key)) {
    try {
      const pipeline = await getOrCreatePipeline(ghlApiKey, ghlLocationId);
      const pipelineId = pipeline.id;
      const stages = pipeline.stages || [];

      // Build stage lookup
      const stageIdToName: Record<string, string> = {};
      for (const s of stages) {
        stageIdToName[s.id] = s.name;
      }

      // Fetch all opportunities from this pipeline via the search endpoint
      // GHL search POST body: { location_id, pipeline_id, ... } but the API
      // rejects snake_case and unknown fields. Use the pipelines/stages list
      // approach instead: iterate through stages and count per stage.
      const opportunities: any[] = [];

      for (const stage of stages) {
        let startAfter = "";
        let stageHasMore = true;

        while (stageHasMore) {
          const params = new URLSearchParams({
            location_id: ghlLocationId!,
            pipeline_id: pipelineId,
            pipeline_stage_id: stage.id,
            limit: "100",
          });
          if (startAfter) params.set("startAfter", startAfter);

          const res = await fetch(
            `https://services.leadconnectorhq.com/opportunities/search?${params}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${ghlApiKey}`,
                Version: "2021-07-28",
                Accept: "application/json",
              },
            }
          );

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            ghlError = `GHL API error: ${res.status} ${errText}`;
            stageHasMore = false;
            break;
          }

          const data = await res.json();
          const batch = data.opportunities || [];
          // Tag each opportunity with its stage name for breakdown
          for (const opp of batch) {
            opp._stageName = stage.name;
          }
          opportunities.push(...batch);

          if (batch.length < 100 || !data.meta?.nextPageUrl) {
            stageHasMore = false;
          } else {
            startAfter = batch[batch.length - 1].id;
          }
        }

        if (ghlError) break;
      }

      ghlTotal = opportunities.length;

      // Count non-"New" opportunities (someone moved them in GHL)
      for (const opp of opportunities) {
        const stageName = opp._stageName || stageIdToName[opp.pipelineStageId] || "Unknown";
        ghlStageBreakdown[stageName] = (ghlStageBreakdown[stageName] || 0) + 1;
        if (stageName.toLowerCase() !== "new") {
          ghlWorkedCount++;
        }
      }
    } catch (err: any) {
      ghlError = err.message;
    }
  } else {
    ghlError = "No GHL credentials configured or not connected";
  }

  const ghlHasWork = ghlWorkedCount > 0;

  // ── Determine direction ───────────────────────────────────────────
  let direction: "app_to_ghl" | "ghl_to_app" | "conflict" | "empty";
  let reason: string;

  if (appHasWork && ghlHasWork) {
    direction = "conflict";
    reason = `Both platforms have worked state. App: ${appWorkedCount} stage changes + ${appMovedCount || 0} moved tasks. GHL: ${ghlWorkedCount} non-New opportunities out of ${ghlTotal}. Manual review required.`;
  } else if (appHasWork && !ghlHasWork) {
    direction = "app_to_ghl";
    reason = `Agency has ${appWorkedCount} app stage changes and ${appMovedCount || 0} moved tasks. GHL has ${ghlTotal} total opportunities, all in New stage. Recommend seeding App → GHL.`;
  } else if (!appHasWork && ghlHasWork) {
    direction = "ghl_to_app";
    reason = `App has no worked pipeline state. GHL has ${ghlWorkedCount} non-New opportunities out of ${ghlTotal}. Recommend importing GHL → App.`;
  } else {
    direction = "empty";
    reason = `Neither platform has worked pipeline state. App tasks: ${appTaskCount || 0}. GHL opportunities: ${ghlTotal}. No sync needed — new at-risk policies will populate both sides once two-way sync is enabled.`;
  }

  return json({
    success: true,
    agency_id,
    direction,
    reason,
    app: {
      task_count: appTaskCount || 0,
      worked_stage_changes: appWorkedCount,
      moved_tasks: appMovedCount || 0,
      has_work: appHasWork,
    },
    ghl: {
      total_opportunities: ghlTotal,
      worked_opportunities: ghlWorkedCount,
      stage_breakdown: ghlStageBreakdown,
      has_work: ghlHasWork,
      error: ghlError,
    },
  });
}

// ── Create sync task handler ─────────────────────────────────────────────────

/**
 * Create a cc_tasks entry in the portal DB for CRM team review.
 *
 * Called after resolve_direction — bundles the detection results into a
 * task description so the CRM team can review and confirm the sync direction.
 *
 * The task source is 'flag' (system-generated) with skill_category 'retention'
 * and priority P2 (time-sensitive once the agency is onboarded).
 */
async function handleCreateSyncTask(body: any): Promise<Response> {
  const { agency_id, agency_name, direction_result } = body;
  if (!agency_id) {
    return json({ error: "Missing agency_id" }, 400);
  }

  const portal = getPortalClient();
  const name = agency_name || agency_id;

  // Check for duplicate — don't create if one already exists and is open
  const { data: existing } = await portal
    .from("cc_tasks")
    .select("id, status")
    .like("title", `%Pipeline Sync%${name}%`)
    .in("status", ["backlog", "todo", "in_progress", "review"])
    .maybeSingle();

  if (existing) {
    return json({
      success: true,
      skipped: true,
      reason: "A sync task already exists for this agency",
      task_id: existing.id,
    });
  }

  // Build task description — plain text (no markdown), with embedded agency_id for UI extraction
  const dir = direction_result;
  const dirLabel = dir?.direction === 'app_to_ghl' ? 'App → GHL'
    : dir?.direction === 'ghl_to_app' ? 'GHL → App'
    : dir?.direction === 'conflict' ? 'CONFLICT'
    : 'Empty (no data)';

  let description = `Sync Direction Review for ${name}\n`;
  description += `agency_id: ${agency_id}\n\n`;

  if (dir) {
    description += `DETECTED DIRECTION: ${dir.direction}\n`;
    description += `Recommendation: ${dirLabel}\n\n`;
    description += `Reason: ${dir.reason}\n\n`;
    description += `--- App Side ---\n`;
    description += `Tasks: ${dir.app?.task_count ?? 0}\n`;
    description += `Worked stage changes: ${dir.app?.worked_stage_changes ?? 0}\n`;
    description += `Moved tasks: ${dir.app?.moved_tasks ?? 0}\n\n`;
    description += `--- GHL Side ---\n`;
    description += `Total opportunities: ${dir.ghl?.total_opportunities ?? 0}\n`;
    description += `Worked (non-New): ${dir.ghl?.worked_opportunities ?? 0}\n`;

    if (dir.ghl?.stage_breakdown) {
      const stages = Object.entries(dir.ghl.stage_breakdown)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      description += `Stages: ${stages}\n`;
    }
    if (dir.ghl?.error) {
      description += `⚠ GHL error: ${dir.ghl.error}\n`;
    }

    description += `\n--- Action ---\n`;
    switch (dir.direction) {
      case "app_to_ghl":
        description += `Click "Confirm & Sync App → GHL" below to seed App data into GHL and enable two-way sync.`;
        break;
      case "ghl_to_app":
        description += `Click "Confirm & Sync GHL → App" below to import GHL data into the App and enable two-way sync.`;
        break;
      case "conflict":
        description += `Both platforms have worked state. Choose which direction to sync below — the other side's data will be overwritten.`;
        break;
      case "empty":
        description += `Click "Enable Two-Way Sync" below — new at-risk policies will populate both sides automatically.`;
        break;
    }
  } else {
    description += `Direction detection was not available. Use the sync buttons below to choose a direction manually.`;
  }

  // Insert the task
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insertError } = await portal
    .from("cc_tasks")
    .insert({
      id: taskId,
      title: `Pipeline Sync Direction — ${name}`,
      description,
      assignee_id: null, // Unassigned — CRM team picks it up
      source: "flag",
      skill_category: "retention",
      difficulty: 3,
      priority: dir?.direction === "conflict" ? "P1" : "P2",
      status: "todo",
      due_at: null,
      completed_at: null,
      on_time: null,
      reopened_count: 0,
      created_at: now,
    });

  if (insertError) {
    return json({ error: `Failed to create task: ${insertError.message}` }, 500);
  }

  return json({
    success: true,
    task_id: taskId,
    title: `Pipeline Sync Direction — ${name}`,
    direction: dir?.direction || "unknown",
  });
}

// ── Execute sync handler ──────────────────────────────────────────────────

/**
 * Execute the confirmed sync direction and enable the pipeline.
 *
 * Called by the CRM team after reviewing the sync task. Runs the
 * appropriate sync action (seed or import) then flips
 * manager_pipeline_enabled to true.
 *
 * Also marks the cc_tasks entry as done.
 */
async function handleExecuteSync(body: any): Promise<Response> {
  const { agency_id, direction, task_id } = body;
  if (!agency_id || !direction) {
    return json({ error: "Missing agency_id or direction" }, 400);
  }

  if (!['app_to_ghl', 'ghl_to_app', 'empty'].includes(direction)) {
    return json({ error: `Invalid direction: ${direction}. Must be app_to_ghl, ghl_to_app, or empty.` }, 400);
  }

  const portal = getPortalClient();
  const app = getAppClient();

  // Step 1: Execute the sync based on confirmed direction
  // Pass _bypass_gate: true — this runs BEFORE we flip manager_pipeline_enabled
  let syncResult: any = null;
  if (direction === 'app_to_ghl') {
    // Seed App → GHL
    const seedRes = await handleSeed({ agency_id, _bypass_gate: true });
    syncResult = await seedRes.json();
  } else if (direction === 'ghl_to_app') {
    // Import GHL → App
    const importRes = await handleImport({ agency_id, _bypass_gate: true });
    syncResult = await importRes.json();
  } else {
    // Empty — no sync needed, just enable
    syncResult = { success: true, message: "No data to sync — enabling two-way sync for new data" };
  }

  if (!syncResult?.success) {
    return json({
      error: "Sync execution failed",
      sync_result: syncResult,
    }, 500);
  }

  // Step 2: Flip manager_pipeline_enabled to true
  const { error: enableError } = await portal
    .from("agency_ghl_configs")
    .update({
      manager_pipeline_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("agency_id", agency_id);

  if (enableError) {
    return json({
      error: `Sync succeeded but failed to enable pipeline: ${enableError.message}`,
      sync_result: syncResult,
    }, 500);
  }

  // Step 3: Mark the cc_tasks entry as done (if provided)
  if (task_id) {
    const now = new Date().toISOString();
    await portal
      .from("cc_tasks")
      .update({
        status: "done",
        completed_at: now,
        on_time: true,
        updated_at: now,
      })
      .eq("id", task_id);
  }

  return json({
    success: true,
    direction,
    sync_result: syncResult,
    pipeline_enabled: true,
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS(req) });
  }

  // Auth gate — verify_jwt=true handles frontend callers (user session JWTs
  // validated by the gateway). Internal callers (atrisk-auto-expire) send
  // sb_secret_ on apikey header, which also passes verify_jwt=true.
  // This block is defense-in-depth: explicitly reject the leaked key and
  // require at least one credential even if verify_jwt config drifts.
  {
    const apiKey = req.headers.get("apikey") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const leakedJwt = Deno.env.get("SERVICE_ROLE_JWT") || "";

    // Block the leaked SERVICE_ROLE_JWT on any header
    if (leakedJwt && (apiKey === leakedJwt || bearerToken === leakedJwt)) {
      console.warn("[atrisk-ghl-push] REJECTED leaked SERVICE_ROLE_JWT");
      return new Response(
        JSON.stringify({ error: "Legacy JWT not authorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS(req) } }
      );
    }

    // Require at least one credential
    if (!apiKey && !bearerToken) {
      return new Response(
        JSON.stringify({ error: "Missing credentials" }),
        { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS(req) } }
      );
    }
  }

  try {
    const body = await req.json();
    const action = body.action || "push";

    switch (action) {
      case "push":
        return await handlePush(body);
      case "seed": {
        // Gate: external seed calls require pipeline to be enabled
        const seedConfig = await getAgencyGhlConfig(body.agency_id);
        if (seedConfig && !seedConfig.managerPipelineEnabled) {
          return json({
            success: true,
            skipped: true,
            reason: "Manager pipeline not yet enabled — awaiting CRM team sync confirmation",
          });
        }
        return await handleSeed(body);
      }
      case "import": {
        // Gate: external import calls require pipeline to be enabled
        const importConfig = await getAgencyGhlConfig(body.agency_id);
        if (importConfig && !importConfig.managerPipelineEnabled) {
          return json({
            success: true,
            skipped: true,
            reason: "Manager pipeline not yet enabled — awaiting CRM team sync confirmation",
          });
        }
        return await handleImport(body);
      }
      case "resolve_direction":
        return await handleResolveDirection(body);
      case "create_sync_task":
        return await handleCreateSyncTask(body);
      case "execute_sync":
        return await handleExecuteSync(body);
      case "status": {
        const config = await getAgencyGhlConfig(body.agency_id);
        return json({
          enabled: !!config,
          config: config ? {
            locationId: config.locationId,
            managerPipelineEnabled: config.managerPipelineEnabled,
          } : null,
        });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("atrisk-ghl-push error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
