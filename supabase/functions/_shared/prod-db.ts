/**
 * Shared production DB connection helper.
 *
 * Centralizes the direct Postgres connection to Max's production DB
 * (typed.unl_fym_policy_latest_load) for all edge functions that
 * need live policy data.
 *
 * Connection: read-only reader role, TLS required, single connection.
 */

import postgres from "npm:postgres@3.4.4";

/** Strip scheme/slash from host env value */
function cleanHost(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .split(":")[0]
    .trim();
}

/** Create a postgres.js connection to Max's production DB */
export function createProdConnection(): ReturnType<typeof postgres> {
  const host = Deno.env.get("PROD_DB_HOST");
  const port = Deno.env.get("PROD_DB_PORT");
  const db = Deno.env.get("PROD_DB_NAME");
  const user = Deno.env.get("PROD_DB_USER");
  const password = Deno.env.get("PROD_DB_PASSWORD");

  if (!host || !port || !db || !user || !password) {
    throw new Error(
      "Missing PROD_DB_* env vars: " +
        ["PROD_DB_HOST", "PROD_DB_PORT", "PROD_DB_NAME", "PROD_DB_USER", "PROD_DB_PASSWORD"]
          .filter((k) => !Deno.env.get(k))
          .join(", ")
    );
  }

  const caCert = Deno.env.get("PROD_DB_CA_CERT");

  return postgres({
    host: cleanHost(host),
    port: Number(port.replace(/\D/g, "")),
    database: db,
    username: user,
    password,
    ssl: caCert ? { ca: caCert } : "require",
    max: 1,
    idle_timeout: 10,
    connect_timeout: 30,
  });
}

// ── Title case helper ────────────────────────────────────────────────
// Max's DB stores names in ALL CAPS. Convert to proper Title Case.
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-'/])\S/g, (ch) => ch.toUpperCase());
}

// ── FYM MGA parent writing number ─────────────────────────────────────
// Policies with null/empty ga are FYM direct agents — no sub-agency in
// the hierarchy. All such production rolls up under FYM.
export const FYM_MGA_WN = '202JVV00';

// ── Contract code → status ────────────────────────────────────────────
export const CONTRACT_STATUS: Record<string, string> = {
  A: "active",
  T: "terminated",
  P: "pending",
  S: "suspended",
};

// ── Plan code → product type ──────────────────────────────────────────
export function planToProductType(planCode: string): string {
  const upper = planCode.toUpperCase();
  if (upper.includes("HHC") || upper.includes("AHH")) return "HHC";
  return "HI";
}

// ── Extract agency writing number from roster hierarchy (LEGACY) ─────
// roster_hierarchy_json is currently empty in Max's DB (0/46K rows as of
// 2026-08-10). Kept for backward compat if it comes back.
export function extractAgencyWritingNumber(
  roster: Array<{
    writing_number: string;
    depth: string;
    is_person: boolean;
    name: string;
  }> | null
): string | null {
  if (!roster || !Array.isArray(roster)) return null;
  const depth02 = roster.find((e) => e.depth === "02" && !e.is_person);
  if (depth02) return depth02.writing_number?.trim() || null;
  const depth01 = roster.find((e) => e.depth === "01");
  if (depth01) return depth01.writing_number?.trim() || null;
  return null;
}

// ── Extract writing agent's writing number (LEGACY) ──────────────────
export function extractAgentWritingNumber(
  roster: Array<{
    writing_number: string;
    depth: string;
    is_person: boolean;
    name: string;
  }> | null
): string | null {
  if (!roster || !Array.isArray(roster)) return null;
  const sorted = [...roster].sort((a, b) => b.depth.localeCompare(a.depth));
  const agent = sorted[0];
  return agent?.writing_number?.trim() || null;
}

// ── Flattened hierarchy extraction (PRIMARY — always populated) ──────
// Max's DB has flattened fields: ga (depth-02 agency WN), wa (depth-03
// writing agent WN). These are 100% populated vs roster_hierarchy_json
// which is currently empty. Use these as the primary resolution path.

/** Extract agency writing number from flattened ga field (depth-02). */
export function extractAgencyWnFlat(row: Record<string, unknown>): string | null {
  const ga = row.ga as string | null;
  if (!ga) return null;
  const trimmed = ga.trim();
  return trimmed || null;
}

/** Extract agent writing number from flattened wa field (writing agent). */
export function extractAgentWnFlat(row: Record<string, unknown>): string | null {
  const wa = row.wa as string | null;
  if (!wa) return null;
  const trimmed = wa.trim();
  return trimmed || null;
}

/**
 * Resolve agency writing number — tries flattened fields first (always
 * populated), then falls back to roster_hierarchy_json (currently empty
 * but kept for forward compat).
 */
export function resolveAgencyWn(
  row: Record<string, unknown>,
  roster: Array<{ writing_number: string; depth: string; is_person: boolean; name: string }> | null
): string | null {
  const flat = extractAgencyWnFlat(row);
  if (flat) return flat;
  const fromRoster = extractAgencyWritingNumber(roster);
  if (fromRoster) return fromRoster;
  // Blank ga = FYM direct agent (no sub-agency in the hierarchy).
  // All production with null/empty ga rolls up under FYM.
  return '202JVV00';
}

/**
 * Resolve agent writing number — tries flattened fields first, then
 * falls back to roster_hierarchy_json.
 */
export function resolveAgentWn(
  row: Record<string, unknown>,
  roster: Array<{ writing_number: string; depth: string; is_person: boolean; name: string }> | null
): string | null {
  return extractAgentWnFlat(row) || extractAgentWritingNumber(roster);
}

// ── Estimate draft count from dates + billing mode ────────────────────
export function estimateDraftCount(
  appRecvdDate: string | null,
  paidToDate: string | null,
  billingMode: number | null
): number {
  if (!appRecvdDate || !paidToDate) return 0;
  const eff = new Date(appRecvdDate);
  const paid = new Date(paidToDate);
  const diffMs = paid.getTime() - eff.getTime();
  if (diffMs < 0) return 0;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const mode = billingMode ?? 1;
  if (mode === 12) return diffDays >= 30 ? 1 : 0;
  if (mode === 6) return Math.floor(diffDays / 182) + (diffDays >= 30 ? 1 : 0);
  if (mode === 3) return Math.floor(diffDays / 91) + (diffDays >= 30 ? 1 : 0);
  return Math.max(0, Math.floor(diffDays / 30));
}

// ── Resolve at-risk flag ──────────────────────────────────────────────
// At-risk = UNL's own at_risk_policy flag on ACTIVE policies only.
// Payment-lag heuristics (paid_to_date < today) removed 2026-08-03 —
// that was tool-side definition drift (AGENTS.md standing rule: metric
// definitions live in Max's DB, not edge functions).
export function resolveRiskFlag(
  atRiskPolicy: boolean | null,
  status: string,
  _paidToDate: string | null
): { isAtRisk: boolean; flagType: string | null } {
  // Only count UNL's flag, and only for active policies
  if (atRiskPolicy === true && status === "active") {
    return { isAtRisk: true, flagType: "at_risk" };
  }
  return { isAtRisk: false, flagType: null };
}

/**
 * Allowed origins for CORS. Requests from other origins get no
 * Access-Control-Allow-Origin header, so browsers block the response.
 * Server-to-server callers (cron, webhooks) are unaffected by CORS.
 */
const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://www.agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "http://localhost:5173",   // Vite dev
  "http://localhost:3000",   // alternate dev
  "http://localhost:4173",   // Vite preview
];

/** Return the origin if it's on the allowlist, otherwise undefined. */
export function getAllowedOrigin(req?: Request | null): string | undefined {
  const origin = req?.headers?.get("Origin") || req?.headers?.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return undefined;
}

/** Build CORS headers for a given request. */
export function corsHeaders(req?: Request | null): Record<string, string> {
  const origin = getAllowedOrigin(req);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

/** Standard JSON response helper */
export function jsonResponse(data: unknown, status = 200, req?: Request | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req),
    },
  });
}

/** CORS preflight handler */
export function corsResponse(req?: Request | null): Response {
  return new Response("ok", {
    headers: {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    },
  });
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Verify that the request has a valid Supabase JWT.
 * Returns the authenticated user or null if invalid/missing.
 * Uses the FYM App project's service role key to verify tokens.
 */
export async function verifyAuth(req: Request): Promise<{
  user: { id: string; email?: string } | null;
  error: string | null;
}> {
  const authHeader = req.headers.get("Authorization") || "";
  const apiKey = req.headers.get("apikey") || "";

  // Accept either Bearer token or apikey
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : apiKey;

  if (!token) {
    return { user: null, error: "Missing authorization" };
  }

  // If the token is just the anon key, reject — we need a user JWT or service role key
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (token === anonKey) {
    return { user: null, error: "Anon key is not sufficient — user JWT required" };
  }

  // Verify the JWT using the service role key
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("APP_SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SUPABASE_SERVICE_KEY") || "";

  if (!supabaseUrl || !serviceKey) {
    return { user: null, error: "Auth not configured" };
  }

  // Service role key = trusted server-to-server caller (pg_cron, webhooks).
  // Skip getUser() — service keys are not user JWTs.
  if (token === serviceKey) {
    return { user: { id: "service_role", email: "cron@system" }, error: null };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { user: null, error: "Invalid or expired token" };
    }
    return { user: { id: user.id, email: user.email }, error: null };
  } catch {
    return { user: null, error: "Auth verification failed" };
  }
}
