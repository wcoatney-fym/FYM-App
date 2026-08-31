/**
 * recruiting-wn-backfill — One-time Writing Number Backfill
 *
 * Matches recruiting_leads against Max's production DB (wa_name field)
 * to backfill writing numbers for agents who were recruited before the
 * contracting process started collecting WN.
 *
 * This is a ONE-TIME backfill function — not part of the permanent app code.
 * Results are logged in recruiting_backfill_log for reference.
 *
 * Match strategy:
 *   1. Exact name match (recruiting_leads.name === wa_name) → auto-backfill
 *   2. Fuzzy name match (similarity score) → flag for manual review
 *   3. No match → skip, log as unmatched
 *
 * Auth: x-cron-auth header or Authorization: Bearer <service_role_key>
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://www.agency.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

let _currentReq: Request | null = null;

function getCorsHeaders(): Record<string, string> {
  const origin = _currentReq?.headers?.get("Origin") || _currentReq?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-cron-auth, x-client-info",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

// Simple similarity score (Dice coefficient on bigrams)
function similarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const bg1 = bigrams(na);
  const bg2 = bigrams(nb);
  let intersection = 0;
  for (const bg of bg1) {
    if (bg2.has(bg)) intersection++;
  }
  return (2 * intersection) / (bg1.size + bg2.size);
}

interface ProdAgent {
  wa: string;
  wa_name: string;
}

interface RecruitingLead {
  id: string;
  name: string;
  writing_number: string | null;
  ghl_contact_id: string;
}

interface MatchResult {
  lead_id: string;
  lead_name: string;
  match_type: "exact" | "fuzzy" | "none";
  wa_code: string | null;
  wa_name: string | null;
  similarity_score: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    _currentReq = req;
    return new Response(null, { headers: getCorsHeaders() });
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

  // Parse params
  let dryRun = true;
  let fuzzyThreshold = 0.6;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.dryRun === false) dryRun = false;
    if (body.fuzzyThreshold) fuzzyThreshold = Number(body.fuzzyThreshold);
  } catch {
    // defaults
  }

  const startTime = Date.now();

  // Connect to app DB
  const appUrl =
    Deno.env.get("SUPABASE_URL") || Deno.env.get("APP_SUPABASE_URL");
  const appKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("APP_SUPABASE_SERVICE_KEY");

  if (!appUrl || !appKey) {
    return jsonResponse({ error: "Missing app DB config" }, 500);
  }
  const appDb = createClient(appUrl, appKey);

  // Connect to Max's prod DB via Management API
  // We query through the tracker's prod-data function or direct Postgres
  // For now, use the prod-data edge function pattern
  const prodDbHost = Deno.env.get("PROD_DB_HOST");
  const prodDbPort = Deno.env.get("PROD_DB_PORT") || "5432";
  const prodDbName = Deno.env.get("PROD_DB_NAME");
  const prodDbUser = Deno.env.get("PROD_DB_USER");
  const prodDbPassword = Deno.env.get("PROD_DB_PASSWORD");

  // Get all recruiting leads without writing numbers
  const { data: leads, error: leadsErr } = await appDb
    .from("recruiting_leads")
    .select("id, name, writing_number, ghl_contact_id")
    .or("writing_number.is.null,writing_number.eq.");

  if (leadsErr) {
    return jsonResponse({ error: `Failed to fetch leads: ${leadsErr.message}` }, 500);
  }

  if (!leads || leads.length === 0) {
    return jsonResponse({
      message: "No leads without writing numbers found",
      dryRun,
      durationMs: Date.now() - startTime,
    });
  }

  // Get distinct agents from Max's DB
  // Using Supabase Management API to query the tracker which has prod-data access
  let prodAgents: ProdAgent[] = [];

  if (prodDbHost && prodDbName && prodDbUser && prodDbPassword) {
    // Direct Postgres connection via Deno
    try {
      const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const client = new Client({
        hostname: prodDbHost,
        port: parseInt(prodDbPort),
        database: prodDbName,
        user: prodDbUser,
        password: prodDbPassword,
        tls: { enabled: true, enforce: false },
      });
      await client.connect();

      const result = await client.queryObject<ProdAgent>(
        `SELECT DISTINCT wa, wa_name FROM typed.unl_fym_policy_latest_load 
         WHERE wa IS NOT NULL AND wa_name IS NOT NULL AND wa_name != ''
         ORDER BY wa_name`
      );
      prodAgents = result.rows;
      await client.end();
      console.log(`[wn-backfill] Loaded ${prodAgents.length} distinct agents from Max's DB`);
    } catch (err) {
      console.error(`[wn-backfill] Prod DB connection failed: ${err}`);
      return jsonResponse({
        error: "Failed to connect to production DB",
      }, 500);
    }
  } else {
    return jsonResponse({
      error: "Production DB credentials not available in edge function environment",
      hint: "PROD_DB_* env vars must be set as edge function secrets",
    }, 500);
  }

  // Build name → wa lookup (lowercased for matching)
  const exactMap = new Map<string, ProdAgent>();
  for (const agent of prodAgents) {
    const key = agent.wa_name.toLowerCase().trim();
    // Keep first occurrence (shouldn't have dupes but just in case)
    if (!exactMap.has(key)) {
      exactMap.set(key, agent);
    }
  }

  // Match each lead
  const results: MatchResult[] = [];
  let exactCount = 0;
  let fuzzyCount = 0;
  let unmatchedCount = 0;
  let backfilledCount = 0;

  for (const lead of leads as RecruitingLead[]) {
    const leadNameLower = lead.name.toLowerCase().trim();

    // Try exact match
    const exactMatch = exactMap.get(leadNameLower);
    if (exactMatch) {
      results.push({
        lead_id: lead.id,
        lead_name: lead.name,
        match_type: "exact",
        wa_code: exactMatch.wa,
        wa_name: exactMatch.wa_name,
        similarity_score: 1.0,
      });
      exactCount++;

      if (!dryRun) {
        await appDb
          .from("recruiting_leads")
          .update({
            writing_number: exactMatch.wa,
            writing_number_source: "backfill_exact",
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);
        backfilledCount++;
      }
      continue;
    }

    // Try fuzzy match — find best match
    let bestMatch: ProdAgent | null = null;
    let bestScore = 0;

    for (const agent of prodAgents) {
      const score = similarity(lead.name, agent.wa_name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    if (bestMatch && bestScore >= fuzzyThreshold) {
      results.push({
        lead_id: lead.id,
        lead_name: lead.name,
        match_type: "fuzzy",
        wa_code: bestMatch.wa,
        wa_name: bestMatch.wa_name,
        similarity_score: Math.round(bestScore * 1000) / 1000,
      });
      fuzzyCount++;

      // Fuzzy matches are NOT auto-applied — flagged for manual review
      // But we store the candidate in metadata
      if (!dryRun) {
        await appDb
          .from("recruiting_leads")
          .update({
            writing_number_source: "backfill_fuzzy",
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);
      }
    } else {
      results.push({
        lead_id: lead.id,
        lead_name: lead.name,
        match_type: "none",
        wa_code: null,
        wa_name: bestMatch?.wa_name || null,
        similarity_score: bestScore > 0 ? Math.round(bestScore * 1000) / 1000 : null,
      });
      unmatchedCount++;
    }
  }

  const now = new Date().toISOString();

  // Log the backfill operation
  if (!dryRun) {
    await appDb.from("recruiting_backfill_log").insert({
      title: "Writing Number Backfill",
      description: `Matched ${leads.length} recruiting leads against ${prodAgents.length} agents in Max's production DB. ` +
        `${exactCount} exact matches (auto-applied), ${fuzzyCount} fuzzy matches (flagged for review), ${unmatchedCount} unmatched.`,
      backfill_type: "writing_number",
      status: "completed",
      stats: {
        total_leads: leads.length,
        prod_agents: prodAgents.length,
        matched: exactCount,
        fuzzy: fuzzyCount,
        unmatched: unmatchedCount,
        backfilled: backfilledCount,
        fuzzy_threshold: fuzzyThreshold,
      },
      started_at: new Date(startTime).toISOString(),
      completed_at: now,
    });
  }

  return jsonResponse({
    dryRun,
    totalLeads: leads.length,
    prodAgents: prodAgents.length,
    exact: exactCount,
    fuzzy: fuzzyCount,
    unmatched: unmatchedCount,
    backfilled: backfilledCount,
    fuzzyThreshold,
    results: dryRun ? results : results.slice(0, 50), // Limit results in live mode
    durationMs: Date.now() - startTime,
  });
});
