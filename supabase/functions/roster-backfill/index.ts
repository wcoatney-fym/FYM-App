/**
 * roster-backfill — Populate agency_rosters from CRM Ops roster data
 *
 * Reads crm_roster (portal DB akhojh) and writes to agency_rosters
 * (FYM App DB rcbzag). Maps portal agency names to rcbzag agency UUIDs.
 *
 * Source: crm_roster.row_data JSON contains First Name, Last Name,
 * Phone, Email, Agent NPN fields from uploaded CSV rosters.
 *
 * Matching: Uses NPN as primary dedup key. Falls back to
 * first_name + last_name + agency_id for agents without NPN.
 *
 * Invocation: POST /roster-backfill (no body needed)
 * Auth: Requires service role key (runs as admin)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/prod-db.ts";

// ── Agency name crosswalk ────────────────────────────────────────────
// Maps crm_roster_uploads.agency (portal) → agencies.name (rcbzag)
// These are manually verified mappings.
const AGENCY_NAME_MAP: Record<string, string> = {
  "FYM": "FYM",
  "DH Insurance Group": "Dh Insurance Group",
  "Berith Partners LLC": "Berith Partners LLC",
  "Wisechoice": "Wisechoice Senior Advisors Llc",
  "MHA (YFMO)": "Medicare Health Advisors",
  "MHA (IFG)": "Medicare Health Advisors",
  "Aspire": "Aspire",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();

  // ── Connect to both DBs ────────────────────────────────────────
  const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL") ||
    Deno.env.get("CONTRACTING_SUPABASE_URL") || "";
  const portalKey = Deno.env.get("PORTAL_SUPABASE_SERVICE_KEY") ||
    Deno.env.get("CONTRACTING_SUPABASE_SERVICE_KEY") || "";

  const appUrl = Deno.env.get("APP_SUPABASE_URL") ||
    Deno.env.get("SUPABASE_URL") || "";
  const appKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!portalUrl || !portalKey) {
    return jsonResponse({ error: "Missing PORTAL/CONTRACTING Supabase credentials" }, 500);
  }
  if (!appUrl || !appKey) {
    return jsonResponse({ error: "Missing APP Supabase credentials" }, 500);
  }

  const portal = createClient(portalUrl, portalKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const app = createClient(appUrl, appKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ── 1. Load agency ID lookup from rcbzag ─────────────────────
    const { data: agencies, error: agErr } = await app
      .from("agencies")
      .select("id, name");

    if (agErr) throw new Error(`Failed to load agencies: ${agErr.message}`);

    const agencyByName = new Map<string, string>();
    for (const a of agencies || []) {
      agencyByName.set((a.name as string).toLowerCase(), a.id as string);
    }

    // ── 2. Load all crm_roster rows with their upload agency ─────
    const PAGE = 1000;
    let offset = 0;
    interface RosterRow {
      id: string;
      row_data: Record<string, string>;
      upload_id: string;
    }
    interface UploadRow {
      id: string;
      agency: string;
    }

    // Load uploads first (agency mapping)
    const { data: uploads, error: upErr } = await portal
      .from("crm_roster_uploads")
      .select("id, agency");

    if (upErr) throw new Error(`Failed to load uploads: ${upErr.message}`);

    const uploadAgencyMap = new Map<string, string>();
    for (const u of (uploads || []) as UploadRow[]) {
      uploadAgencyMap.set(u.id, u.agency);
    }

    // Load all roster rows (paginated)
    let allRoster: RosterRow[] = [];
    while (true) {
      const { data, error: rErr } = await portal
        .from("crm_roster")
        .select("id, row_data, upload_id")
        .range(offset, offset + PAGE - 1);

      if (rErr) throw new Error(`Failed to load roster page: ${rErr.message}`);
      const rows = (data || []) as RosterRow[];
      allRoster = allRoster.concat(rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    // ── 3. Load existing agency_rosters for dedup ────────────────
    let existingNpns = new Set<string>();
    let existingNames = new Set<string>();
    offset = 0;

    while (true) {
      const { data } = await app
        .from("agency_rosters")
        .select("agent_npn, first_name, last_name, agency_id")
        .range(offset, offset + PAGE - 1);

      const rows = data || [];
      for (const r of rows) {
        if (r.agent_npn) existingNpns.add((r.agent_npn as string).trim());
        const nameKey = `${(r.first_name as string || "").trim().toLowerCase()}|${(r.last_name as string || "").trim().toLowerCase()}|${r.agency_id}`;
        existingNames.add(nameKey);
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    // ── 4. Build insert batch ────────────────────────────────────
    interface InsertRow {
      agency_id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      agent_npn: string | null;
      is_manager: boolean;
      status: string;
    }

    const toInsert: InsertRow[] = [];
    const skippedNoAgency: string[] = [];
    const skippedDuplicate = { byNpn: 0, byName: 0 };
    const skippedNoName = 0;
    let skippedNoNameCount = 0;
    const agenciesCreated: string[] = [];

    for (const row of allRoster) {
      const d = row.row_data;
      const firstName = (d["First Name"] || "").trim();
      const lastName = (d["Last Name"] || "").trim();

      if (!firstName && !lastName) {
        skippedNoNameCount++;
        continue;
      }

      // Resolve agency
      const portalAgency = uploadAgencyMap.get(row.upload_id) || "";
      const rcbzagName = AGENCY_NAME_MAP[portalAgency];

      if (!rcbzagName) {
        skippedNoAgency.push(portalAgency);
        continue;
      }

      let agencyId = agencyByName.get(rcbzagName.toLowerCase());

      // If agency doesn't exist in rcbzag, create it
      if (!agencyId) {
        const { data: newAgency, error: createErr } = await app
          .from("agencies")
          .insert({ name: rcbzagName })
          .select("id")
          .single();

        if (createErr) {
          console.error(`Failed to create agency ${rcbzagName}:`, createErr.message);
          skippedNoAgency.push(portalAgency);
          continue;
        }

        agencyId = newAgency.id as string;
        agencyByName.set(rcbzagName.toLowerCase(), agencyId);
        agenciesCreated.push(rcbzagName);
      }

      // Dedup by NPN
      const npn = (d["Agent NPN"] || "").trim() || null;
      if (npn && existingNpns.has(npn)) {
        skippedDuplicate.byNpn++;
        continue;
      }

      // Dedup by name + agency
      const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${agencyId}`;
      if (existingNames.has(nameKey)) {
        skippedDuplicate.byName++;
        continue;
      }

      // Extract phone/email (handle both cased and lowercase keys)
      const phone = (d["Phone"] || d["phone"] || "").trim() || null;
      const email = (d["Email"] || d["email"] || "").trim() || null;

      toInsert.push({
        agency_id: agencyId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        agent_npn: npn,
        is_manager: false,
        status: "active",
      });

      // Track for dedup within this batch
      if (npn) existingNpns.add(npn);
      existingNames.add(nameKey);
    }

    // ── 5. Insert in batches of 200 ──────────────────────────────
    let inserted = 0;
    const BATCH = 200;

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error: insErr } = await app
        .from("agency_rosters")
        .insert(batch);

      if (insErr) {
        console.error(`Insert batch ${i / BATCH + 1} error:`, insErr.message);
        // Try one-by-one for this batch to skip individual failures
        for (const row of batch) {
          const { error: singleErr } = await app
            .from("agency_rosters")
            .insert(row);
          if (!singleErr) inserted++;
          else console.warn(`Skip: ${row.first_name} ${row.last_name} — ${singleErr.message}`);
        }
      } else {
        inserted += batch.length;
      }
    }

    // ── 6. Verify by reading back ────────────────────────────────
    const { count } = await app
      .from("agency_rosters")
      .select("*", { count: "exact", head: true });

    const elapsed = Math.round(performance.now() - started);

    return jsonResponse({
      success: true,
      source: {
        table: "crm_roster (portal DB)",
        total_rows: allRoster.length,
      },
      result: {
        inserted,
        skipped_no_name: skippedNoNameCount,
        skipped_no_agency: [...new Set(skippedNoAgency)],
        skipped_duplicate: skippedDuplicate,
        agencies_created: agenciesCreated,
      },
      verification: {
        agency_rosters_total: count,
      },
      _elapsed_ms: elapsed,
    });
  } catch (err) {
    console.error("roster-backfill error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
