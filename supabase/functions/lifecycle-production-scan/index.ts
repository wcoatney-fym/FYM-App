/**
 * lifecycle-production-scan — Nightly scan of Max's production DB to detect
 * agents who have started producing (first policy issued).
 *
 * Queries typed.unl_fym_policy_latest_load for writing numbers that match
 * agent_lifecycle records, and updates is_producing + first_policy_at.
 *
 * This is the Tier 4 ("Producing") auto-detection mechanism.
 *
 * Schedule: nightly via cron (after Max's daily file lands).
 * Auth: service role + PROD_DB_* credentials.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createProdConnection } from "../_shared/prod-db.ts";

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

let _currentReq: Request | null = null;
function corsHeaders(): Record<string, string> {
  const origin = _currentReq?.headers?.get("Origin") || _currentReq?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

Deno.serve(async (req) => {
  _currentReq = req;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const started = performance.now();
  let prodDb: ReturnType<typeof createProdConnection> | null = null;

  try {
    // Connect to FYM App DB
    const appUrl =
      Deno.env.get("APP_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const appKey =
      Deno.env.get("APP_SUPABASE_SERVICE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    if (!appUrl || !appKey) {
      return jsonResponse(
        { error: "App Supabase credentials not configured" },
        500
      );
    }

    const supabase = createClient(appUrl, appKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get all lifecycle records that have writing numbers but aren't yet marked as producing
    // Also get already-producing ones to update first_policy_at if needed
    const PAGE_SIZE = 500;
    let lifecycleRecords: Array<{
      id: string;
      writing_number: string;
      is_producing: boolean;
      first_policy_at: string | null;
      lifecycle_status: string;
      portal_agent_id: string;
      first_name: string;
      last_name: string;
    }> = [];

    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("agent_lifecycle")
        .select(
          "id, writing_number, is_producing, first_policy_at, lifecycle_status, portal_agent_id, first_name, last_name"
        )
        .not("writing_number", "is", null)
        .neq("lifecycle_status", "terminated")
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return jsonResponse(
          { error: "Failed to load lifecycle records" },
          500
        );
      }
      lifecycleRecords = lifecycleRecords.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (lifecycleRecords.length === 0) {
      return jsonResponse({
        success: true,
        message: "No lifecycle records with writing numbers to scan",
        scanned: 0,
        new_producers: 0,
        elapsed_ms: Math.round(performance.now() - started),
      });
    }

    // Connect to Max's production DB
    prodDb = createProdConnection();

    // Get all distinct writing agents with their earliest issue date
    const writingNumbers = lifecycleRecords.map((r) => r.writing_number!.trim());

    // Query in batches to avoid huge IN clauses
    const BATCH_SIZE = 100;
    const prodResults = new Map<
      string,
      { earliest_issue_date: string; policy_count: number }
    >();

    for (let i = 0; i < writingNumbers.length; i += BATCH_SIZE) {
      const batch = writingNumbers.slice(i, i + BATCH_SIZE);
      const rows = await prodDb`
        SELECT
          TRIM(wa) AS writing_number,
          MIN(issue_date)::text AS earliest_issue_date,
          COUNT(*) AS policy_count
        FROM typed.unl_fym_policy_latest_load
        WHERE TRIM(wa) = ANY(${batch})
        GROUP BY TRIM(wa)
      `;

      for (const row of rows) {
        prodResults.set(row.writing_number, {
          earliest_issue_date: row.earliest_issue_date,
          policy_count: Number(row.policy_count),
        });
      }
    }

    // Update lifecycle records
    let newProducers = 0;
    let updatedProducers = 0;
    const errors: string[] = [];

    for (const record of lifecycleRecords) {
      const wn = record.writing_number!.trim();
      const prodData = prodResults.get(wn);

      if (prodData && !record.is_producing) {
        // New producer detected!
        const oldStatus = record.lifecycle_status;
        const newStatus =
          oldStatus === "pipeline" ||
          oldStatus === "crm_active" ||
          oldStatus === "rts"
            ? "producing"
            : oldStatus;

        const { error } = await supabase
          .from("agent_lifecycle")
          .update({
            is_producing: true,
            first_policy_at: prodData.earliest_issue_date,
            lifecycle_status: newStatus,
          })
          .eq("id", record.id);

        if (error) {
          errors.push(
            `Update ${record.first_name} ${record.last_name}: ${error.message}`
          );
        } else {
          newProducers++;

          // Log the event
          await supabase.from("agent_lifecycle_log").insert({
            lifecycle_id: record.id,
            action: "producing_detected",
            old_status: oldStatus,
            new_status: newStatus,
            details: {
              writing_number: wn,
              earliest_issue_date: prodData.earliest_issue_date,
              policy_count: prodData.policy_count,
            },
            performed_by: "system:production_scan",
          });
        }
      } else if (
        prodData &&
        record.is_producing &&
        !record.first_policy_at
      ) {
        // Already producing but missing first_policy_at — backfill it
        const { error } = await supabase
          .from("agent_lifecycle")
          .update({ first_policy_at: prodData.earliest_issue_date })
          .eq("id", record.id);

        if (!error) updatedProducers++;
      }
    }

    const elapsed = Math.round(performance.now() - started);

    return jsonResponse({
      success: true,
      scanned: lifecycleRecords.length,
      writing_numbers_with_production: prodResults.size,
      new_producers: newProducers,
      updated_producers: updatedProducers,
      errors: errors.length > 0 ? errors : undefined,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    return jsonResponse(
      { error: "Internal server error" },
      500
    );
  } finally {
    if (prodDb) {
      await prodDb.end();
    }
  }
});
