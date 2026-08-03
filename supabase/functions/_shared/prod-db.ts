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

// ── Extract agency writing number from roster hierarchy ───────────────
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

// ── Extract writing agent's writing number ────────────────────────────
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

/** Standard JSON response helper */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

/** CORS preflight handler */
export function corsResponse(): Response {
  return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    },
  });
}
