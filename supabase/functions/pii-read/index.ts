/**
 * pii-read — Server-side PII retrieval with audit logging
 *
 * Returns the SSN for a single agent_id from agent_intake.
 * Auth: requires FYM App admin session (rcbzag JWT via Authorization header).
 * Logs every access to pii_access_log with the real admin identity.
 *
 * NOTE: This function is deployed to AKHOJH (portal DB), not rcbzag.
 * It cross-references rcbzag for admin verification.
 *
 * Secrets (edge function env):
 *   APP_SUPABASE_URL          — FYM App project URL (rcbzag, for JWT verification)
 *   APP_SUPABASE_SERVICE_KEY  — FYM App service key (rcbzag, for JWT verification)
 *   SUPABASE_URL              — local akhojh project URL (auto-set by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — local akhojh service key (auto-set by Supabase)
 *
 * Rate limit: 10 requests per minute per IP (per-instance, not global —
 * horizontal scaling + cold starts mean this is NOT a global rate limit).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Rate limit: 10 requests per minute per IP (per-instance, not global) */
const ipHits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

/** Verify caller is an FYM App admin via their rcbzag JWT */
async function verifyFymAdmin(authHeader: string | null): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
}> {
  if (!authHeader?.startsWith("Bearer ")) return { valid: false };

  const appUrl =
    Deno.env.get("APP_SUPABASE_URL") || "";
  const serviceKey =
    Deno.env.get("APP_SUPABASE_SERVICE_KEY") || "";
  if (!appUrl || !serviceKey) return { valid: false };

  const appClient = createClient(appUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await appClient.auth.getUser(token);

  if (error || !user) return { valid: false };

  // Check fym_admins table on rcbzag
  const { data: admin } = await appClient
    .from("fym_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) return { valid: false };

  return { valid: true, userId: user.id, email: user.email };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Rate limit
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  if (rateLimit(ip)) {
    return json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    // 1. Authenticate: verify caller is FYM App admin via rcbzag JWT
    const auth = await verifyFymAdmin(req.headers.get("Authorization"));
    if (!auth.valid || !auth.userId || !auth.email) {
      return json({ error: "Unauthorized — FYM admin required" }, 401);
    }

    // 2. Parse request
    const { agent_id } = await req.json();
    if (!agent_id || typeof agent_id !== "string") {
      return json({ error: "agent_id required" }, 400);
    }

    // UUID format check
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        agent_id,
      )
    ) {
      return json({ error: "Invalid agent_id format" }, 400);
    }

    // 3. Read SSN from agent_intake using local service_role (bypasses anon REVOKE)
    const localUrl = Deno.env.get("SUPABASE_URL") || "";
    const localKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const localClient = createClient(localUrl, localKey);

    const { data, error } = await localClient
      .from("agent_intake")
      .select("ssn")
      .eq("agent_id", agent_id)
      .maybeSingle();

    if (error) {
      console.error("[pii-read] Query error:", error.message);
      return json({ error: "Internal error" }, 500);
    }

    if (!data || !data.ssn) {
      return json({ error: "No SSN on file for this agent" }, 404);
    }

    // 4. Log the access — rcbzag admin identity, NOT akhojh service account
    //
    // admin_user_id = auth.userId  (rcbzag auth.users.id — the real person)
    // admin_email   = auth.email   (rcbzag auth user email — e.g. will@teamfym.com)
    // NOT the shared akhojh service account (service@teamfym.com)
    //
    await localClient.from("pii_access_log").insert({
      admin_user_id: auth.userId,
      admin_email: auth.email,
      table_name: "agent_intake",
      record_id: agent_id,
      field_name: "ssn",
      ip_address: ip,
    });

    // 5. Return the SSN
    return json({ ssn: data.ssn }, 200);
  } catch (err) {
    console.error("[pii-read] Unexpected error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
