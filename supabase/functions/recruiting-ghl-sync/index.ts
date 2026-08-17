/**
 * recruiting-ghl-sync — Recruiting Pipeline Sync & Query Engine
 *
 * Architecture: LOCAL-FIRST. All KPI reads come from recruiting_stage_transitions.
 * A 3-hour cron populates the log; page loads never hit GHL.
 *
 * Actions:
 *   POST ?action=sync       — Incremental sync (called by cron every 3h)
 *   POST ?action=counts     — Read pipeline counts from local stage log (fast, no GHL)
 *   POST ?action=check-lost — Evaluate Lost threshold and auto-flag stale contacts
 *
 * Sync pulls from TWO GHL sub-accounts:
 *   1. Recruiting sub (e7yV92T56bkUoGqsge8K) — contacts created, attended/hired TAGS
 *   2. Contracting sub (pE2DOS2bdVB3AYlMcQ1a) — pipeline stages (contracting + RTS)
 *
 * Tag signals (recruiting sub):
 *   - Attended: "opps call | attended"
 *   - Hired:    "robbys hip | broker" OR "robbys hip | career"
 *
 * Pipeline signals (contracting sub):
 *   - Contracting: "IN CONTRACTING PROCESS" stage
 *   - RTS:         "RTS Status (Tracey)" stage
 *
 * Transition dating:
 *   - Lead: occurred_at = contact dateAdded (when they entered the system)
 *   - Attendee/Hired: occurred_at = sync timestamp when tag is FIRST DETECTED
 *     (GHL doesn't expose tag-applied dates, so we log when we see it)
 *   - Contracting/RTS: occurred_at = lastStageChangeAt from the opportunity
 *
 * Hard cutoff: Feb 1, 2026 — all contacts before this date are ignored.
 *
 * Token sources:
 *   - Recruiting: OAuth token in ghl_location_tokens (tracker DB lryxx), refreshed every 6h
 *   - Contracting: GHL_CONTRACTING_API env var (v2 API key)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createProdConnection } from "../_shared/prod-db.ts";

// ── Constants ─────────────────────────────────────────────────────────────
const RECRUITING_LOCATION_ID = "e7yV92T56bkUoGqsge8K";
const CONTRACTING_LOCATION_ID = "pE2DOS2bdVB3AYlMcQ1a";
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const RATE_LIMIT_DELAY_MS = 120;

// Hard cutoff — Medicare pivot Feb 1 2026
const DATA_CUTOFF = "2026-02-01T00:00:00.000Z";

// Contracting pipeline: "New Agents Pipeline"
const CONTRACTING_PIPELINE_ID = "8h8F2lAFHXUkEJgZa2KD";
const CONTRACTING_STAGE_ID = "e5086dba-8459-4be3-aed6-1e8c1bd70423";
// RTS stages — expanded list per Charlie (2026-08-13)
const RTS_STAGE_IDS: Record<string, string> = {
  "6cc9d0c5-52c3-49e5-b2ac-82f5d4848d5d": "RTS Status (Tracey)",
  "93015fe2-aa22-48d1-b540-d1034509535a": "Hip Broker READY",
  "8f9b45ac-321a-4eeb-b207-4f46a56fe991": "Hip Career READY",
  "ccc320f2-9ad9-44c4-aeb4-f645f3b924c8": "Actively Selling",
  "03561146-d2f4-4729-8697-4566c1aa17de": "Active Brokers",
};

// Tag signals — ALL tag-based, from recruiting sub contacts
// Lead gate: only contacts with this tag are counted as recruiting leads
const LEAD_TAG = "hosp ind | agent lead";
const ATTENDEE_TAGS = ["opps call | attended"];
const HIRED_TAGS = ["robbys hip | broker", "robbys hip | career"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-cron-auth, x-client-info",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Get recruiting OAuth token (from tracker DB) ──────────────────────────
async function getRecruitingToken(
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
    console.error(`[sync] Recruiting token error: ${error?.message || "no data"}`);
    return null;
  }
  if (new Date(data.expires_at) < new Date()) {
    console.error(`[sync] Recruiting token expired at ${data.expires_at}`);
    return null;
  }
  return data.access_token;
}

// ── GHL v2: search contacts (paginated, no filters — GHL doesn't support date filters) ─
interface GhlContact {
  id: string;
  contactName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded?: string;
  dateUpdated?: string;
}

async function fetchAllContacts(
  token: string,
  locationId: string,
  maxPages = 50
): Promise<{ contacts: GhlContact[]; total: number }> {
  const contacts: GhlContact[] = [];
  let page = 1;
  const pageLimit = 100;
  let total = 0;

  while (page <= maxPages) {
    const res = await fetch(`${GHL_API_BASE}/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locationId, page, pageLimit }),
    });

    if (!res.ok) {
      console.error(`[sync] Search page ${page} failed: ${res.status}`);
      break;
    }

    const data = await res.json();
    total = data.total || 0;
    const batch = data.contacts || [];
    contacts.push(...batch);

    if (batch.length < pageLimit || contacts.length >= total) break;
    page++;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return { contacts, total };
}

// ── GHL v2: search opportunities at a pipeline stage ──────────────────────
interface GhlOpportunity {
  id: string;
  name: string;
  contact?: { id?: string; name?: string; email?: string; phone?: string };
  pipelineStageId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  lastStageChangeAt?: string;
  dateAdded?: string;
}

async function searchOpportunitiesAtStage(
  apiKey: string,
  pipelineId: string,
  stageId: string,
  locationId: string
): Promise<GhlOpportunity[]> {
  const opportunities: GhlOpportunity[] = [];
  let startAfter = "";
  let pageCount = 0;
  const maxPages = 50;

  while (pageCount < maxPages) {
    const params = new URLSearchParams({
      location_id: locationId,
      pipeline_id: pipelineId,
      pipeline_stage_id: stageId,
      limit: "100",
    });
    if (startAfter) params.set("startAfter", startAfter);
    if (startAfter === "" && pageCount > 0) break;

    const res = await fetch(
      `${GHL_API_BASE}/opportunities/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error(`[sync] Opp search stage ${stageId} page ${pageCount}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const batch: GhlOpportunity[] = data.opportunities || [];
    opportunities.push(...batch);

    const meta = data.meta || {};
    startAfter = meta.startAfter || meta.nextPageUrl || "";
    if (batch.length < 100 || !startAfter) break;

    pageCount++;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return opportunities;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function contactName(c: GhlContact): string {
  return (
    c.contactName ||
    c.name ||
    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
    "Unknown"
  );
}

function hasAnyTag(contact: GhlContact, tags: string[]): boolean {
  const cTags = (contact.tags || []).map((t) => t.toLowerCase().trim());
  return tags.some((t) => cTags.includes(t.toLowerCase().trim()));
}

function matchedTag(contact: GhlContact, tags: string[]): string | null {
  const cTags = (contact.tags || []).map((t) => t.toLowerCase().trim());
  for (const t of tags) {
    if (cTags.includes(t.toLowerCase().trim())) return t;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// ACTION: SYNC — 3-hour cron populates local stage_transitions
// ══════════════════════════════════════════════════════════════════════════
async function handleSync(
  recruitingToken: string,
  contractingApiKey: string,
  appUrl: string,
  appServiceKey: string
) {
  const appDb = createClient(appUrl, appServiceKey);
  const startTime = Date.now();
  const now = new Date().toISOString();
  const stats = {
    recruiting: { totalContacts: 0, afterCutoff: 0, leads: 0, attendees: 0, hired: 0, newTransitions: 0 },
    contracting: { contracting: 0, rts: 0, newTransitions: 0 },
    errors: [] as string[],
  };

  // ── 1. RECRUITING SUB: fetch ALL contacts, filter Feb 1+ locally ──────
  console.log("[sync] Fetching all recruiting contacts...");

  const { contacts: allContacts, total: ghlTotal } =
    await fetchAllContacts(recruitingToken, RECRUITING_LOCATION_ID, 50);

  stats.recruiting.totalContacts = allContacts.length;

  // Filter: Feb 1+ AND must have the "hosp ind | agent lead" tag to count as a lead
  const contacts = allContacts.filter((c) => {
    const added = c.dateAdded ? new Date(c.dateAdded) : null;
    if (!added || added < new Date(DATA_CUTOFF)) return false;
    // Only contacts tagged as agent leads enter the recruiting funnel
    const tags = (c.tags || []).map((t) => t.toLowerCase().trim());
    return tags.includes(LEAD_TAG.toLowerCase());
  });

  stats.recruiting.afterCutoff = contacts.length;
  console.log(
    `[sync] ${allContacts.length} total, ${contacts.length} with "${LEAD_TAG}" tag after Feb 1 cutoff`
  );

  // ── Pre-load existing transitions to avoid re-inserting duplicates ──────
  // The UNIQUE(ghl_contact_id, stage) constraint silently skips duplicates on
  // upsert, but ignoreDuplicates also masks genuine insert failures. Instead,
  // we query the existing set upfront and only insert truly new transitions.
  const existingPairs = new Set<string>();
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: rows, error: exErr } = await appDb
        .from("recruiting_stage_transitions")
        .select("ghl_contact_id, stage")
        .range(offset, offset + PAGE - 1);
      if (exErr) {
        console.error(`[sync] Pre-load transitions error: ${exErr.message}`);
        break;
      }
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        existingPairs.add(`${r.ghl_contact_id}::${r.stage}`);
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    console.log(`[sync] Pre-loaded ${existingPairs.size} existing transitions`);
  }

  const leadsToUpsert: Array<Record<string, unknown>> = [];
  const transitionsToInsert: Array<Record<string, unknown>> = [];

  for (const c of contacts) {
    const name = contactName(c);
    const createdAt = c.dateAdded || now;
    const hasAttendedTag = hasAnyTag(c, ATTENDEE_TAGS);
    const hasHiredTag = hasAnyTag(c, HIRED_TAGS);
    // Hired implies attended — you can't be hired without attending
    const isAttendee = hasAttendedTag || hasHiredTag;
    const isHired = hasHiredTag;

    // Highest current stage
    let stage = "lead";
    if (isHired) stage = "hired";
    else if (isAttendee) stage = "attendee";

    stats.recruiting.leads++;
    if (isAttendee) stats.recruiting.attendees++;
    if (isHired) stats.recruiting.hired++;

    // Build lead upsert
    leadsToUpsert.push({
      ghl_contact_id: c.id,
      name,
      email: c.email || null,
      phone: c.phone || null,
      stage,
      lead_at: createdAt,
      attendee_at: isAttendee ? createdAt : null, // Will be overwritten with real date on future syncs
      hired_at: isHired ? createdAt : null,
      updated_at: now,
    });

    // ── Lead transition: occurred_at = dateAdded (when contact was created) ──
    transitionsToInsert.push({
      ghl_contact_id: c.id,
      stage: "lead",
      condition: "sync",
      previous_stage: null,
      metadata: { source: "recruiting_sub", dateAdded: createdAt },
      occurred_at: createdAt,
    });
    stats.recruiting.newTransitions++;

    // ── Attendee transition: occurred_at = NOW (when we first detect the tag) ──
    // Hired implies attended — log attendee transition for hired contacts too
    if (isAttendee) {
      transitionsToInsert.push({
        ghl_contact_id: c.id,
        stage: "attendee",
        condition: "sync",
        previous_stage: "lead",
        metadata: {
          tag: matchedTag(c, ATTENDEE_TAGS) || "implied_by_hired",
          source: "recruiting_sub",
          implied: hasHiredTag && !hasAttendedTag,
        },
        occurred_at: now,
      });
      stats.recruiting.newTransitions++;
    }

    // ── Hired transition: occurred_at = NOW (when we first detect the tag) ──
    if (isHired) {
      transitionsToInsert.push({
        ghl_contact_id: c.id,
        stage: "hired",
        condition: "sync",
        previous_stage: isAttendee ? "attendee" : "lead",
        metadata: { tag: matchedTag(c, HIRED_TAGS), source: "recruiting_sub" },
        occurred_at: now, // Detected this sync cycle
      });
      stats.recruiting.newTransitions++;
    }
  }

  // ── 2. CONTRACTING SUB: pipeline stages ───────────────────────────────
  console.log("[sync] Fetching contracting pipeline stages...");

  // 2a. IN CONTRACTING PROCESS
  const contractingOpps = await searchOpportunitiesAtStage(
    contractingApiKey,
    CONTRACTING_PIPELINE_ID,
    CONTRACTING_STAGE_ID,
    CONTRACTING_LOCATION_ID
  );

  for (const opp of contractingOpps) {
    const contactId = opp.contact?.id || opp.id;
    const dateAdded = opp.createdAt || opp.dateAdded || opp.lastStageChangeAt || now;

    if (new Date(dateAdded) < new Date(DATA_CUTOFF)) continue;

    stats.contracting.contracting++;

    transitionsToInsert.push({
      ghl_contact_id: contactId,
      stage: "contracting",
      condition: "sync",
      previous_stage: "hired",
      metadata: {
        source: "contracting_sub",
        pipeline: "New Agents Pipeline",
        stage_name: "IN CONTRACTING PROCESS",
        opp_id: opp.id,
        opp_name: opp.name,
      },
      occurred_at: opp.lastStageChangeAt || dateAdded,
    });
    stats.contracting.newTransitions++;

    leadsToUpsert.push({
      ghl_contact_id: contactId,
      name: opp.contact?.name || opp.name || "Unknown",
      email: opp.contact?.email || null,
      phone: opp.contact?.phone || null,
      stage: "contracting",
      contracting_at: opp.lastStageChangeAt || dateAdded,
      updated_at: now,
    });
  }

  // 2b. RTS stages — expanded list (5 stages)
  for (const [rtsStageId, rtsStageName] of Object.entries(RTS_STAGE_IDS)) {
    const rtsOpps = await searchOpportunitiesAtStage(
      contractingApiKey,
      CONTRACTING_PIPELINE_ID,
      rtsStageId,
      CONTRACTING_LOCATION_ID
    );

    for (const opp of rtsOpps) {
      const contactId = opp.contact?.id || opp.id;
      const dateAdded = opp.createdAt || opp.dateAdded || opp.lastStageChangeAt || now;

      if (new Date(dateAdded) < new Date(DATA_CUTOFF)) continue;

      stats.contracting.rts++;

      transitionsToInsert.push({
        ghl_contact_id: contactId,
        stage: "rts",
        condition: "sync",
        previous_stage: "contracting",
        metadata: {
          source: "contracting_sub",
          pipeline: "New Agents Pipeline",
          stage_name: rtsStageName,
          ghl_stage_id: rtsStageId,
          opp_id: opp.id,
          opp_name: opp.name,
        },
        occurred_at: opp.lastStageChangeAt || dateAdded,
      });
      stats.contracting.newTransitions++;

      leadsToUpsert.push({
        ghl_contact_id: contactId,
        name: opp.contact?.name || opp.name || "Unknown",
        email: opp.contact?.email || null,
        phone: opp.contact?.phone || null,
        stage: "rts",
        rts_at: opp.lastStageChangeAt || dateAdded,
        updated_at: now,
      });
    }
  } // end RTS stage loop

  // ── 2c. PRODUCING — match recruiting leads against Max's production DB ──
  console.log(`[sync] Checking Max's DB for producing agents...`);
  stats.producing = { matched: 0, newTransitions: 0 };
  let prodSql: ReturnType<typeof createProdConnection> | null = null;
  try {
    prodSql = createProdConnection();
    // Get FYM DIRECT agents with production since Feb 1.
    // FYM direct = blank ga (no sub-agency in the hierarchy).
    // Also track which carriers each agent writes for (UNL/GTL).
    const prodRows = await prodSql`
      SELECT wa_name, MIN(app_recvd_date)::text as first_app_date, 'UNL' as carrier
      FROM typed.unl_fym_policy_latest_load
      WHERE app_recvd_date >= '2026-02-01'
        AND wa_name IS NOT NULL AND wa_name != ''
        AND (TRIM(ga) IS NULL OR TRIM(ga) = '' OR TRIM(ga) = '202JVV00')
      GROUP BY wa_name
      UNION
      SELECT wa_name, MIN(app_recvd_date)::text as first_app_date, 'GTL' as carrier
      FROM typed.gtl_fym_policy_latest_load
      WHERE app_recvd_date >= '2026-02-01'
        AND wa_name IS NOT NULL AND wa_name != ''
        AND (TRIM(ga) IS NULL OR TRIM(ga) = '' OR TRIM(ga) = '202JVV00')
      GROUP BY wa_name
    `;
    // Build lookup by normalized name (MAX DB is uppercase)
    // Track carriers per agent for the ROI table
    const prodLookup = new Map<string, { name: string; firstAppDate: string; carriers: Set<string> }>();
    for (const row of prodRows) {
      const nname = (row.wa_name || "").toUpperCase().trim()
        .replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
      if (!nname) continue;
      const carrier = row.carrier as string;
      const existing = prodLookup.get(nname);
      if (existing) {
        existing.carriers.add(carrier);
        if (row.first_app_date < existing.firstAppDate) {
          existing.firstAppDate = row.first_app_date;
          existing.name = row.wa_name;
        }
      } else {
        prodLookup.set(nname, { name: row.wa_name, firstAppDate: row.first_app_date, carriers: new Set([carrier]) });
      }
      // Also index by swapped first/last for 2-part names
      const parts = nname.split(" ");
      if (parts.length === 2) {
        const swapped = `${parts[1]} ${parts[0]}`;
        const existingSwap = prodLookup.get(swapped);
        if (existingSwap) {
          existingSwap.carriers.add(carrier);
          if (row.first_app_date < existingSwap.firstAppDate) {
            existingSwap.firstAppDate = row.first_app_date;
            existingSwap.name = row.wa_name;
          }
        } else {
          prodLookup.set(swapped, { name: row.wa_name, firstAppDate: row.first_app_date, carriers: new Set([carrier]) });
        }
      }
    }
    console.log(`[sync] Production agents loaded: ${prodLookup.size}`);

    // Get all recruiting leads from DB
    const { data: allLeads } = await appDb
      .from("recruiting_leads")
      .select("ghl_contact_id, name, email, stage");

    if (allLeads) {
      // Track which normalized names have already been matched this sync
      // to avoid creating duplicate producing transitions for the same
      // person who exists in both GHL sub-accounts (different contact IDs).
      const matchedProducingNames = new Set<string>();

      for (const lead of allLeads) {
        const rawName = (lead.name || "").trim();
        let nname = rawName.toUpperCase()
          .split(" | ")[0].trim()
          .replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
        // Remove common suffixes
        for (const sfx of [" JR", " SR", " II", " III", " IV"]) {
          if (nname.endsWith(sfx)) nname = nname.slice(0, -sfx.length).trim();
        }
        const prod = prodLookup.get(nname);
        if (!prod) continue;

        // Skip if we've already matched this person under a different contact ID
        if (matchedProducingNames.has(nname)) continue;
        matchedProducingNames.add(nname);

        stats.producing.matched++;

        transitionsToInsert.push({
          ghl_contact_id: lead.ghl_contact_id,
          stage: "producing",
          condition: "sync",
          previous_stage: "rts",
          metadata: {
            source: "max_db_match",
            prod_name: prod.name,
            first_app_date: prod.firstAppDate,
            carriers: [...prod.carriers],
          },
          occurred_at: prod.firstAppDate + "T00:00:00Z",
        });
        stats.producing.newTransitions++;

        // Update lead stage if they've graduated
        if (lead.stage !== "producing") {
          leadsToUpsert.push({
            ghl_contact_id: lead.ghl_contact_id,
            name: rawName,
            email: lead.email || null,
            phone: null,
            stage: "producing",
            updated_at: now,
          });
        }
      }
    }
    console.log(`[sync] Producing: ${stats.producing.matched} matched, ${stats.producing.newTransitions} new transitions`);
  } catch (prodErr) {
    console.error(`[sync] Producing check error (non-fatal): ${(prodErr as Error).message}`);
    stats.errors.push(`producing: ${(prodErr as Error).message}`);
  } finally {
    if (prodSql) {
      try { await prodSql.end(); } catch { /* ignore */ }
    }
  }

  // ── Filter transitions: only keep genuinely new ones ──────────────────
  const newTransitions = transitionsToInsert.filter(
    (t) => !existingPairs.has(`${t.ghl_contact_id}::${t.stage}`)
  );
  console.log(
    `[sync] ${transitionsToInsert.length} total transitions built, ${newTransitions.length} genuinely new (${transitionsToInsert.length - newTransitions.length} skipped as existing)`
  );

  // ── 3. BATCH UPSERT leads ─────────────────────────────────────────────
  console.log(`[sync] Upserting ${leadsToUpsert.length} leads...`);
  const BATCH = 200;
  let leadsUpserted = 0;

  for (let i = 0; i < leadsToUpsert.length; i += BATCH) {
    const batch = leadsToUpsert.slice(i, i + BATCH);
    const { error } = await appDb
      .from("recruiting_leads")
      .upsert(batch, { onConflict: "ghl_contact_id", ignoreDuplicates: false });
    if (error) {
      console.error(`[sync] Lead upsert batch error: ${error.message}`);
      stats.errors.push(`lead_upsert: ${error.message}`);
    } else {
      leadsUpserted += batch.length;
    }
  }

  // ── 4. INSERT only genuinely new transitions ──────────────────────────
  // Pre-filtered above — no duplicates, no ignoreDuplicates needed.
  console.log(`[sync] Inserting ${newTransitions.length} new transitions...`);
  let transInserted = 0;

  for (let i = 0; i < newTransitions.length; i += BATCH) {
    const batch = newTransitions.slice(i, i + BATCH);
    const { error } = await appDb
      .from("recruiting_stage_transitions")
      .insert(batch);
    if (error) {
      console.error(`[sync] Transition insert error: ${error.message}`);
      stats.errors.push(`transition_insert: ${error.message}`);
    } else {
      transInserted += batch.length;
    }
  }

  const result = {
    ...stats,
    leadsUpserted,
    transitionsInserted: transInserted,
    durationMs: Date.now() - startTime,
    syncedAt: now,
    dataCutoff: DATA_CUTOFF,
  };

  console.log(`[sync] Complete: ${JSON.stringify(result)}`);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// ACTION: COUNTS — read from local stage log (NO GHL calls)
// ══════════════════════════════════════════════════════════════════════════
async function handleCounts(
  appUrl: string,
  appServiceKey: string,
  startDate?: string,
  endDate?: string
) {
  const appDb = createClient(appUrl, appServiceKey);
  const st = Date.now();

  // Enforce Feb 1 cutoff
  const effectiveStart = startDate && new Date(startDate) > new Date(DATA_CUTOFF)
    ? startDate
    : DATA_CUTOFF;

  // Server-side RPC — avoids Supabase JS client 1K row cap
  const { data: rpcResult, error } = await appDb.rpc("get_pipeline_counts", {
    start_date: effectiveStart,
    end_date: endDate || null,
  });

  const counts: Record<string, number> = {
    lead: 0, attendee: 0, hired: 0, contracting: 0, rts: 0, producing: 0, lost: 0,
  };

  if (error) {
    console.error(`[counts] RPC error: ${error.message}`);
    return {
      ...counts, leads: 0, attendees: 0,
      dateFilter: startDate && endDate ? { startDate, endDate } : null,
      durationMs: Date.now() - st,
      source: "local_log",
      error: error.message,
    };
  }

  for (const row of rpcResult || []) {
    counts[row.stage] = Number(row.contact_count);
  }

  // Lost count from recruiting_leads (current state)
  const { count: lostCount } = await appDb
    .from("recruiting_leads")
    .select("id", { count: "exact", head: true })
    .eq("stage", "lost");

  return {
    leads: counts.lead,
    attendees: counts.attendee,
    hired: counts.hired,
    contracting: counts.contracting,
    rts: counts.rts,
    producing: counts.producing,
    lost: lostCount || counts.lost,
    dateFilter: startDate && endDate ? { startDate, endDate } : null,
    durationMs: Date.now() - st,
    source: "local_log",
    dataCutoff: DATA_CUTOFF,
    cachedAt: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ACTION: CHECK-LOST — auto-flag stale contacts
// ══════════════════════════════════════════════════════════════════════════
async function handleCheckLost(appUrl: string, appServiceKey: string) {
  const appDb = createClient(appUrl, appServiceKey);
  const st = Date.now();

  const { data: settingsData } = await appDb
    .from("recruiting_lost_settings")
    .select("setting_key, setting_value")
    .eq("setting_key", "default_threshold_days")
    .single();

  const thresholdDays = settingsData ? parseInt(settingsData.setting_value, 10) : 60;
  const cutoffDate = new Date(Date.now() - thresholdDays * 86400000).toISOString();

  // Get non-lost, non-producing leads
  const { data: activeLeads } = await appDb
    .from("recruiting_leads")
    .select("id, ghl_contact_id, stage, updated_at")
    .neq("stage", "lost")
    .neq("stage", "producing");

  if (!activeLeads?.length) return { flagged: 0, thresholdDays, durationMs: Date.now() - st };

  let flagged = 0;
  for (const lead of activeLeads) {
    const { data: latest } = await appDb
      .from("recruiting_stage_transitions")
      .select("occurred_at")
      .eq("ghl_contact_id", lead.ghl_contact_id)
      .order("occurred_at", { ascending: false })
      .limit(1);

    const lastActivity = latest?.[0]?.occurred_at || lead.updated_at;
    if (new Date(lastActivity) < new Date(cutoffDate)) {
      const prevStage = lead.stage;
      await appDb
        .from("recruiting_leads")
        .update({
          stage: "lost",
          lost_at: new Date().toISOString(),
          lost_stage: prevStage,
          lost_reason: `Auto-flagged: ${thresholdDays}+ days at ${prevStage}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      await appDb.from("recruiting_stage_transitions").insert({
        ghl_contact_id: lead.ghl_contact_id,
        stage: "lost",
        condition: "auto_lost",
        previous_stage: prevStage,
        metadata: { threshold_days: thresholdDays, last_activity: lastActivity },
        occurred_at: new Date().toISOString(),
      });
      flagged++;
    }
  }

  return { flagged, thresholdDays, durationMs: Date.now() - st };
}

// ── Backfill handler ──────────────────────────────────────────────────────
interface BackfillTransition {
  ghl_contact_id: string;
  stage: string;
  previous_stage?: string | null;
  occurred_at: string;
  condition: string;
  metadata: Record<string, unknown>;
}

async function handleBackfill(
  appUrl: string,
  appServiceKey: string,
  body: { transitions?: BackfillTransition[]; clear_existing?: boolean }
) {
  const st = Date.now();
  const appDb = createClient(appUrl, appServiceKey);
  const transitions = body.transitions || [];

  if (transitions.length === 0) {
    return { error: "No transitions provided", inserted: 0 };
  }
  if (transitions.length > 2000) {
    return { error: "Max 2000 transitions per call", inserted: 0 };
  }

  // Optionally clear existing backfill transitions first
  if (body.clear_existing) {
    const { error: delErr } = await appDb
      .from("recruiting_stage_transitions")
      .delete()
      .eq("condition", "backfill");
    if (delErr) {
      console.error("[backfill] clear error:", delErr.message);
      return { error: `Clear failed: ${delErr.message}` };
    }
    console.log("[backfill] cleared existing backfill transitions");
  }

  // Insert in batches of 200
  let inserted = 0;
  let errors = 0;
  const BATCH = 200;

  for (let i = 0; i < transitions.length; i += BATCH) {
    const batch = transitions.slice(i, i + BATCH).map((t) => ({
      ghl_contact_id: t.ghl_contact_id,
      stage: t.stage,
      previous_stage: t.previous_stage || null,
      occurred_at: t.occurred_at,
      condition: t.condition || "backfill",
      metadata: t.metadata || {},
    }));

    const { error: insErr } = await appDb
      .from("recruiting_stage_transitions")
      .insert(batch);

    if (insErr) {
      console.error(`[backfill] batch ${i / BATCH} error:`, insErr.message);
      errors++;
    } else {
      inserted += batch.length;
    }
  }

  // Log the backfill
  await appDb.from("recruiting_backfill_log").insert({
    title: `CSV Import (${new Date().toISOString().slice(0, 10)})`,
    description: `Inserted ${inserted} transitions, ${errors} batch errors`,
    rows_affected: inserted,
    ran_at: new Date().toISOString(),
  });

  return {
    inserted,
    errors,
    durationMs: Date.now() - st,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HTTP HANDLER
// ══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Auth
  const cronAuth = req.headers.get("x-cron-auth");
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY");
  if (!cronAuth && authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "counts";
  let startDate: string | undefined;
  let endDate: string | undefined;
  // deno-lint-ignore no-explicit-any
  let body: any = {};

  try {
    body = await req.json().catch(() => ({}));
    action = body.action || action;
    startDate = body.startDate;
    endDate = body.endDate;
  } catch { /* query params only */ }

  const trackerUrl = Deno.env.get("TRACKER_SUPABASE_URL");
  const trackerKey = Deno.env.get("TRACKER_SUPABASE_KEY");
  const appUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("APP_SUPABASE_URL");
  const appServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY");
  const contractingApiKey = Deno.env.get("GHL_CONTRACTING_API") || "";

  if (action === "counts") {
    if (!appUrl || !appServiceKey) return jsonResponse({ error: "Missing app config" }, 500);
    return jsonResponse(await handleCounts(appUrl, appServiceKey, startDate, endDate));
  }

  if (action === "check-lost") {
    if (!appUrl || !appServiceKey) return jsonResponse({ error: "Missing app config" }, 500);
    return jsonResponse(await handleCheckLost(appUrl, appServiceKey));
  }

  if (action === "sync") {
    if (!trackerUrl || !trackerKey) return jsonResponse({ error: "Missing tracker config" }, 500);
    if (!appUrl || !appServiceKey) return jsonResponse({ error: "Missing app config" }, 500);

    const recruitingToken = await getRecruitingToken(trackerUrl, trackerKey);
    if (!recruitingToken) return jsonResponse({ error: "Recruiting token unavailable" }, 500);

    if (!contractingApiKey) {
      return jsonResponse({ error: "GHL_CONTRACTING_API not set" }, 500);
    }

    return jsonResponse(await handleSync(recruitingToken, contractingApiKey, appUrl, appServiceKey));
  }

  if (action === "backfill") {
    if (!appUrl || !appServiceKey) return jsonResponse({ error: "Missing app config" }, 500);
    return jsonResponse(await handleBackfill(appUrl, appServiceKey, body));
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});
