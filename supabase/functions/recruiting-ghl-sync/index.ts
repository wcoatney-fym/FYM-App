/**
 * recruiting-ghl-sync — Sync recruiting pipeline from GHL
 *
 * Pulls contacts and opportunities from the GHL recruiting sub-account
 * (location e7yV92T56bkUoGqsge8K) and upserts into recruiting_leads.
 *
 * Stage mapping:
 *   - Lead: any contact in the location
 *   - Attendee: contact with tag "opps call | attended" or "hosp ind | opps call | attended"
 *   - Hired: opportunity in "Agent recruiting" pipeline at a Hired stage
 *   - Contracting/RTS/Producing: mapped from opportunity pipeline stages
 *
 * Token source: ghl_location_tokens in tracker DB (lryxx) — the OAuth callback
 * stores tokens there, and ghl-token-refresh keeps them alive.
 *
 * Auth: x-cron-auth header or Authorization: Bearer <service_role_key>
 *
 * Required secrets (set in rcbzag edge function secrets):
 *   - TRACKER_SUPABASE_URL    — tracker DB URL (for token reads)
 *   - TRACKER_SUPABASE_KEY    — tracker publishable key
 *   - APP_SUPABASE_URL        — rcbzag URL (auto: SUPABASE_URL)
 *   - APP_SUPABASE_SERVICE_KEY — rcbzag service key
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const RECRUITING_LOCATION_ID = "e7yV92T56bkUoGqsge8K";
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const RATE_LIMIT_DELAY_MS = 200; // Stay under GHL's 100 req/10s

// Attendance tags (case-insensitive matching)
// Actual GHL tags observed: "hosp ind | opp call | attended", "opps call | attended | self reported"
const ATTENDEE_TAGS = [
  "opps call | attended",
  "hosp ind | opps call | attended",
  "hosp ind | opp call | attended",
  "opps call | attended | self reported",
];

// Hired stage names in the "Agent recruiting" pipeline
const HIRED_STAGES = [
  "hip | career | hired",
  "hip | broker | hired",
  "hip | hired (auto send intake)",
  "hired",
];

// Full pipeline stage mapping (stage_name lowercase → recruiting_leads stage)
const PIPELINE_STAGE_MAP: Record<string, string> = {
  // Hired stages
  "hip | career | hired": "hired",
  "hip | broker | hired": "hired",
  "hip | hired (auto send intake)": "hired",
  "hired": "hired",
  // Contracting stages
  "contracting": "contracting",
  "hip | contracting": "contracting",
  // RTS stages
  "rts": "rts",
  "hip | rts": "rts",
  "ready to sell": "rts",
  // Producing stages
  "producing": "producing",
  "hip | producing": "producing",
  "active": "producing",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-cron-auth",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Get GHL access token from tracker DB ──────────────────────────────────
async function getGhlToken(trackerUrl: string, trackerKey: string): Promise<string | null> {
  const tracker = createClient(trackerUrl, trackerKey);
  const { data, error } = await tracker
    .from("ghl_location_tokens")
    .select("access_token, expires_at")
    .eq("location_id", RECRUITING_LOCATION_ID)
    .single();

  if (error || !data) {
    console.error(`[recruiting-ghl-sync] Token fetch error: ${error?.message || "no data"}`);
    return null;
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    console.error(`[recruiting-ghl-sync] Token expired at ${data.expires_at}`);
    return null;
  }

  return data.access_token;
}

// ── GHL API helpers ───────────────────────────────────────────────────────

interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded?: string;
  customFields?: Array<{ id: string; value: unknown }>;
}

interface GhlOpportunity {
  id: string;
  name: string;
  contact?: { id: string; name?: string; email?: string; phone?: string };
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  dateAdded?: string;
  lastStageChangeAt?: string;
  monetaryValue?: number;
}

interface GhlPipelineStage {
  id: string;
  name: string;
}

interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlPipelineStage[];
}

async function ghlFetch<T>(path: string, token: string, params?: Record<string, string>): Promise<T | null> {
  const url = new URL(`${GHL_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  // Contacts API uses "locationId", Opportunities API uses "location_id"
  if (!url.searchParams.has("location_id") && !url.searchParams.has("locationId")) {
    url.searchParams.set("locationId", RECRUITING_LOCATION_ID);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[recruiting-ghl-sync] GHL ${path} ${res.status}: ${body.substring(0, 300)}`);
    return null;
  }

  return res.json();
}

// Paginate through all contacts
async function fetchAllContacts(token: string): Promise<GhlContact[]> {
  const contacts: GhlContact[] = [];
  let startAfterId: string | undefined;
  let page = 0;
  const limit = 100;

  while (true) {
    page++;
    const params: Record<string, string> = {
      locationId: RECRUITING_LOCATION_ID,
      limit: String(limit),
    };
    if (startAfterId) params.startAfterId = startAfterId;

    const result = await ghlFetch<{ contacts: GhlContact[]; meta?: { startAfterId?: string; total?: number; nextPageUrl?: string } }>(
      "/contacts/",
      token,
      params,
    );

    if (!result?.contacts?.length) break;
    contacts.push(...result.contacts);

    console.log(`[recruiting-ghl-sync] Fetched page ${page}: ${result.contacts.length} contacts (total so far: ${contacts.length})`);

    // GHL v2 cursor-based pagination
    const nextId = result.meta?.startAfterId || result.contacts[result.contacts.length - 1]?.id;
    if (!nextId || result.contacts.length < limit) break;
    startAfterId = nextId;

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return contacts;
}

// Fetch pipelines to get stage name → id mapping
async function fetchPipelines(token: string): Promise<GhlPipeline[]> {
  const result = await ghlFetch<{ pipelines: GhlPipeline[] }>("/opportunities/pipelines", token);
  return result?.pipelines ?? [];
}

// Fetch opportunities from the recruiting pipeline
async function fetchOpportunities(token: string, pipelineId: string): Promise<GhlOpportunity[]> {
  const opportunities: GhlOpportunity[] = [];
  let startAfterId: string | undefined;
  let page = 0;
  const limit = 100;

  while (true) {
    page++;
    const params: Record<string, string> = {
      location_id: RECRUITING_LOCATION_ID,
      limit: String(limit),
      pipeline_id: pipelineId,
    };
    if (startAfterId) params.startAfterId = startAfterId;

    const result = await ghlFetch<{ opportunities: GhlOpportunity[]; meta?: { startAfterId?: string; total?: number } }>(
      "/opportunities/search",
      token,
      params,
    );

    if (!result?.opportunities?.length) break;
    opportunities.push(...result.opportunities);

    console.log(`[recruiting-ghl-sync] Fetched page ${page}: ${result.opportunities.length} opps (total so far: ${opportunities.length})`);

    const nextId = result.meta?.startAfterId || result.opportunities[result.opportunities.length - 1]?.id;
    if (!nextId || result.opportunities.length < limit) break;
    startAfterId = nextId;

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return opportunities;
}

// ── Main sync logic ───────────────────────────────────────────────────────

interface SyncResult {
  contactsFetched: number;
  opportunitiesFetched: number;
  leadsUpserted: number;
  attendeesFound: number;
  hiredFound: number;
  errors: string[];
}

async function syncRecruitingData(token: string, appUrl: string, appServiceKey: string): Promise<SyncResult> {
  const result: SyncResult = {
    contactsFetched: 0,
    opportunitiesFetched: 0,
    leadsUpserted: 0,
    attendeesFound: 0,
    hiredFound: 0,
    errors: [],
  };

  const appDb = createClient(appUrl, appServiceKey);

  // 1. Fetch all contacts from the recruiting location
  console.log("[recruiting-ghl-sync] Fetching contacts...");
  const contacts = await fetchAllContacts(token);
  result.contactsFetched = contacts.length;
  console.log(`[recruiting-ghl-sync] Total contacts: ${contacts.length}`);

  // 2. Fetch pipelines to find "Agent recruiting" pipeline
  console.log("[recruiting-ghl-sync] Fetching pipelines...");
  const pipelines = await fetchPipelines(token);
  const recruitingPipeline = pipelines.find(
    (p) => p.name.toLowerCase().includes("agent recruiting") || p.name.toLowerCase().includes("recruiting"),
  );

  // Build stage ID → stage name map
  const stageIdToName: Record<string, string> = {};
  if (recruitingPipeline) {
    for (const stage of recruitingPipeline.stages) {
      stageIdToName[stage.id] = stage.name;
    }
    console.log(`[recruiting-ghl-sync] Found pipeline "${recruitingPipeline.name}" with ${recruitingPipeline.stages.length} stages`);
  } else {
    console.warn("[recruiting-ghl-sync] No recruiting pipeline found — will use contacts only");
  }

  // 3. Fetch opportunities from recruiting pipeline
  let opportunities: GhlOpportunity[] = [];
  if (recruitingPipeline) {
    console.log("[recruiting-ghl-sync] Fetching opportunities...");
    opportunities = await fetchOpportunities(token, recruitingPipeline.id);
    result.opportunitiesFetched = opportunities.length;
    console.log(`[recruiting-ghl-sync] Total opportunities: ${opportunities.length}`);
  }

  // Build contact_id → opportunity mapping for stage enrichment
  const contactOpportunity = new Map<string, { stage: string; stageName: string; dateAdded?: string; lastStageChangeAt?: string }>();
  for (const opp of opportunities) {
    // GHL returns contactId at top level, not nested contact.id
    const contactId = (opp as unknown as { contactId?: string }).contactId || opp.contact?.id;
    if (!contactId) continue;

    const stageName = stageIdToName[opp.pipelineStageId] || "";
    const mappedStage = PIPELINE_STAGE_MAP[stageName.toLowerCase()];

    if (mappedStage) {
      // If contact already has a mapping, use the more advanced stage
      const existing = contactOpportunity.get(contactId);
      const stageOrder = ["lead", "attendee", "hired", "contracting", "rts", "producing"];
      if (!existing || stageOrder.indexOf(mappedStage) > stageOrder.indexOf(existing.stage)) {
        contactOpportunity.set(contactId, {
          stage: mappedStage,
          stageName,
          dateAdded: opp.dateAdded,
          lastStageChangeAt: opp.lastStageChangeAt,
        });
      }
    }
  }

  // 4. Build upsert rows
  const rows: Array<{
    ghl_contact_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    stage: string;
    lead_at: string;
    attendee_at: string | null;
    hired_at: string | null;
    contracting_at: string | null;
    rts_at: string | null;
    producing_at: string | null;
    updated_at: string;
  }> = [];

  const now = new Date().toISOString();

  for (const contact of contacts) {
    const name = contact.name
      || [contact.firstName, contact.lastName].filter(Boolean).join(" ")
      || "Unknown";
    const tags = (contact.tags || []).map((t) => t.toLowerCase());
    const isAttendee = tags.some((t) => ATTENDEE_TAGS.includes(t));
    const oppData = contactOpportunity.get(contact.id);

    // Determine stage
    let stage = "lead";
    if (oppData) {
      stage = oppData.stage;
    } else if (isAttendee) {
      stage = "attendee";
    }

    if (isAttendee) result.attendeesFound++;
    if (oppData && ["hired", "contracting", "rts", "producing"].includes(oppData.stage)) {
      result.hiredFound++;
    }

    const leadAt = contact.dateAdded || now;

    // For stage timestamps, we use lastStageChangeAt from the opportunity if available
    // Otherwise we only know the current stage, not when they entered it
    const stageOrder = ["lead", "attendee", "hired", "contracting", "rts", "producing"];
    const stageIdx = stageOrder.indexOf(stage);

    rows.push({
      ghl_contact_id: contact.id,
      name,
      email: contact.email || null,
      phone: contact.phone || null,
      stage,
      lead_at: leadAt,
      attendee_at: stageIdx >= 1 ? (oppData?.lastStageChangeAt || leadAt) : null,
      hired_at: stageIdx >= 2 ? (oppData?.lastStageChangeAt || leadAt) : null,
      contracting_at: stageIdx >= 3 ? (oppData?.lastStageChangeAt || leadAt) : null,
      rts_at: stageIdx >= 4 ? (oppData?.lastStageChangeAt || leadAt) : null,
      producing_at: stageIdx >= 5 ? (oppData?.lastStageChangeAt || leadAt) : null,
      updated_at: now,
    });
  }

  // 5. Upsert in batches
  const BATCH_SIZE = 50;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await appDb
      .from("recruiting_leads")
      .upsert(batch, {
        onConflict: "ghl_contact_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[recruiting-ghl-sync] Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`);
      result.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      upserted += batch.length;
    }
  }

  result.leadsUpserted = upserted;
  return result;
}

// ── HTTP handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Auth check
  const cronAuth = req.headers.get("x-cron-auth");
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY");

  if (!cronAuth && authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Load config
  const trackerUrl = Deno.env.get("TRACKER_SUPABASE_URL");
  // RLS policy added on ghl_location_tokens to allow reads with publishable key
  const trackerKey = Deno.env.get("TRACKER_SUPABASE_KEY");
  const appUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("APP_SUPABASE_URL");
  const appServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY");

  if (!trackerUrl || !trackerKey) {
    console.error("[recruiting-ghl-sync] Missing TRACKER_SUPABASE_URL or TRACKER_SUPABASE_KEY");
    return jsonResponse({ error: "Missing tracker config" }, 500);
  }
  if (!appUrl || !appServiceKey) {
    console.error("[recruiting-ghl-sync] Missing APP_SUPABASE_URL or APP_SUPABASE_SERVICE_KEY");
    return jsonResponse({ error: "Missing app config" }, 500);
  }

  // Get GHL token
  console.log("[recruiting-ghl-sync] Fetching GHL token...");
  const ghlToken = await getGhlToken(trackerUrl, trackerKey);
  if (!ghlToken) {
    return jsonResponse({
      error: "No valid GHL token for recruiting location",
      hint: "Install the OAuth app on the recruiting sub-account (e7yV92T56bkUoGqsge8K)",
    }, 503);
  }

  console.log("[recruiting-ghl-sync] Token acquired — starting sync...");
  const startTime = Date.now();

  try {
    const result = await syncRecruitingData(ghlToken, appUrl, appServiceKey);
    const durationMs = Date.now() - startTime;

    console.log(`[recruiting-ghl-sync] ✅ Sync complete in ${durationMs}ms — ${result.leadsUpserted} leads upserted, ${result.attendeesFound} attendees, ${result.hiredFound} hired`);

    return jsonResponse({
      success: true,
      ...result,
      durationMs,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[recruiting-ghl-sync] Fatal error: ${err}`);
    return jsonResponse({ error: String(err) }, 500);
  }
});
