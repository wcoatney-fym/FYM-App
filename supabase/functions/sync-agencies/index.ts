/**
 * sync-agencies — Sync hierarchy_agencies (portal DB, akhojh) → agencies (FYM App, rcbzag)
 *
 * Makes hierarchy_agencies the single source of truth for the agency directory.
 * The `agencies` table in rcbzag continues to exist (profiles FK, auth chain,
 * roster-map joins) but is now populated exclusively from the hierarchy tab.
 *
 * Sync logic:
 *   - Reads all active agencies from hierarchy_agencies (akhojh) that have
 *     a unl_writing_number (agencies without one can't be linked to production data)
 *   - Upserts into agencies (rcbzag) keyed on writing_number
 *   - Sets name, slug, is_active from the hierarchy source
 *   - Preserves tracker_id if it already exists (legacy compat, will be dropped later)
 *   - Deactivates agencies in rcbzag that no longer exist in hierarchy (soft delete)
 *
 * Trigger: called on-demand from the Hierarchy tab when agencies are added/modified,
 *          or on a schedule via cron.
 *
 * Auth: requires service role key (cross-project writes).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTAL_REF = "akhojhncsswyzcnicedt";

// ── Auto-provision helpers ──────────────────────────────────────────────

function generatePassword(agencyName: string): string {
  const clean = agencyName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${clean}${rand}!`;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Auto-provision FYM App login credentials for a newly synced agency.
 * Creates a Supabase Auth user + profile + stores credentials on the agency row.
 * Best-effort — failures are logged but don't block the sync.
 */
async function autoProvisionLogin(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  agencyName: string,
  agencySlug: string | null,
): Promise<{ provisioned: boolean; email?: string; error?: string }> {
  try {
    const slug = agencySlug || toSlug(agencyName);
    const email = `${slug}@app.teamfym.com`;
    const password = generatePassword(agencyName);

    // Check if auth user already exists
    const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.find((u: { email?: string }) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      await supabase.auth.admin.updateUserById(userId, { password });
    } else {
      const { data: { user: newUser }, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !newUser) {
        return { provisioned: false, error: createErr?.message ?? 'Failed to create auth user' };
      }
      userId = newUser.id;
    }

    // Upsert profile
    await supabase.from('profiles').upsert({
      id: userId,
      role: 'admin',
      full_name: `${agencyName} Admin`,
      agency_id: agencyId,
      writing_number: null,
      npn: null,
      updated_at: new Date().toISOString(),
    });

    // Store credentials on agency row
    await supabase.from('agencies').update({
      app_login_email: email,
      app_login_password: password,
      updated_at: new Date().toISOString(),
    }).eq('id', agencyId);

    return { provisioned: true, email };
  } catch (err) {
    return { provisioned: false, error: "Provision failed" };
  }
}

interface HierarchyAgency {
  id: string;
  name: string;
  slug: string | null;
  unl_writing_number: string;
  is_active: boolean;
  agency_type: string | null;
  parent_agency_id: string | null;
  crm_enabled: boolean;
}

interface RcbzagAgency {
  id: string;
  name: string;
  slug: string | null;
  writing_number: string | null;
  tracker_id: string | null;
  is_active: boolean;
  crm_enabled: boolean;
}

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

function corsResponse(body?: string, status = 200): Response {
  const origin = _currentReq?.headers?.get("Origin") || _currentReq?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(body, { status, headers });
}

Deno.serve(async (req) => {
  _currentReq = req;
  if (req.method === "OPTIONS") return corsResponse();

  const started = performance.now();

  try {
    // ── 1. Connect to portal DB (akhojh) via Management API ──
    const mgmtToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
    if (!mgmtToken) {
      return corsResponse(JSON.stringify({ error: "SUPABASE_ACCESS_TOKEN not configured" }), 500);
    }

    const portalRes = await fetch(
      `https://api.supabase.com/v1/projects/${PORTAL_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mgmtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT id, name, slug, unl_writing_number, is_active, agency_type, parent_agency_id,
                   COALESCE(crm_enabled, false) as crm_enabled
            FROM hierarchy_agencies
            WHERE unl_writing_number IS NOT NULL
              AND unl_writing_number != ''
              AND is_active = true
            ORDER BY name
          `,
        }),
      }
    );

    if (!portalRes.ok) {
      const err = await portalRes.text();
      return corsResponse(JSON.stringify({ error: "Portal query failed" }), 500);
    }

    const hierarchyAgencies: HierarchyAgency[] = await portalRes.json();

    // ── 2. Connect to FYM App DB (rcbzag) ──
    const appUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const appKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!appUrl || !appKey) {
      return corsResponse(JSON.stringify({ error: "App Supabase credentials not configured" }), 500);
    }

    const supabase = createClient(appUrl, appKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 3. Load existing agencies from rcbzag ──
    const PAGE_SIZE = 500;
    let existingAgencies: RcbzagAgency[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name, slug, writing_number, tracker_id, is_active, crm_enabled")
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return corsResponse(JSON.stringify({ error: "Failed to load existing agencies" }), 500);
      }
      existingAgencies = existingAgencies.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Build lookup maps
    const existingByWn = new Map<string, RcbzagAgency>();
    const existingByName = new Map<string, RcbzagAgency>();
    for (const a of existingAgencies) {
      if (a.writing_number) existingByWn.set(a.writing_number, a);
      existingByName.set(a.name.toLowerCase().trim(), a);
    }

    // ── 4. Upsert: hierarchy → agencies ──
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let provisioned = 0;
    let errors: string[] = [];
    let provisionErrors: string[] = [];

    for (const ha of hierarchyAgencies) {
      const wn = ha.unl_writing_number.trim();
      const existing = existingByWn.get(wn);

      if (existing) {
        // Check if anything changed
        const nameChanged = existing.name !== ha.name;
        const slugChanged = existing.slug !== ha.slug;
        const activeChanged = existing.is_active !== ha.is_active;
        const crmChanged = existing.crm_enabled !== ha.crm_enabled;

        if (nameChanged || slugChanged || activeChanged || crmChanged) {
          const { error } = await supabase
            .from("agencies")
            .update({
              name: ha.name,
              slug: ha.slug,
              is_active: ha.is_active,
              crm_enabled: ha.crm_enabled,
            })
            .eq("id", existing.id);

          if (error) {
            errors.push(`Update ${ha.name}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          unchanged++;
        }
      } else {
        // Try to match by normalized name (for agencies that exist but don't have WN set yet)
        const normalizedName = ha.name.toLowerCase().trim();
        const nameMatch = existingByName.get(normalizedName);

        if (nameMatch) {
          // Update the existing row with the writing_number
          const { error } = await supabase
            .from("agencies")
            .update({
              writing_number: wn,
              name: ha.name,
              slug: ha.slug,
              is_active: ha.is_active,
              crm_enabled: ha.crm_enabled,
            })
            .eq("id", nameMatch.id);

          if (error) {
            errors.push(`Update (name match) ${ha.name}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          // Brand new agency — insert + auto-provision login
          const slug = ha.slug || ha.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const { data: insertedAgency, error } = await supabase
            .from("agencies")
            .insert({
              name: ha.name,
              slug,
              writing_number: wn,
              is_active: ha.is_active,
              crm_enabled: ha.crm_enabled,
            })
            .select('id')
            .maybeSingle();

          if (error) {
            errors.push(`Insert ${ha.name}: ${error.message}`);
          } else {
            created++;
            // Auto-provision FYM App login credentials
            if (insertedAgency?.id) {
              const provision = await autoProvisionLogin(supabase, insertedAgency.id, ha.name, slug);
              if (provision.provisioned) {
                provisioned++;
              } else {
                provisionErrors.push(`${ha.name}: ${provision.error}`);
              }
            }
          }
        }
      }
    }

    // ── 5. Deactivate agencies in rcbzag that are no longer in hierarchy ──
    // Only deactivate agencies that HAVE a writing_number (ones we manage)
    // Don't touch agencies without WN — those are legacy or manually managed
    const hierarchyWns = new Set(hierarchyAgencies.map((a) => a.unl_writing_number.trim()));
    let deactivated = 0;

    for (const existing of existingAgencies) {
      if (existing.writing_number && existing.is_active && !hierarchyWns.has(existing.writing_number)) {
        const { error } = await supabase
          .from("agencies")
          .update({ is_active: false })
          .eq("id", existing.id);

        if (error) {
          errors.push(`Deactivate ${existing.name}: ${error.message}`);
        } else {
          deactivated++;
        }
      }
    }

    const elapsed = Math.round(performance.now() - started);

    return corsResponse(
      JSON.stringify({
        success: true,
        source: "hierarchy_agencies (akhojh)",
        target: "agencies (rcbzag)",
        hierarchy_count: hierarchyAgencies.length,
        existing_count: existingAgencies.length,
        created,
        updated,
        unchanged,
        deactivated,
        provisioned,
        errors: errors.length > 0 ? errors : undefined,
        provision_errors: provisionErrors.length > 0 ? provisionErrors : undefined,
        elapsed_ms: elapsed,
      })
    );
  } catch (err) {
    return corsResponse(
      JSON.stringify({ error: "Internal server error" }),
      500
    );
  }
});
