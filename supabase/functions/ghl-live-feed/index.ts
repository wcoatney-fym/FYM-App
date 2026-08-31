/**
 * ghl-live-feed — Read and toggle GHL live feed status for agencies.
 *
 * Reads/writes `ghl_api_enabled` on the Activity Tracker's `agencies` table
 * via the Supabase Management API. This is a pass-through — the actual GHL
 * push logic stays in the tracker's edge functions (lifecycle-direct,
 * sql-import-cron). Phase 2 will migrate those here.
 *
 * Actions:
 *   - list:   returns all agencies with their ghl_api_enabled status
 *   - toggle: sets ghl_api_enabled for a specific agency
 *   - sync:   sets ghl_api_enabled by agency name (case-insensitive)
 *
 * Auth: requires FYM App admin session (JWT via Authorization header).
 * Secrets: SUPABASE_ACCESS_TOKEN (Management API), TRACKER_PROJECT_REF.
 *
 * SECURITY: All user-supplied values are validated before use. The Management
 * API only accepts raw SQL strings (no parameterized queries), so we use strict
 * input validation + proper escaping as defense-in-depth.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRACKER_REF = "lryxxnpafaxjgehqirdp";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Input validation ──────────────────────────────────────────────────
// UUID v4 format: 8-4-4-4-12 hex chars
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Agency names: letters, numbers, spaces, hyphens, periods, ampersands,
// apostrophes, commas, parentheses. Max 200 chars. Rejects everything else.
const AGENCY_NAME_RE = /^[A-Za-z0-9 \-.'&,()]{1,200}$/;

const VALID_ACTIONS = new Set(["list", "toggle", "sync"]);

/** Validate UUID format strictly */
function isValidUUID(v: string): boolean {
  return UUID_RE.test(v);
}

/** Validate agency name format */
function isValidAgencyName(v: string): boolean {
  return AGENCY_NAME_RE.test(v);
}

/**
 * Escape a string for use in a SQL literal ('...'). 
 * Doubles single quotes and backslashes — Postgres standard_conforming_strings.
 * Only used AFTER input validation has already whitelist-approved the content.
 */
function escapeSqlLiteral(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Run a SQL query against the tracker DB via Management API */
async function trackerQuery(
  sql: string,
  mgmtToken: string
): Promise<unknown[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${TRACKER_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mgmtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${res.status}: ${text}`);
  }

  return (await res.json()) as unknown[];
}

/** Verify the caller is an FYM App admin via their JWT */
async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;

  const appUrl = Deno.env.get("APP_SUPABASE_URL");
  const serviceKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY");
  if (!appUrl || !serviceKey) return false;

  const supabase = createClient(appUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return false;

  // Check fym_admins table
  const { data: admin } = await supabase
    .from("fym_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !!admin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Auth check
    const isAdmin = await verifyAdmin(req.headers.get("Authorization"));
    if (!isAdmin) {
      return json({ error: "Unauthorized — FYM admin required" }, 401);
    }

    const mgmtToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
    if (!mgmtToken) {
      return json(
        { error: "SUPABASE_ACCESS_TOKEN not configured" },
        500
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = (body as Record<string, unknown>).action as string;

    if (!VALID_ACTIONS.has(action)) {
      return json(
        { error: `Unknown action: ${action}. Use "list", "toggle", or "sync".` },
        400
      );
    }

    switch (action) {
      case "list": {
        const rows = await trackerQuery(
          `SELECT id, name, slug, ghl_api_enabled
           FROM agencies
           WHERE is_active = true
           ORDER BY name`,
          mgmtToken
        );

        return json({ agencies: rows });
      }

      case "toggle": {
        const { agencyId, enabled } = body as {
          agencyId: string;
          enabled: boolean;
        };

        if (!agencyId) {
          return json({ error: "agencyId required" }, 400);
        }
        if (!isValidUUID(agencyId)) {
          return json({ error: "Invalid agencyId format (expected UUID)" }, 400);
        }
        if (typeof enabled !== "boolean") {
          return json({ error: "enabled (boolean) required" }, 400);
        }

        // UUID is validated — safe to interpolate (only hex + hyphens)
        const safeId = agencyId.toLowerCase();

        await trackerQuery(
          `UPDATE agencies
           SET ghl_api_enabled = ${enabled}
           WHERE id = '${safeId}'`,
          mgmtToken
        );

        // Read back to confirm
        const [updated] = await trackerQuery(
          `SELECT id, name, ghl_api_enabled
           FROM agencies
           WHERE id = '${safeId}'`,
          mgmtToken
        ) as Array<{ id: string; name: string; ghl_api_enabled: boolean }>;

        if (!updated) {
          return json({ error: "Agency not found" }, 404);
        }

        return json({
          success: true,
          agencyId: updated.id,
          name: updated.name,
          ghl_api_enabled: updated.ghl_api_enabled,
        });
      }

      case "sync": {
        const { agencyName, enabled: syncEnabled } = body as {
          agencyName: string;
          enabled: boolean;
        };

        if (!agencyName) {
          return json({ error: "agencyName required" }, 400);
        }
        if (!isValidAgencyName(agencyName)) {
          return json(
            { error: "Invalid agencyName format (letters, numbers, spaces, basic punctuation only, max 200 chars)" },
            400
          );
        }
        if (typeof syncEnabled !== "boolean") {
          return json({ error: "enabled (boolean) required" }, 400);
        }

        // Name validated against whitelist regex, then escaped for SQL literal
        const safeName = escapeSqlLiteral(agencyName);

        const matches = await trackerQuery(
          `UPDATE agencies
           SET ghl_api_enabled = ${syncEnabled}
           WHERE lower(name) = lower('${safeName}')
           RETURNING id, name, ghl_api_enabled`,
          mgmtToken
        ) as Array<{ id: string; name: string; ghl_api_enabled: boolean }>;

        if (matches.length === 0) {
          // No matching tracker agency — not an error, just means
          // this agency doesn't exist in the tracker yet
          return json({
            success: true,
            synced: false,
            reason: "No matching agency in tracker DB",
          });
        }

        return json({
          success: true,
          synced: true,
          agencyId: matches[0].id,
          name: matches[0].name,
          ghl_api_enabled: matches[0].ghl_api_enabled,
        });
      }

      default:
        // Unreachable due to VALID_ACTIONS check above, but TypeScript needs it
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("[ghl-live-feed] Error:", err);
    // Sanitize error — don't leak internal details to caller
    return json(
      { error: "Internal error" },
      500
    );
  }
});
