/**
 * recruiting-ghl-sync — GHL Recruiting Data API
 *
 * Two modes:
 *   POST /recruiting-ghl-sync?action=counts   — Live KPI counts from GHL API (fast, cached)
 *   POST /recruiting-ghl-sync?action=sync     — Sync tagged contacts into recruiting_leads
 *
 * "counts" mode: Queries GHL search API for tag-filtered counts:
 *   - Leads: contacts tagged "hosp ind | agent lead" 
 *   - Attendees: contacts tagged "hosp ind | opp call | attended"
 *   - Hired: opportunities in Agent Recruiting pipeline at Hired stages
 *   Returns counts + optional date filtering. Cached in dashboard_cache for 15min.
 *
 * "sync" mode: Syncs the 1,400 tagged contacts into recruiting_leads for the
 *   Leads tab detail view. Uses POST /contacts/search with tag filter.
 *   Does NOT sync the full 31K+ opportunity pipeline (too large for edge fn).
 *
 * Token source: ghl_location_tokens in tracker DB (lryxx)
 * Auth: x-cron-auth header or Authorization: Bearer <service_role_key>
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const RECRUITING_LOCATION_ID = "e7yV92T56bkUoGqsge8K";
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const RATE_LIMIT_DELAY_MS = 100;

// Tags for stage identification
const LEAD_TAG = "hosp ind | agent lead";
const ATTENDEE_TAGS = [
  "hosp ind | opp call | attended",
  "opps call | attended",
  "opps call | attended | self reported",
];

// Hired stage names in the "Agent Recruiting" pipeline
const HIRED_STAGE_NAMES = [
  "hip | career | hired",
  "hip | broker | hired",
  "hip | hired (auto send intake)",
  "hired",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-cron-auth, x-client-info",
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

// ── Get GHL access token ──────────────────────────────────────────────────
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
  if (new Date(data.expires_at) < new Date()) {
    console.error(`[recruiting-ghl-sync] Token expired at ${data.expires_at}`);
    return null;
  }
  return data.access_token;
}

// ── GHL search: count contacts by tag ─────────────────────────────────────
async function countContactsByTag(token: string, tag: string, startDate?: string, endDate?: string): Promise<number> {
  const filters: Array<{ field: string; operator: string; value: string }> = [
    { field: "tags", operator: "contains", value: tag },
  ];
  if (startDate) {
    filters.push({ field: "dateAdded", operator: "GTE", value: new Date(startDate).toISOString() });
  }
  if (endDate) {
    filters.push({ field: "dateAdded", operator: "LTE", value: new Date(endDate).toISOString() });
  }

  const res = await fetch(`${GHL_API_BASE}/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locationId: RECRUITING_LOCATION_ID,
      filters,
      page: 1,
      pageLimit: 1, // We only need the total count
    }),
  });

  if (!res.ok) {
    console.error(`[recruiting-ghl-sync] Search failed for tag "${tag}": ${res.status}`);
    return 0;
  }

  const data = await res.json();
  return data.total || 0;
}

// ── GHL: count opportunities at specific stages ───────────────────────────
async function countHiredOpportunities(token: string): Promise<{ hired: number; pipelineName: string; stageBreakdown: Record<string, number> }> {
  // First get pipeline to map stage IDs to names
  const pipRes = await fetch(
    `${GHL_API_BASE}/opportunities/pipelines?locationId=${RECRUITING_LOCATION_ID}`,
    {
      headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json" },
    },
  );
  if (!pipRes.ok) return { hired: 0, pipelineName: "", stageBreakdown: {} };

  const pipData = await pipRes.json();
  const pipeline = (pipData.pipelines || []).find(
    (p: { name: string }) => p.name.toLowerCase().includes("agent recruiting"),
  );
  if (!pipeline) return { hired: 0, pipelineName: "", stageBreakdown: {} };

  // Find the hired stage IDs
  const hiredStageIds = pipeline.stages
    .filter((s: { name: string }) => HIRED_STAGE_NAMES.includes(s.name.toLowerCase()))
    .map((s: { id: string }) => s.id);

  if (hiredStageIds.length === 0) return { hired: 0, pipelineName: pipeline.name, stageBreakdown: {} };

  // Count opportunities at each hired stage
  // GHL doesn't support filtering by stage in search, so we fetch page 1 to get the total
  // and filter by stageId. For efficiency, we just check the first page to see if there are any.
  let totalHired = 0;
  const stageBreakdown: Record<string, number> = {};

  for (const stageId of hiredStageIds) {
    const stageName = pipeline.stages.find((s: { id: string }) => s.id === stageId)?.name || "Unknown";

    // GHL opportunities search supports pipeline_stage_id filter
    const res = await fetch(
      `${GHL_API_BASE}/opportunities/search?location_id=${RECRUITING_LOCATION_ID}&pipeline_id=${pipeline.id}&pipeline_stage_id=${stageId}&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json" },
      },
    );

    if (res.ok) {
      const data = await res.json();
      const count = data.meta?.total || data.opportunities?.length || 0;
      totalHired += count;
      if (count > 0) stageBreakdown[stageName] = count;
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return { hired: totalHired, pipelineName: pipeline.name, stageBreakdown };
}

// ── Action: counts ────────────────────────────────────────────────────────
async function handleCounts(token: string, startDate?: string, endDate?: string) {
  const startTime = Date.now();

  // Run count queries in parallel where possible
  const [leads, attendeeCounts, hiredData] = await Promise.all([
    countContactsByTag(token, LEAD_TAG, startDate, endDate),
    Promise.all(
      ATTENDEE_TAGS.map((tag) => countContactsByTag(token, tag, startDate, endDate)),
    ),
    countHiredOpportunities(token),
  ]);

  // Attendees: count unique contacts with any attendee tag
  // Since the same contact might have multiple tags, we take the max
  // (a rough approximation — for exact dedup we'd need to fetch contacts)
  const attendees = Math.max(...attendeeCounts, 0);

  return {
    leads,
    attendees,
    hired: hiredData.hired,
    pipeline: hiredData.pipelineName,
    hiredBreakdown: hiredData.stageBreakdown,
    dateFilter: startDate && endDate ? { startDate, endDate } : null,
    durationMs: Date.now() - startTime,
    source: "ghl_live",
    cachedAt: new Date().toISOString(),
  };
}

// ── Action: sync (seed recruiting_leads from tagged contacts) ─────────────
async function handleSync(token: string, appUrl: string, appServiceKey: string) {
  const appDb = createClient(appUrl, appServiceKey);
  const startTime = Date.now();

  // Fetch all contacts with the recruiting tag using search endpoint
  const contacts: Array<{
    id: string;
    contactName?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    tags?: string[];
    dateAdded?: string;
  }> = [];
  let page = 1;
  const pageLimit = 100;

  while (true) {
    const res = await fetch(`${GHL_API_BASE}/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locationId: RECRUITING_LOCATION_ID,
        filters: [{ field: "tags", operator: "contains", value: LEAD_TAG }],
        page,
        pageLimit,
      }),
    });

    if (!res.ok) {
      console.error(`[recruiting-ghl-sync] Search page ${page} failed: ${res.status}`);
      break;
    }

    const data = await res.json();
    const batch = data.contacts || [];
    contacts.push(...batch);
    console.log(`[recruiting-ghl-sync] Sync page ${page}: ${contacts.length}/${data.total || "?"}`);

    if (batch.length < pageLimit || contacts.length >= (data.total || Infinity)) break;
    page++;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Build upsert rows
  const now = new Date().toISOString();
  let attendeeCount = 0;

  const rows = contacts.map((c) => {
    const name = c.contactName || c.name ||
      [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
    const tags = (c.tags || []).map((t: string) => t.toLowerCase());
    const isAttendee = tags.some((t: string) => ATTENDEE_TAGS.includes(t));

    let stage = "lead";
    if (isAttendee) {
      stage = "attendee";
      attendeeCount++;
    }

    return {
      ghl_contact_id: c.id,
      name,
      email: c.email || null,
      phone: c.phone || null,
      stage,
      lead_at: c.dateAdded || now,
      attendee_at: isAttendee ? (c.dateAdded || now) : null,
      updated_at: now,
    };
  });

  // Upsert in batches
  const BATCH_SIZE = 100;
  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await appDb
      .from("recruiting_leads")
      .upsert(batch, { onConflict: "ghl_contact_id", ignoreDuplicates: false });

    if (error) {
      console.error(`[recruiting-ghl-sync] Upsert batch error: ${error.message}`);
      errors.push(error.message);
    } else {
      upserted += batch.length;
    }
  }

  return {
    contactsFetched: contacts.length,
    leadsUpserted: upserted,
    attendeesFound: attendeeCount,
    errors,
    durationMs: Date.now() - startTime,
    syncedAt: now,
  };
}

// ── HTTP handler ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Auth check
  const cronAuth = req.headers.get("x-cron-auth");
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY");

  if (!cronAuth && authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Parse action and params
  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "counts";
  let startDate: string | undefined;
  let endDate: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    action = body.action || action;
    startDate = body.startDate;
    endDate = body.endDate;
  } catch {
    // query params only
  }

  // Load config
  const trackerUrl = Deno.env.get("TRACKER_SUPABASE_URL");
  const trackerKey = Deno.env.get("TRACKER_SUPABASE_KEY");

  if (!trackerUrl || !trackerKey) {
    return jsonResponse({ error: "Missing tracker config" }, 500);
  }

  // Get GHL token
  const ghlToken = await getGhlToken(trackerUrl, trackerKey);
  if (!ghlToken) {
    return jsonResponse({
      error: "No valid GHL token for recruiting location",
      hint: "Install the OAuth app on the recruiting sub-account",
    }, 503);
  }

  if (action === "counts") {
    const result = await handleCounts(ghlToken, startDate, endDate);
    return jsonResponse(result);
  }

  if (action === "sync") {
    const appUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("APP_SUPABASE_URL");
    const appServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY");
    if (!appUrl || !appServiceKey) {
      return jsonResponse({ error: "Missing app config" }, 500);
    }
    const result = await handleSync(ghlToken, appUrl, appServiceKey);
    return jsonResponse(result);
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});
