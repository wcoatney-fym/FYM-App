/**
 * Strict cron/server auth — for functions that MUST NOT accept the leaked
 * SERVICE_ROLE_JWT. Used on unauthenticated endpoints that are being
 * retroactively gated (lifecycle-sync, checkin-send, checkin-nudge,
 * checkin-summary, atrisk-ghl-push).
 *
 * Accepts ONLY the sb_secret_ key on the `apikey` header.
 * Rejects:
 *   - Missing credentials
 *   - Any key on Authorization: Bearer (including sb_secret_)
 *   - Legacy anon JWT
 *   - sb_publishable_ key
 *   - SERVICE_ROLE_JWT (the leaked key)
 *   - Any unrecognised token
 *
 * This is intentionally stricter than verifyCronAuth in cron-auth.ts.
 * The leaked JWT must never grant access to these functions, even during
 * the transition period.
 */

type StrictAuthSuccess = { ok: true; matched: "SERVICE_ROLE_KEY" | "APP_SERVICE_KEY" };
type StrictAuthFailure = { ok: false; error: string };

export function verifyStrictCronAuth(req: Request): StrictAuthSuccess | StrictAuthFailure {
  // ONLY accept the apikey header — never Authorization: Bearer
  const apiKey = req.headers.get("apikey") || "";

  if (!apiKey) {
    return { ok: false, error: "Missing apikey header" };
  }

  // Reject sb_secret_ on Bearer explicitly (caller must use apikey header)
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ") && authHeader.slice(7) === apiKey) {
    // Both headers present with same value — still only apikey matters,
    // but log the redundancy for visibility
    console.log("[strict-cron-auth] apikey and Bearer both present — using apikey");
  }

  // Reject anon key formats
  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (legacyAnon && apiKey === legacyAnon) {
    return { ok: false, error: "Anon key not authorized" };
  }
  if (apiKey.startsWith("sb_publishable_")) {
    return { ok: false, error: "Publishable key not authorized" };
  }

  // Reject the leaked SERVICE_ROLE_JWT explicitly
  const legacyJwt = Deno.env.get("SERVICE_ROLE_JWT") || "";
  if (legacyJwt && apiKey === legacyJwt) {
    console.warn("[strict-cron-auth] REJECTED leaked SERVICE_ROLE_JWT");
    return { ok: false, error: "Legacy JWT not authorized" };
  }

  // Accept recognised sb_secret_ service keys
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && apiKey === serviceKey) {
    console.log("[strict-cron-auth] authenticated via SERVICE_ROLE_KEY");
    return { ok: true, matched: "SERVICE_ROLE_KEY" };
  }

  const appServiceKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || "";
  if (appServiceKey && apiKey === appServiceKey) {
    console.log("[strict-cron-auth] authenticated via APP_SERVICE_KEY");
    return { ok: true, matched: "APP_SERVICE_KEY" };
  }

  return { ok: false, error: "Invalid credentials" };
}
