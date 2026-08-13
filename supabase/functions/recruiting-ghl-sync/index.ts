/**
 * recruiting-ghl-sync — GHL Recruiting Data API
 *
 * Three modes:
 *   POST ?action=counts     — Live KPI counts from GHL API (date-filtered)
 *   POST ?action=sync       — Sync tagged contacts into recruiting_leads + stage transitions
 *   POST ?action=check-lost — Evaluate Lost threshold and auto-flag stale contacts
 *
 * "counts" mode:
 *   - Leads: contacts created in GHL within date range (dateAdded filter)
 *   - Attendees: contacts with attendee tag, date-filtered via stage_transitions log
 *     (GHL doesn't track when a tag was applied, so we maintain our own log)
 *   - Hired: opportunities at Hired stages in the Agent Recruiting pipeline
 *   - When stage_transitions log has data for the period, uses that for date-accurate counts
 *   - Falls back to GHL API counts when no log data exists
 *
 * "sync" mode: Syncs tagged contacts and records stage transitions with timestamps.
 *   Every contact gets a stage transition logged so date filtering works.
 *
 * "check-lost" mode: Reads recruiting_lost_settings threshold, finds contacts
 *   that have been at the same stage for longer than the threshold, and auto-flags
 *   them as Lost with re-entry support.
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
  "opps call | attended",
  "hosp ind | opp call | attended",
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
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-cron-auth, x-client-info",
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
async function getGhlToken(
  trackerUrl: string,
  trackerKey: string
): Promise<string | null> {
  const tracker = createClient(trackerUrl, trackerKey);
  const { data, error } = await tracker
    .from("ghl_location_tokens")
    .select("access_token, expires_at")
    .eq("location_id", RECRUITING_LOCATION_ID)
    .single();

  if (error || !data) {
    console.error(
      `[recruiting-ghl-sync] Token fetch error: ${error?.message || "no data"}`
    );
    return null;
  }
  if (new Date(data.expires_at) < new Date()) {
    console.error(
      `[recruiting-ghl-sync] Token expired at ${data.expires_at}`
    );
    return null;
  }
  return data.access_token;
}

// ── GHL search: count contacts created in date range ──────────────────────
async function countContactsCreated(
  token: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  const filters: Array<{
    field: string;
    operator: string;
    value: string;
  }> = [];

  // Date range filter on dateAdded (when the contact was created)
  if (startDate) {
    filters.push({
      field: "dateAdded",
      operator: "GTE",
      value: new Date(startDate).toISOString(),
    });
  }
  if (endDate) {
    filters.push({
      field: "dateAdded",
      operator: "LTE",
      value: new Date(endDate).toISOString(),
    });
  }

  // If no date filter, get all contacts count
  const body: Record<string, unknown> = {
    locationId: RECRUITING_LOCATION_ID,
    page: 1,
    pageLimit: 1, // We only need the total count
  };
  if (filters.length > 0) {
    body.filters = filters;
  }

  const res = await fetch(`${GHL_API_BASE}/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(
      `[recruiting-ghl-sync] Contact count search failed: ${res.status}`
    );
    return 0;
  }

  const data = await res.json();
  return data.total || 0;
}

// ── GHL search: count contacts by tag ─────────────────────────────────────
async function countContactsByTag(
  token: string,
  tag: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  const filters: Array<{
    field: string;
    operator: string;
    value: string;
  }> = [{ field: "tags", operator: "contains", value: tag }];
  if (startDate) {
    filters.push({
      field: "dateAdded",
      operator: "GTE",
      value: new Date(startDate).toISOString(),
    });
  }
  if (endDate) {
    filters.push({
      field: "dateAdded",
      operator: "LTE",
      value: new Date(endDate).toISOString(),
    });
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
      pageLimit: 1,
    }),
  });

  if (!res.ok) {
    console.error(
      `[recruiting-ghl-sync] Search failed for tag "${tag}": ${res.status}`
    );
    return 0;
  }

  const data = await res.json();
  return data.total || 0;
}

// ── GHL: count opportunities at specific stages ───────────────────────────
async function countHiredOpportunities(
  token: string
): Promise<{
  hired: number;
  pipelineName: string;
  stageBreakdown: Record<string, number>;
}> {
  const pipRes = await fetch(
    `${GHL_API_BASE}/opportunities/pipelines?locationId=${RECRUITING_LOCATION_ID}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    }
  );
  if (!pipRes.ok) return { hired: 0, pipelineName: "", stageBreakdown: {} };

  const pipData = await pipRes.json();
  const pipeline = (pipData.pipelines || []).find(
    (p: { name: string }) =>
      p.name.toLowerCase().includes("agent recruiting")
  );
  if (!pipeline)
    return { hired: 0, pipelineName: "", stageBreakdown: {} };

  const hiredStageIds = pipeline.stages
    .filter((s: { name: string }) =>
      HIRED_STAGE_NAMES.includes(s.name.toLowerCase())
    )
    .map((s: { id: string }) => s.id);

  if (hiredStageIds.length === 0)
    return { hired: 0, pipelineName: pipeline.name, stageBreakdown: {} };

  let totalHired = 0;
  const stageBreakdown: Record<string, number> = {};

  for (const stageId of hiredStageIds) {
    const stageName =
      pipeline.stages.find((s: { id: string }) => s.id === stageId)?.name ||
      "Unknown";

    const res = await fetch(
      `${GHL_API_BASE}/opportunities/search?location_id=${RECRUITING_LOCATION_ID}&pipeline_id=${pipeline.id}&pipeline_stage_id=${stageId}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      }
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

// ── Get date-filtered counts from stage transition log ────────────────────
async function getLogBasedCounts(
  appDb: ReturnType<typeof createClient>,
  startDate?: string,
  endDate?: string
): Promise<{
  hasData: boolean;
  leads: number;
  attendees: number;
  hired: number;
  contracting: number;
  rts: number;
  producing: number;
  lost: number;
} | null> {
  // Check if we have any transition log data
  const { count } = await appDb
    .from("recruiting_stage_transitions")
    .select("id", { count: "exact", head: true });

  if (!count || count === 0) return null;

  // Build query with date filter
  let query = appDb
    .from("recruiting_stage_transitions")
    .select("stage, ghl_contact_id")
    .neq("condition", "auto_lost"); // Don't count auto-lost as entries

  if (startDate) {
    query = query.gte("occurred_at", new Date(startDate).toISOString());
  }
  if (endDate) {
    query = query.lte("occurred_at", new Date(endDate).toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.error(
      `[recruiting-ghl-sync] Log query error: ${error.message}`
    );
    return null;
  }
  if (!data || data.length === 0) {
    return {
      hasData: true,
      leads: 0,
      attendees: 0,
      hired: 0,
      contracting: 0,
      rts: 0,
      producing: 0,
      lost: 0,
    };
  }

  // Count unique contacts per stage
  const stageSets: Record<string, Set<string>> = {
    lead: new Set(),
    attendee: new Set(),
    hired: new Set(),
    contracting: new Set(),
    rts: new Set(),
    producing: new Set(),
    lost: new Set(),
  };

  for (const row of data) {
    const stage = row.stage as string;
    const contactId = row.ghl_contact_id as string;
    if (stageSets[stage]) {
      stageSets[stage].add(contactId);
    }
  }

  return {
    hasData: true,
    leads: stageSets.lead.size,
    attendees: stageSets.attendee.size,
    hired: stageSets.hired.size,
    contracting: stageSets.contracting.size,
    rts: stageSets.rts.size,
    producing: stageSets.producing.size,
    lost: stageSets.lost.size,
  };
}

// ── Action: counts ────────────────────────────────────────────────────────
async function handleCounts(
  token: string,
  startDate?: string,
  endDate?: string,
  appUrl?: string,
  appServiceKey?: string
) {
  const startTime = Date.now();

  // Try log-based counts first (date-accurate)
  let logCounts: Awaited<ReturnType<typeof getLogBasedCounts>> = null;
  if (appUrl && appServiceKey) {
    const appDb = createClient(appUrl, appServiceKey);
    logCounts = await getLogBasedCounts(appDb, startDate, endDate);
  }

  if (logCounts?.hasData) {
    // Use log-based counts — these are date-accurate
    // Still fetch leads from GHL (contacts created) for the lead count
    const leads = await countContactsCreated(token, startDate, endDate);

    return {
      leads,
      attendees: logCounts.attendees,
      hired: logCounts.hired,
      contracting: logCounts.contracting,
      rts: logCounts.rts,
      producing: logCounts.producing,
      lost: logCounts.lost,
      dateFilter:
        startDate && endDate ? { startDate, endDate } : null,
      durationMs: Date.now() - startTime,
      source: "stage_log+ghl",
      cachedAt: new Date().toISOString(),
    };
  }

  // Fallback: GHL API counts (not date-accurate for attendees)
  const [leads, attendeeCounts, hiredData] = await Promise.all([
    countContactsCreated(token, startDate, endDate),
    Promise.all(
      ATTENDEE_TAGS.map((tag) =>
        countContactsByTag(token, tag, startDate, endDate)
      )
    ),
    countHiredOpportunities(token),
  ]);

  const attendees = Math.max(...attendeeCounts, 0);

  return {
    leads,
    attendees,
    hired: hiredData.hired,
    pipeline: hiredData.pipelineName,
    hiredBreakdown: hiredData.stageBreakdown,
    contracting: 0,
    rts: 0,
    producing: 0,
    lost: 0,
    dateFilter:
      startDate && endDate ? { startDate, endDate } : null,
    durationMs: Date.now() - startTime,
    source: "ghl_live",
    cachedAt: new Date().toISOString(),
  };
}

// ── Action: sync (seed recruiting_leads + log transitions) ────────────────
async function handleSync(
  token: string,
  appUrl: string,
  appServiceKey: string
) {
  const appDb = createClient(appUrl, appServiceKey);
  const startTime = Date.now();

  // Fetch all contacts in the recruiting location using search endpoint
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
        filters: [
          { field: "tags", operator: "contains", value: LEAD_TAG },
        ],
        page,
        pageLimit,
      }),
    });

    if (!res.ok) {
      console.error(
        `[recruiting-ghl-sync] Search page ${page} failed: ${res.status}`
      );
      break;
    }

    const data = await res.json();
    const batch = data.contacts || [];
    contacts.push(...batch);
    console.log(
      `[recruiting-ghl-sync] Sync page ${page}: ${contacts.length}/${data.total || "?"}`
    );

    if (
      batch.length < pageLimit ||
      contacts.length >= (data.total || Infinity)
    )
      break;
    page++;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Build upsert rows + stage transitions
  const now = new Date().toISOString();
  let attendeeCount = 0;
  const transitions: Array<{
    ghl_contact_id: string;
    stage: string;
    condition: string;
    previous_stage: string | null;
    metadata: Record<string, unknown>;
    occurred_at: string;
  }> = [];

  const rows = contacts.map((c) => {
    const name =
      c.contactName ||
      c.name ||
      [c.firstName, c.lastName].filter(Boolean).join(" ") ||
      "Unknown";
    const tags = (c.tags || []).map((t: string) => t.toLowerCase());
    const isAttendee = tags.some((t: string) =>
      ATTENDEE_TAGS.map((at) => at.toLowerCase()).includes(t)
    );

    let stage = "lead";
    if (isAttendee) {
      stage = "attendee";
      attendeeCount++;
    }

    // Log the lead transition
    transitions.push({
      ghl_contact_id: c.id,
      stage: "lead",
      condition: "backfill",
      previous_stage: null,
      metadata: { tag: LEAD_TAG, source: "ghl_sync" },
      occurred_at: c.dateAdded || now,
    });

    // Log the attendee transition if applicable
    if (isAttendee) {
      const attendeeTag = tags.find((t: string) =>
        ATTENDEE_TAGS.map((at) => at.toLowerCase()).includes(t)
      );
      transitions.push({
        ghl_contact_id: c.id,
        stage: "attendee",
        condition: "backfill",
        previous_stage: "lead",
        metadata: {
          tag: attendeeTag || "opps call | attended",
          source: "ghl_sync",
        },
        occurred_at: c.dateAdded || now, // Best approximation — actual tag-apply date unknown
      });
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

  // Upsert leads in batches
  const BATCH_SIZE = 100;
  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await appDb
      .from("recruiting_leads")
      .upsert(batch, {
        onConflict: "ghl_contact_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(
        `[recruiting-ghl-sync] Upsert batch error: ${error.message}`
      );
      errors.push(error.message);
    } else {
      upserted += batch.length;
    }
  }

  // Insert stage transitions (skip if already exists for this contact+stage combo)
  let transitionsInserted = 0;
  for (let i = 0; i < transitions.length; i += BATCH_SIZE) {
    const batch = transitions.slice(i, i + BATCH_SIZE);

    // For backfill, we use upsert-like logic: check existing first
    for (const t of batch) {
      const { data: existing } = await appDb
        .from("recruiting_stage_transitions")
        .select("id")
        .eq("ghl_contact_id", t.ghl_contact_id)
        .eq("stage", t.stage)
        .eq("condition", "backfill")
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error: insertErr } = await appDb
          .from("recruiting_stage_transitions")
          .insert(t);

        if (insertErr) {
          console.error(
            `[recruiting-ghl-sync] Transition insert error: ${insertErr.message}`
          );
        } else {
          transitionsInserted++;
        }
      }
    }
  }

  // Log the backfill operation
  await appDb.from("recruiting_backfill_log").insert({
    title: "GHL Contact Sync — Stage Transition Backfill",
    description: `Synced ${contacts.length} tagged contacts from GHL recruiting sub-account. Logged ${transitionsInserted} stage transitions for date-filtered pipeline counts.`,
    backfill_type: "stage_sync",
    status: errors.length > 0 ? "failed" : "completed",
    stats: {
      contacts_fetched: contacts.length,
      leads_upserted: upserted,
      attendees_found: attendeeCount,
      transitions_inserted: transitionsInserted,
      errors: errors.length,
    },
    started_at: new Date(startTime).toISOString(),
    completed_at: now,
  });

  return {
    contactsFetched: contacts.length,
    leadsUpserted: upserted,
    attendeesFound: attendeeCount,
    transitionsInserted,
    errors,
    durationMs: Date.now() - startTime,
    syncedAt: now,
  };
}

// ── Action: check-lost (auto-flag stale contacts) ─────────────────────────
async function handleCheckLost(appUrl: string, appServiceKey: string) {
  const appDb = createClient(appUrl, appServiceKey);
  const startTime = Date.now();

  // Get Lost threshold from settings
  const { data: settingsData } = await appDb
    .from("recruiting_lost_settings")
    .select("setting_key, setting_value")
    .eq("setting_key", "default_threshold_days")
    .single();

  const thresholdDays = settingsData
    ? parseInt(settingsData.setting_value, 10)
    : 60;

  // Find contacts whose latest stage transition is older than the threshold
  // and who are NOT already in 'lost' stage
  const cutoffDate = new Date(
    Date.now() - thresholdDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Get the latest transition for each contact
  const { data: latestTransitions, error: queryErr } = await appDb.rpc(
    "get_stale_recruiting_contacts",
    { cutoff_date: cutoffDate }
  );

  if (queryErr) {
    // RPC might not exist yet — fall back to manual query
    console.warn(
      `[recruiting-ghl-sync] check-lost RPC not available: ${queryErr.message}`
    );

    // Manual approach: get all non-lost leads, check their latest transition
    const { data: activeLeads } = await appDb
      .from("recruiting_leads")
      .select("id, ghl_contact_id, stage, updated_at")
      .neq("stage", "lost")
      .neq("stage", "producing"); // Don't mark producing agents as lost

    if (!activeLeads || activeLeads.length === 0) {
      return { flagged: 0, thresholdDays, durationMs: Date.now() - startTime };
    }

    let flagged = 0;
    for (const lead of activeLeads) {
      // Get latest transition for this contact
      const { data: latest } = await appDb
        .from("recruiting_stage_transitions")
        .select("occurred_at, stage")
        .eq("ghl_contact_id", lead.ghl_contact_id)
        .order("occurred_at", { ascending: false })
        .limit(1);

      const lastActivity = latest?.[0]?.occurred_at || lead.updated_at;
      if (new Date(lastActivity) < new Date(cutoffDate)) {
        // Flag as Lost
        const previousStage = lead.stage;
        await appDb
          .from("recruiting_leads")
          .update({
            stage: "lost",
            lost_at: new Date().toISOString(),
            lost_stage: previousStage,
            lost_reason: `Auto-flagged: ${thresholdDays}+ days at ${previousStage} stage`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        // Log the transition
        await appDb.from("recruiting_stage_transitions").insert({
          lead_id: lead.id,
          ghl_contact_id: lead.ghl_contact_id,
          stage: "lost",
          condition: "auto_lost",
          previous_stage: previousStage,
          metadata: {
            threshold_days: thresholdDays,
            last_activity: lastActivity,
            auto_reason: `${thresholdDays}+ days at ${previousStage}`,
          },
          occurred_at: new Date().toISOString(),
        });

        flagged++;
      }
    }

    return { flagged, thresholdDays, durationMs: Date.now() - startTime };
  }

  // RPC-based path (faster, when available)
  let flagged = 0;
  for (const row of latestTransitions || []) {
    await appDb
      .from("recruiting_leads")
      .update({
        stage: "lost",
        lost_at: new Date().toISOString(),
        lost_stage: row.stage,
        lost_reason: `Auto-flagged: ${thresholdDays}+ days at ${row.stage} stage`,
        updated_at: new Date().toISOString(),
      })
      .eq("ghl_contact_id", row.ghl_contact_id);

    await appDb.from("recruiting_stage_transitions").insert({
      ghl_contact_id: row.ghl_contact_id,
      stage: "lost",
      condition: "auto_lost",
      previous_stage: row.stage,
      metadata: {
        threshold_days: thresholdDays,
        last_activity: row.latest_occurred_at,
      },
      occurred_at: new Date().toISOString(),
    });

    flagged++;
  }

  return { flagged, thresholdDays, durationMs: Date.now() - startTime };
}

// ── HTTP handler ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  // Auth check
  const cronAuth = req.headers.get("x-cron-auth");
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("APP_SUPABASE_SERVICE_KEY");

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
  const appUrl =
    Deno.env.get("SUPABASE_URL") || Deno.env.get("APP_SUPABASE_URL");
  const appServiceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("APP_SUPABASE_SERVICE_KEY");

  if (action === "check-lost") {
    if (!appUrl || !appServiceKey) {
      return jsonResponse({ error: "Missing app config" }, 500);
    }
    const result = await handleCheckLost(appUrl, appServiceKey);
    return jsonResponse(result);
  }

  if (!trackerUrl || !trackerKey) {
    return jsonResponse({ error: "Missing tracker config" }, 500);
  }

  // Get GHL token
  const ghlToken = await getGhlToken(trackerUrl, trackerKey);
  if (!ghlToken) {
    return jsonResponse(
      {
        error: "No valid GHL token for recruiting location",
        hint: "Install the OAuth app on the recruiting sub-account",
      },
      503
    );
  }

  if (action === "counts") {
    const result = await handleCounts(
      ghlToken,
      startDate,
      endDate,
      appUrl,
      appServiceKey
    );
    return jsonResponse(result);
  }

  if (action === "sync") {
    if (!appUrl || !appServiceKey) {
      return jsonResponse({ error: "Missing app config" }, 500);
    }
    const result = await handleSync(ghlToken, appUrl, appServiceKey);
    return jsonResponse(result);
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});
