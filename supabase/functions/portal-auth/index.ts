/**
 * portal-auth — Server-side Portal DB authentication
 *
 * Replaces the browser-side VITE_PORTAL_SERVICE_EMAIL/PASSWORD pattern.
 * The frontend calls this once on page load; the edge function:
 *   1. Validates the caller's FYM App JWT (must be an admin)
 *   2. Signs in to the Portal DB (akhojh) using server-side service credentials
 *   3. Returns the Portal access_token + refresh_token to the caller
 *
 * The frontend then uses these tokens for all Portal DB operations.
 * Service credentials never leave the server.
 *
 * Auth: requires FYM App admin session (JWT via Authorization header).
 * Secrets (edge function env):
 *   PORTAL_SERVICE_EMAIL    — portal service account email
 *   PORTAL_SERVICE_PASSWORD — portal service account password
 *   PORTAL_SUPABASE_URL     — portal project URL
 *   PORTAL_SUPABASE_KEY     — portal anon/publishable key
 *   APP_SUPABASE_URL        — FYM App project URL (for JWT verification)
 *   APP_SUPABASE_SERVICE_KEY — FYM App service key (for JWT verification)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "https://www.agency.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

function CORS_HEADERS(req?: Request | null): Record<string, string> {
  const origin = req?.headers?.get("Origin") || req?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS(req), "Content-Type": "application/json" },
  });
}

/** Verify the caller is an FYM App admin via their JWT */
async function verifyFymAdmin(authHeader: string | null): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
}> {
  if (!authHeader?.startsWith("Bearer ")) return { valid: false };

  const appUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!appUrl || !serviceKey) return { valid: false };

  const supabase = createClient(appUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return { valid: false };

  // Check fym_admins table
  const { data: admin } = await supabase
    .from("fym_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) return { valid: false };

  return { valid: true, userId: user.id, email: user.email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS(req) });
  }

  try {
    // 1. Verify caller is FYM App admin
    const auth = await verifyFymAdmin(req.headers.get("Authorization"));
    if (!auth.valid) {
      return json({ error: "Unauthorized — FYM admin required" }, 401);
    }

    // 2. Read server-side Portal credentials
    const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL") || "";
    const portalKey = Deno.env.get("PORTAL_SUPABASE_KEY") || "";
    const serviceEmail = Deno.env.get("PORTAL_SERVICE_EMAIL") || "";
    const servicePassword = Deno.env.get("PORTAL_SERVICE_PASSWORD") || "";

    if (!portalUrl || !portalKey || !serviceEmail || !servicePassword) {
      console.error("[portal-auth] Missing portal credentials in edge function env");
      return json({ error: "Portal authentication not configured" }, 500);
    }

    // 3. Sign in to Portal DB using server-side credentials
    const portalClient = createClient(portalUrl, portalKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signInData, error: signInError } =
      await portalClient.auth.signInWithPassword({
        email: serviceEmail,
        password: servicePassword,
      });

    if (signInError || !signInData.session) {
      console.error("[portal-auth] Portal sign-in failed:", signInError);
      return json({ error: "Portal authentication failed" }, 500);
    }

    // 4. Return Portal tokens to the caller
    return json({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
      portal_url: portalUrl,
      portal_key: portalKey,
    });
  } catch (err) {
    console.error("[portal-auth] Error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
