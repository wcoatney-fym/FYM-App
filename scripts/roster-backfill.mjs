#!/usr/bin/env node
/**
 * roster-backfill.mjs — One-time backfill of agency_rosters from CRM Ops rosters
 *
 * Source: crm_roster (portal DB akhojh) — uploaded CSV rosters with phone/email
 * Target: agency_rosters (FYM App DB rcbzag) — the Agent Directory's Tier 1 data
 *
 * Run from Hostinger container (has both DB credentials via Management API).
 *
 * Usage: node scripts/roster-backfill.mjs [--dry-run]
 */

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PORTAL_REF = "akhojhncsswyzcnicedt";
const APP_REF = "rcbzagjyhyrkuwvlrlnf";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_ACCESS_TOKEN) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

// ── Agency name crosswalk: portal crm_roster_uploads.agency → rcbzag agencies.name
const AGENCY_NAME_MAP = {
  "FYM": "FYM",
  "DH Insurance Group": "Dh Insurance Group",
  "Berith Partners LLC": "Berith Partners LLC",
  "Wisechoice": "Wisechoice Senior Advisors Llc",
  "MHA (YFMO)": "Medicare Health Advisors",
  "MHA (IFG)": "Medicare Health Advisors",
  "Aspire": "Aspire",
};

async function query(projectRef, sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL error (${projectRef}): ${res.status} — ${text}`);
  }
  return res.json();
}

function escSQL(s) {
  if (s === null || s === undefined) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function main() {
  console.log(`\n🔄 Roster Backfill — ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  // ── 1. Load rcbzag agencies ────────────────────────────────────
  const agencies = await query(APP_REF, "SELECT id, name FROM agencies ORDER BY name");
  const agencyByName = new Map();
  for (const a of agencies) {
    agencyByName.set(a.name.toLowerCase(), a.id);
  }
  console.log(`📋 Loaded ${agencies.length} agencies from rcbzag`);

  // ── 2. Load portal uploads + roster rows ───────────────────────
  const uploads = await query(PORTAL_REF, "SELECT id, agency, row_count FROM crm_roster_uploads ORDER BY agency");
  console.log(`📋 Found ${uploads.length} roster uploads in portal:`);
  for (const u of uploads) {
    console.log(`   • ${u.agency}: ${u.row_count} rows (upload ${u.id})`);
  }

  const uploadAgencyMap = new Map();
  for (const u of uploads) {
    uploadAgencyMap.set(u.id, u.agency);
  }

  // Load all roster rows
  const allRoster = await query(PORTAL_REF,
    "SELECT r.id, r.row_data, r.upload_id FROM crm_roster r ORDER BY r.upload_id"
  );
  console.log(`📋 Loaded ${allRoster.length} total roster rows from portal\n`);

  // ── 3. Load existing agency_rosters for dedup ──────────────────
  const existing = await query(APP_REF,
    "SELECT agent_npn, first_name, last_name, agency_id FROM agency_rosters"
  );
  const existingNpns = new Set();
  const existingNames = new Set();
  for (const r of existing) {
    if (r.agent_npn) existingNpns.add(r.agent_npn.trim());
    const key = `${(r.first_name || "").trim().toLowerCase()}|${(r.last_name || "").trim().toLowerCase()}|${r.agency_id}`;
    existingNames.add(key);
  }
  console.log(`📋 Existing agency_rosters: ${existing.length} rows (${existingNpns.size} NPNs)\n`);

  // ── 4. Process roster rows per agency ──────────────────────────
  // Group by portal agency name
  const byAgency = new Map();
  for (const row of allRoster) {
    const portalAgency = uploadAgencyMap.get(row.upload_id) || "UNKNOWN";
    if (!byAgency.has(portalAgency)) byAgency.set(portalAgency, []);
    byAgency.get(portalAgency).push(row);
  }

  const stats = {
    inserted: 0,
    skippedNoName: 0,
    skippedDupNpn: 0,
    skippedDupName: 0,
    skippedNoAgency: [],
    agenciesCreated: [],
    uploadsCreated: [],
  };

  // Will's admin UUID for uploaded_by
  const ADMIN_UUID = "39229ac7-b57e-4068-a6b5-bf335e056236";

  for (const [portalAgency, rows] of byAgency) {
    const rcbzagName = AGENCY_NAME_MAP[portalAgency];
    if (!rcbzagName) {
      console.log(`⚠️  Skipping ${rows.length} rows — no mapping for portal agency "${portalAgency}"`);
      stats.skippedNoAgency.push(portalAgency);
      continue;
    }

    let agencyId = agencyByName.get(rcbzagName.toLowerCase());

    // Create agency if missing
    if (!agencyId) {
      console.log(`🏢 Creating agency "${rcbzagName}" in rcbzag...`);
      if (!DRY_RUN) {
        const result = await query(APP_REF,
          `INSERT INTO agencies (name) VALUES (${escSQL(rcbzagName)}) RETURNING id`
        );
        agencyId = result[0].id;
        agencyByName.set(rcbzagName.toLowerCase(), agencyId);
      } else {
        agencyId = "DRY-RUN-UUID";
      }
      stats.agenciesCreated.push(rcbzagName);
    }

    // Create an upload record for this agency's backfill
    let uploadId;
    const fileName = `crm-ops-backfill-${portalAgency.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.csv`;
    console.log(`📤 Creating upload record for ${portalAgency} (${rows.length} rows)...`);

    if (!DRY_RUN) {
      const uploadResult = await query(APP_REF,
        `INSERT INTO agency_roster_uploads (agency_id, file_name, row_count, uploaded_by, status)
         VALUES (${escSQL(agencyId)}, ${escSQL(fileName)}, ${rows.length}, ${escSQL(ADMIN_UUID)}, 'active')
         RETURNING id`
      );
      uploadId = uploadResult[0].id;
    } else {
      uploadId = "DRY-RUN-UPLOAD-UUID";
    }
    stats.uploadsCreated.push({ agency: portalAgency, uploadId });

    // Process rows for this agency
    const toInsert = [];
    for (const row of rows) {
      const d = row.row_data;
      const firstName = (d["First Name"] || "").trim();
      const lastName = (d["Last Name"] || "").trim();

      if (!firstName && !lastName) {
        stats.skippedNoName++;
        continue;
      }

      const npn = (d["Agent NPN"] || "").trim() || null;

      // Dedup by NPN
      if (npn && existingNpns.has(npn)) {
        stats.skippedDupNpn++;
        continue;
      }

      // Dedup by name + agency
      const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${agencyId}`;
      if (existingNames.has(nameKey)) {
        stats.skippedDupName++;
        continue;
      }

      const phone = (d["Phone"] || d["phone"] || "").trim() || null;
      const email = (d["Email"] || d["email"] || "").trim() || null;

      toInsert.push({ firstName, lastName, email, phone, npn });

      // Track for within-batch dedup
      if (npn) existingNpns.add(npn);
      existingNames.add(nameKey);
    }

    // Insert in batches via SQL
    if (toInsert.length > 0 && !DRY_RUN) {
      const BATCH = 100;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        const values = batch.map(r =>
          `(${escSQL(uploadId)}, ${escSQL(agencyId)}, ${escSQL(r.firstName)}, ${escSQL(r.lastName)}, ${escSQL(r.email)}, ${escSQL(r.phone)}, ${escSQL(r.npn)}, false, 'active')`
        ).join(",\n  ");

        await query(APP_REF,
          `INSERT INTO agency_rosters (upload_id, agency_id, first_name, last_name, email, phone, agent_npn, is_manager, status)
           VALUES ${values}`
        );
      }
    }

    stats.inserted += toInsert.length;
    console.log(`   ✅ ${portalAgency}: ${toInsert.length} inserted, ${rows.length - toInsert.length} skipped`);
  }

  // ── 5. Verify ──────────────────────────────────────────────────
  if (!DRY_RUN) {
    const verify = await query(APP_REF,
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as with_phone,
              COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email
       FROM agency_rosters`
    );
    console.log(`\n✅ Verification — agency_rosters now has:`);
    console.log(`   Total: ${verify[0].total}`);
    console.log(`   With phone: ${verify[0].with_phone}`);
    console.log(`   With email: ${verify[0].with_email}`);

    // Per-agency breakdown
    const byAg = await query(APP_REF,
      `SELECT a.name, COUNT(r.id) as count,
              COUNT(CASE WHEN r.phone IS NOT NULL AND r.phone != '' THEN 1 END) as phones,
              COUNT(CASE WHEN r.email IS NOT NULL AND r.email != '' THEN 1 END) as emails
       FROM agency_rosters r JOIN agencies a ON a.id = r.agency_id
       GROUP BY a.name ORDER BY count DESC`
    );
    console.log(`\n   Per agency:`);
    for (const row of byAg) {
      console.log(`   • ${row.name}: ${row.count} agents (${row.phones} phone, ${row.emails} email)`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Inserted: ${stats.inserted}`);
  console.log(`   Skipped (no name): ${stats.skippedNoName}`);
  console.log(`   Skipped (dup NPN): ${stats.skippedDupNpn}`);
  console.log(`   Skipped (dup name): ${stats.skippedDupName}`);
  if (stats.skippedNoAgency.length > 0) {
    console.log(`   Skipped (no agency mapping): ${stats.skippedNoAgency.join(", ")}`);
  }
  if (stats.agenciesCreated.length > 0) {
    console.log(`   Agencies created: ${stats.agenciesCreated.join(", ")}`);
  }
  console.log(`\n${DRY_RUN ? "🏁 Dry run complete — no data modified." : "🏁 Backfill complete."}\n`);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
