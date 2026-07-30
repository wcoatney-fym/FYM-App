/**
 * sync-policy-cache — FYM App edge function
 *
 * Reads live policy data DIRECTLY from Max's production DB
 * (typed.unl_fym_policy_latest_load) and upserts into policy_cache in the
 * FYM App DB (rcbzag).
 *
 * Also syncs agencies from the Sales Tracker → rcbzag.agencies so agency
 * names stay current as new sub-agencies are added.
 *
 * This is the ONLY data path for policy_cache. No intermediary copies.
 * Same connection pattern as quality-metrics-direct in the Sales Tracker.
 *
 * Invocation:
 *   - Manual: POST /functions/v1/sync-policy-cache (with service role key)
 *   - Scheduled: daily cron via pg_cron at 09:00 UTC
 *
 * Env vars required (set in Supabase dashboard → Functions → Secrets):
 *   PROD_DB_HOST            — Max's production DB host
 *   PROD_DB_PORT            — Max's production DB port
 *   PROD_DB_NAME            — Max's production DB name
 *   PROD_DB_USER            — Max's production DB user (read-only)
 *   PROD_DB_PASSWORD        — Max's production DB password
 *   TRACKER_SUPABASE_URL    — tracker project URL (lryxx) — for agency mapping
 *   TRACKER_SUPABASE_KEY    — tracker anon/publishable key (read-only)
 *   APP_SUPABASE_URL        — FYM App project URL (rcbzag)
 *   APP_SUPABASE_SERVICE_KEY — FYM App service role key (needed for upsert)
 */

import postgres from "npm:postgres@3.4.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UPSERT_BATCH = 500;

// ── Contract code → status ────────────────────────────────────────────────
const CONTRACT_STATUS: Record<string, string> = {
  A: "active",
  T: "terminated",
  P: "pending",
  S: "suspended",
};

// ── Plan code → product type ──────────────────────────────────────────────
// HHC plan codes contain "HHC" or "AHH" (covers UNAHH variants).
// Everything else in the FYM book is Hospital Indemnity (HI).
function planToProductType(planCode: string): string {
  const upper = planCode.toUpperCase();
  if (upper.includes("HHC") || upper.includes("AHH")) return "HHC";
  return "HI";
}

// ── Strip scheme/slash from host env value ─────────────────────────────────
function cleanHost(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .split(":")[0]
    .trim();
}

// ── Estimate draft count from dates + billing mode ────────────────────────
// billing_mode: 1=monthly, 3=quarterly, 6=semi-annual, 12=annual
function estimateDraftCount(
  issueDate: string | null,
  paidToDate: string | null,
  billingMode: number | null
): number {
  if (!issueDate || !paidToDate) return 0;
  const eff = new Date(issueDate);
  const paid = new Date(paidToDate);
  const diffMs = paid.getTime() - eff.getTime();
  if (diffMs < 0) return 0;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const mode = billingMode ?? 1;
  if (mode === 12) return diffDays >= 30 ? 1 : 0;
  if (mode === 6)
    return Math.floor(diffDays / 182) + (diffDays >= 30 ? 1 : 0);
  if (mode === 3)
    return Math.floor(diffDays / 91) + (diffDays >= 30 ? 1 : 0);
  // monthly (default)
  return Math.max(0, Math.floor(diffDays / 30));
}

// ── Resolve at-risk flag from prod data ───────────────────────────────────
// Uses Max's at_risk_policy boolean as primary signal; falls back to
// paid_to_date lag for active policies without the flag.
function resolveRiskFlag(
  atRiskPolicy: boolean | null,
  status: string,
  paidToDate: string | null
): { isAtRisk: boolean; flagType: string | null } {
  // Max's DB has a canonical at_risk_policy boolean — trust it first
  if (atRiskPolicy === true) {
    return { isAtRisk: true, flagType: "at_risk" };
  }

  // Non-active policies are not at risk
  if (status !== "active") {
    return { isAtRisk: false, flagType: null };
  }

  // Active policy with paid_to_date behind today = at risk (payment lag)
  if (paidToDate) {
    const paid = new Date(paidToDate);
    const lagDays =
      (new Date().getTime() - paid.getTime()) / (1000 * 60 * 60 * 24);
    if (lagDays > 0) {
      return {
        isAtRisk: true,
        flagType: lagDays >= 30 ? "payment_failed" : "payment_watch",
      };
    }
  }

  return { isAtRisk: false, flagType: null };
}

// ── Extract agency writing number from roster hierarchy ───────────────────
// The owning sub-agency is the shallowest non-person node at depth 02.
// If no depth-02 exists, fall back to depth-01 (FYM direct).
function extractAgencyWritingNumber(
  roster: Array<{
    writing_number: string;
    depth: string;
    is_person: boolean;
    name: string;
  }> | null
): string | null {
  if (!roster || !Array.isArray(roster)) return null;

  // Depth-02 non-person = sub-agency
  const depth02 = roster.find(
    (e) => e.depth === "02" && !e.is_person
  );
  if (depth02) return depth02.writing_number?.trim() || null;

  // Fall back to depth-01 (FYM direct)
  const depth01 = roster.find((e) => e.depth === "01");
  if (depth01) return depth01.writing_number?.trim() || null;

  return null;
}

// ── Extract writing agent's writing number ────────────────────────────────
// The deepest person node in the hierarchy is the writing agent.
function extractAgentWritingNumber(
  roster: Array<{
    writing_number: string;
    depth: string;
    is_person: boolean;
    name: string;
  }> | null
): string | null {
  if (!roster || !Array.isArray(roster)) return null;

  // Find the deepest node — that's the writing agent
  const sorted = [...roster].sort(
    (a, b) => b.depth.localeCompare(a.depth)
  );
  const agent = sorted[0];
  return agent?.writing_number?.trim() || null;
}

// ── Sync agencies from tracker → rcbzag ───────────────────────────────────
async function syncAgencies(
  tracker: ReturnType<typeof createClient>,
  app: ReturnType<typeof createClient>
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  let offset = 0;

  while (true) {
    const { data: agencies, error } = await tracker
      .from("agencies")
      .select("id, name, slug, is_active")
      .order("name", { ascending: true })
      .range(offset, offset + UPSERT_BATCH - 1);

    if (error) {
      errors.push(`agencies fetch @${offset}: ${error.message}`);
      break;
    }
    if (!agencies || agencies.length === 0) break;

    const rows = agencies.map(
      (a: { id: string; name: string; slug: string | null; is_active: boolean }) => ({
        tracker_id: a.id,
        name: a.name,
        slug: a.slug ?? null,
        is_active: a.is_active,
      })
    );

    const { error: upsertError } = await app
      .from("agencies")
      .upsert(rows, { onConflict: "tracker_id" });

    if (upsertError) {
      errors.push(`agencies upsert @${offset}: ${upsertError.message}`);
    } else {
      synced += rows.length;
    }

    if (agencies.length < UPSERT_BATCH) break;
    offset += UPSERT_BATCH;
  }

  return { synced, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const started = performance.now();

  // ── Env vars ──────────────────────────────────────────────────────────
  const prodHost = Deno.env.get("PROD_DB_HOST");
  const prodPort = Deno.env.get("PROD_DB_PORT");
  const prodDb = Deno.env.get("PROD_DB_NAME");
  const prodUser = Deno.env.get("PROD_DB_USER");
  const prodPassword = Deno.env.get("PROD_DB_PASSWORD");
  const trackerUrl = Deno.env.get("TRACKER_SUPABASE_URL");
  const trackerKey = Deno.env.get("TRACKER_SUPABASE_KEY");
  const appUrl = Deno.env.get("APP_SUPABASE_URL");
  const appServiceKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

  if (
    !prodHost ||
    !prodPort ||
    !prodDb ||
    !prodUser ||
    !prodPassword ||
    !trackerUrl ||
    !trackerKey ||
    !appUrl ||
    !appServiceKey
  ) {
    return new Response(
      JSON.stringify({
        error: "Missing required env vars",
        required: [
          "PROD_DB_HOST",
          "PROD_DB_PORT",
          "PROD_DB_NAME",
          "PROD_DB_USER",
          "PROD_DB_PASSWORD",
          "TRACKER_SUPABASE_URL",
          "TRACKER_SUPABASE_KEY",
          "APP_SUPABASE_URL",
          "APP_SUPABASE_SERVICE_KEY",
        ],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const tracker = createClient(trackerUrl, trackerKey);
  const app = createClient(appUrl, appServiceKey);
  const syncedAt = new Date().toISOString();
  const errorMessages: string[] = [];

  // ── Step 1: Sync agencies ──────────────────────────────────────────────
  const agencyResult = await syncAgencies(tracker, app);
  errorMessages.push(...agencyResult.errors);
  console.log(
    `Agencies synced: ${agencyResult.synced}, errors: ${agencyResult.errors.length}`
  );

  // ── Step 2: Load writing_number → agency UUID mapping from tracker ────
  const wnToAgencyId = new Map<string, string>();
  let awnOffset = 0;
  while (true) {
    const { data, error } = await tracker
      .from("agency_writing_numbers")
      .select("writing_number, agency_id")
      .range(awnOffset, awnOffset + UPSERT_BATCH - 1);
    if (error) {
      errorMessages.push(
        `agency_writing_numbers fetch @${awnOffset}: ${error.message}`
      );
      break;
    }
    for (const r of data ?? []) {
      if (r.writing_number) wnToAgencyId.set(r.writing_number.trim(), r.agency_id);
    }
    if ((data?.length ?? 0) < UPSERT_BATCH) break;
    awnOffset += UPSERT_BATCH;
  }
  console.log(`Loaded ${wnToAgencyId.size} writing_number → agency_id mappings`);

  // ── Step 3: Load writing_number → profile UUID mapping from app ───────
  const wnToProfileId = new Map<string, string>();
  let profileOffset = 0;
  while (true) {
    const { data: profiles, error } = await app
      .from("profiles")
      .select("id, writing_number")
      .not("writing_number", "is", null)
      .range(profileOffset, profileOffset + UPSERT_BATCH - 1);
    if (error) {
      console.error("Error loading profiles:", error.message);
      break;
    }
    for (const p of profiles ?? []) {
      if (p.writing_number) wnToProfileId.set(p.writing_number.trim(), p.id);
    }
    if ((profiles?.length ?? 0) < UPSERT_BATCH) break;
    profileOffset += UPSERT_BATCH;
  }
  console.log(`Loaded ${wnToProfileId.size} agent writing_number → profile UUID mappings`);

  // ── Step 4: Query Max's production DB directly ────────────────────────
  let sql: ReturnType<typeof postgres> | null = null;
  let totalSynced = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  try {
    const caCert = Deno.env.get("PROD_DB_CA_CERT");
    sql = postgres({
      host: cleanHost(prodHost),
      port: Number(prodPort.replace(/\D/g, "")),
      database: prodDb,
      username: prodUser,
      password: prodPassword,
      ssl: caCert ? { ca: caCert } : "require",
      max: 1,
      idle_timeout: 10,
      connect_timeout: 30,
    });

    // Pull ALL policies from the UNL view in one paginated sweep.
    // The view has ~44K rows — we batch by OFFSET/LIMIT to avoid memory spikes.
    const PAGE_SIZE = 2000;
    let offset = 0;

    while (true) {
      const rows = await sql`
        SELECT
          TRIM(policy_nbr)    AS policy_nbr,
          TRIM(plan_code)     AS plan_code,
          TRIM(cntrct_code)   AS cntrct_code,
          issue_date,
          paid_to_date,
          term_date,
          annual_premium,
          billing_mode,
          at_risk_policy,
          TRIM(first_name)    AS first_name,
          TRIM(last_name)     AS last_name,
          TRIM(ga_name)       AS ga_name,
          roster_hierarchy_json
        FROM typed.unl_fym_policy_latest_load
        ORDER BY policy_nbr
        OFFSET ${offset}
        LIMIT ${PAGE_SIZE}
      `;

      if (rows.length === 0) break;

      // Transform rows into policy_cache format
      const batch: Array<Record<string, unknown>> = [];

      for (const row of rows) {
        const policyNumber = (row.policy_nbr as string) || "";
        if (!policyNumber) {
          totalSkipped++;
          continue;
        }

        const planCode = (row.plan_code as string) || "";
        const productType = planToProductType(planCode);

        // Only sync HI and HHC policies
        if (productType !== "HI" && productType !== "HHC") {
          totalSkipped++;
          continue;
        }

        const cntrctCode = ((row.cntrct_code as string) || "").toUpperCase();
        const status = CONTRACT_STATUS[cntrctCode] || "pending";

        const annualPremium = Number(row.annual_premium) || 0;
        const monthlyPremium =
          Math.round((annualPremium / 12) * 100) / 100;

        const issueDate = row.issue_date
          ? new Date(row.issue_date as string).toISOString().split("T")[0]
          : null;
        const paidToDate = row.paid_to_date
          ? new Date(row.paid_to_date as string).toISOString().split("T")[0]
          : null;
        const billingMode = row.billing_mode != null ? String(row.billing_mode) : null;

        // Agency resolution via roster hierarchy
        const roster = row.roster_hierarchy_json as Array<{
          writing_number: string;
          depth: string;
          is_person: boolean;
          name: string;
        }> | null;

        const agencyWn = extractAgencyWritingNumber(roster);
        const agencyId = agencyWn
          ? wnToAgencyId.get(agencyWn) ?? "unknown"
          : "unknown";

        // Agent resolution
        const agentWn = extractAgentWritingNumber(roster);
        const agentId = agentWn
          ? wnToProfileId.get(agentWn) ?? null
          : null;

        // At-risk resolution
        const { isAtRisk, flagType } = resolveRiskFlag(
          row.at_risk_policy as boolean | null,
          status,
          paidToDate
        );

        // Draft count estimation
        const draftCount = estimateDraftCount(issueDate, paidToDate, row.billing_mode as number | null);

        // Client name
        const clientName =
          [row.first_name as string, row.last_name as string]
            .filter(Boolean)
            .map((s) => s.trim())
            .join(" ") || null;

        batch.push({
          policy_number: policyNumber,
          agent_id: agentId,
          agency_id: agencyId,
          product_type: productType,
          status,
          plan_premium: monthlyPremium,
          billing_mode: billingMode,
          policy_effective_date: issueDate,
          paid_to_date: paidToDate,
          draft_count: draftCount,
          last_contact_date: null,
          flag_type: flagType,
          is_at_risk: isAtRisk,
          synced_at: syncedAt,
          client_name: clientName,
          writing_number: agentWn,
        });
      }

      // Upsert batch into policy_cache
      if (batch.length > 0) {
        // Split into sub-batches for PostgREST
        for (let i = 0; i < batch.length; i += UPSERT_BATCH) {
          const subBatch = batch.slice(i, i + UPSERT_BATCH);
          const { error: upsertError } = await app
            .from("policy_cache")
            .upsert(subBatch as any, { onConflict: "policy_number" });

          if (upsertError) {
            console.error(
              `policy_cache upsert error @${offset + i}:`,
              upsertError.message
            );
            errorMessages.push(
              `policy_cache upsert @${offset + i}: ${upsertError.message}`
            );
            totalErrors++;
          } else {
            totalSynced += subBatch.length;
          }
        }
      }

      console.log(
        `Processed rows ${offset}–${offset + rows.length}: ${batch.length} upserted, ${rows.length - batch.length} skipped`
      );

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // ── Step 5: Mark policies removed from Max's DB ──────────────────────
    // Any policy_cache row NOT updated in this sync run is no longer in
    // Max's DB — mark it as stale (but don't delete, for audit trail).
    // We compare synced_at to detect rows that weren't touched.
    const { error: staleError, count: staleCount } = await app
      .from("policy_cache")
      .update({ status: "removed", is_at_risk: false, flag_type: null })
      .lt("synced_at", syncedAt)
      .neq("status", "removed")
      .select("policy_number", { count: "exact", head: true });

    if (staleError) {
      errorMessages.push(`stale-mark error: ${staleError.message}`);
    } else if (staleCount && staleCount > 0) {
      console.log(`Marked ${staleCount} stale policies as 'removed'`);
    }
  } catch (err) {
    console.error("Production DB query error:", err);
    errorMessages.push(`prod DB error: ${String(err)}`);
    totalErrors++;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }

  const elapsedMs = Math.round(performance.now() - started);
  const result = {
    ok: totalErrors === 0,
    source: "prod_direct",
    agencies: {
      synced: agencyResult.synced,
      errors: agencyResult.errors.length,
    },
    policies: {
      synced: totalSynced,
      skipped: totalSkipped,
      errors: totalErrors,
    },
    mappings: {
      agencyWritingNumbers: wnToAgencyId.size,
      agentProfiles: wnToProfileId.size,
    },
    errorMessages,
    syncedAt,
    elapsedMs,
  };

  console.log("Sync complete:", JSON.stringify(result));

  return new Response(JSON.stringify(result, null, 2), {
    status: totalErrors > 0 ? 207 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
