/**
 * Strict cron/server auth — accepts ONLY the sb_secret_ key on the
 * `apikey` header. Used on sensitive endpoints (lifecycle-sync,
 * checkin-send, checkin-nudge, checkin-summary, atrisk-ghl-push).
 *
 * Rejects:
 *   - Missing credentials
 *   - Legacy anon JWT
 *   - sb_publishable_ key
 *   - JWT-format tokens (legacy keys were revoked; reject the format)
 *   - Any unrecognised token
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

  // Reject any JWT-format token (legacy keys revoked — no JWT should be
  // accepted as an apikey on these endpoints)
  if (apiKey.startsWith("eyJ")) {
    console.warn("[strict-cron-auth] REJECTED JWT-format token");
    return { ok: false, error: "JWT tokens not authorized — use sb_secret_ key" };
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
