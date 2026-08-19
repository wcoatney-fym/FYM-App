/**
 * crm-ghl-sync — Push CRM custom values + create GHL users for agent onboarding.
 *
 * Replaces the old crm-onboarding-webhook → Zapier path with direct GHL API calls.
 *
 * Actions:
 *   - push_custom_values: Push 11 custom values per agent seat to GHL location(s)
 *   - create_user: Create a GHL user in the agency subaccount (GHL sends invite)
 *   - onboard: Combined push_custom_values + create_user (default action)
 *   - batch: Process multiple agents in one call (for Roster batch push)
 *
 * Routing:
 *   - FYM, MHA (IFG), MHA (YFMO) → push custom values to BOTH agency + Sunfire subaccounts
 *   - All other agencies → agency subaccount only
 *   - User creation → agency subaccount only (never Sunfire)
 *
 * Auth: Supabase anon key (RLS) or service role.
 * Secrets: GHL_AGENCY_ACCESS_TOKEN (agency-level token for user creation),
 *          CONTRACTING_SUPABASE_URL + CONTRACTING_SUPABASE_ANON_KEY (portal DB for GHL configs),
 *          GHL_API_KEY_SUNFIRE + GHL_LOCATION_ID_SUNFIRE (Sunfire subaccount).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

// Agencies that need dual-push (agency subaccount + Sunfire subaccount)
const DUAL_PUSH_AGENCIES = new Set(["FYM", "MHA (IFG)", "MHA (YFMO)"]);

// The 11 custom value fields per seat (in Agent # {seat} | {Field} format)
const CUSTOM_VALUE_FIELDS = [
  "CRM Number",
  "First Name",
  "Full Name",
  "Mobile #",
  "NPN",
  "Professional Image",
  "Title",
  "Work Email",
  "Calendar Embed Code",
  "Digital Business Card Home Page",
  "Appt Booked Confirmation Page",
] as const;

// Default GHL user permissions for new agents
const DEFAULT_USER_PERMISSIONS = {
  campaignsEnabled: false,
  campaignsReadOnly: false,
  contactsEnabled: true,
  workflowsEnabled: false,
  workflowsReadOnly: false,
  triggersEnabled: false,
  funnelsEnabled: false,
  websitesEnabled: false,
  opportunitiesEnabled: true,
  dashboardStatsEnabled: true,
  bulkRequestsEnabled: false,
  appointmentsEnabled: false,
  reviewsEnabled: false,
  onlineListingsEnabled: false,
  phoneCallEnabled: false,
  conversationsEnabled: true,
  assignedDataOnly: true,
  adwordsReportingEnabled: false,
  membershipEnabled: false,
  facebookAdsReportingEnabled: false,
  attributionsReportingEnabled: false,
  settingsEnabled: false,
  tagsEnabled: false,
  leadValueEnabled: false,
  marketingEnabled: false,
  agentReportingEnabled: false,
  botService: false,
  socialPlanner: false,
  bloggingEnabled: false,
  invoiceEnabled: false,
  affiliateManagerEnabled: false,
  contentAiEnabled: false,
  refundsEnabled: false,
  recordPaymentEnabled: false,
  cancelSubscriptionEnabled: false,
  paymentsEnabled: false,
  communitiesEnabled: false,
  exportPaymentsEnabled: false,
};

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentData {
  seatNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  agentNpn: string;
  profileImage: string;
  crmNumber: string;
  agency: string;
  digitalBusinessCardUrl?: string;
  confirmationPageUrl?: string;
  calendarEmbedCode?: string;
}

interface GhlConfig {
  apiKey: string;
  locationId: string;
}

interface PushResult {
  agent: string;
  seatNumber: string;
  customValuesPushed: boolean;
  customValuesUpdated: number;
  userCreated: boolean;
  sunfirePushed: boolean;
  sunfireValuesUpdated: number;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getPortalClient() {
  const url = Deno.env.get("CONTRACTING_SUPABASE_URL");
  const key = Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Missing CONTRACTING_SUPABASE_URL or CONTRACTING_SUPABASE_ANON_KEY");
  }
  return createClient(url, key);
}

/** Look up per-agency GHL credentials — env vars first, portal DB fallback */
async function getAgencyGhlConfig(agencyName: string): Promise<GhlConfig | null> {
  // 1. Try env var (hardcoded mapping — always available, no DB round-trip)
  const envMapping = AGENCY_CONFIG_MAP[agencyName];
  if (envMapping) {
    const apiKey = Deno.env.get(envMapping.envKey);
    if (apiKey) {
      return { apiKey, locationId: envMapping.locationId };
    }
  }

  // 2. Fall back to portal DB (agency_ghl_configs table)
  try {
    const portal = getPortalClient();
    const { data: agency } = await portal
      .from("hierarchy_agencies")
      .select("id, ghl_api_enabled")
      .eq("name", agencyName)
      .eq("is_active", true)
      .maybeSingle();

    if (!agency) return null;

    const { data: config } = await portal
      .from("agency_ghl_configs")
      .select("ghl_api_key, ghl_location_id, connection_status")
      .eq("agency_id", agency.id)
      .maybeSingle();

    if (!config || !config.ghl_api_key || !config.ghl_location_id) {
      return null;
    }

    return {
      apiKey: config.ghl_api_key,
      locationId: config.ghl_location_id,
    };
  } catch {
    return null;
  }
}

// Per-agency Sunfire subaccount mapping (agency name → env var + location ID)
const SUNFIRE_CONFIG_MAP: Record<string, { envKey: string; locationId: string }> = {
  "FYM": { envKey: "CRM_OPS_FYM_SUNFIRE_API", locationId: "IQljfeWX6wWHmzUtgSyz" },
  "MHA (IFG)": { envKey: "CRM_OPS_MHA_IFG_SUNFIRE_API", locationId: "J3OhGPUb6xcoWHnFGOit" },
  "MHA (YFMO)": { envKey: "CRM_OPS_MHA_YFMO_SUNFIRE_API", locationId: "wIbVl4AX2LZRDL8pTK2c" },
};

// Per-agency GHL config mapping (agency name → env var + location ID)
// Used as fallback when agency_ghl_configs DB table doesn't have the agency
const AGENCY_CONFIG_MAP: Record<string, { envKey: string; locationId: string }> = {
  "FYM": { envKey: "CRM_OPS_FYM_AGENCY_API", locationId: "YM9XmCanfO6p28b1sQOH" },
  "Wisechoice": { envKey: "CRM_OPS_WISECHOICE_AGENCY_API", locationId: "I7Mw22ovq7fPgJWV5eWL" },
  "Aspire": { envKey: "CRM_OPS_ASPIRE_AGENCY_API", locationId: "MrRGbMxuEFqc6y00tr5A" },
  "DH Insurance": { envKey: "CRM_OPS_DH_INSURANCE_AGENCY_API", locationId: "gUWVjvEQMniOUvPEV2Z6" },
  "Berith Partners LLC": { envKey: "CRM_OPS_BERITH_PARTNERS_AGENCY_API", locationId: "2zscje2WhD64VpxQvTsU" },
  "MHA (IFG)": { envKey: "CRM_OPS_MHA_IFG_AGENCY_API", locationId: "W2d8rLlhu7zchstuX3m9" },
  "MHA (YFMO)": { envKey: "CRM_OPS_MHA_YFMO_AGENCY_API", locationId: "OAd1PnliebjgodpEGuCI" },
  "360 Insurance Group": { envKey: "CRM_OPS_360_INSURANCE_AGENCY_API", locationId: "Uc3AEjz4qy9D672Q4IsC" },
};

/** Get per-agency Sunfire GHL config from env vars */
function getSunfireConfig(agencyName: string): GhlConfig | null {
  const mapping = SUNFIRE_CONFIG_MAP[agencyName];
  if (!mapping) return null;

  const apiKey = Deno.env.get(mapping.envKey);
  if (!apiKey) {
    // Fall back to the shared Sunfire key if per-agency key isn't set
    const fallbackKey = Deno.env.get("GHL_API_KEY_SUNFIRE");
    const fallbackLoc = Deno.env.get("GHL_LOCATION_ID_SUNFIRE");
    if (fallbackKey && fallbackLoc) return { apiKey: fallbackKey, locationId: fallbackLoc };
    return null;
  }

  return { apiKey, locationId: mapping.locationId };
}

/** Build the custom value key-value pairs for a given agent seat */
function buildCustomValues(agent: AgentData): Record<string, string> {
  const seat = agent.seatNumber;
  // GHL naming convention: "Agent #99 | Field" (no space between # and number)
  const prefix = `Agent #${seat} | `;

  return {
    [`${prefix}CRM #`]: agent.crmNumber || "",
    [`${prefix}First Name`]: agent.firstName || "",
    [`${prefix}Full Name`]: `${agent.firstName} ${agent.lastName}`.trim(),
    [`${prefix}Mobile #`]: agent.phone || "",
    [`${prefix}NPN`]: agent.agentNpn || "",
    [`${prefix}Professional Image`]: agent.profileImage || "",
    [`${prefix}Title`]: "Licensed Insurance Agent",
    [`${prefix}Work Email`]: agent.email || "",
    [`${prefix}Calendar Embed Code`]: agent.calendarEmbedCode || "",
    [`${prefix}Digital Business Card Home Page`]: agent.digitalBusinessCardUrl || "",
    [`${prefix}Appt Booked Confirmation Page`]: agent.confirmationPageUrl || "",
  };
}

/** Fetch all custom values for a location and build a name→id lookup */
async function getCustomValueIds(
  config: GhlConfig,
): Promise<Map<string, string>> {
  const res = await fetch(
    `${GHL_BASE}/locations/${config.locationId}/customValues`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) return new Map();
  const data = await res.json();
  const lookup = new Map<string, string>();
  for (const cv of data.customValues || []) {
    lookup.set(cv.name, cv.id);
  }
  return lookup;
}

/** Push custom values to a GHL location (individual PUT per custom value) */
async function pushCustomValuesToLocation(
  config: GhlConfig,
  customValues: Record<string, string>,
  locationLabel: string,
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  // 1. Get name→id lookup for all custom values in this location
  let cvLookup: Map<string, string>;
  try {
    cvLookup = await getCustomValueIds(config);
  } catch (err) {
    errors.push(
      `Failed to fetch custom values from ${locationLabel}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { success: false, updated: 0, errors };
  }

  if (cvLookup.size === 0) {
    errors.push(`No custom values found in ${locationLabel} — cannot update`);
    return { success: false, updated: 0, errors };
  }

  // 2. Update each custom value individually by ID
  for (const [name, value] of Object.entries(customValues)) {
    const cvId = cvLookup.get(name);
    if (!cvId) {
      errors.push(`Custom value "${name}" not found in ${locationLabel} — skipped`);
      continue;
    }

    try {
      const res = await fetch(
        `${GHL_BASE}/locations/${config.locationId}/customValues/${cvId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            Version: GHL_API_VERSION,
            Accept: "application/json",
          },
          body: JSON.stringify({ name, value }),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        errors.push(
          `Update "${name}" in ${locationLabel} failed: ${res.status} — ${errText.slice(0, 200)}`,
        );
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(
        `Update "${name}" in ${locationLabel} error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Brief pause between updates to respect rate limits
    await new Promise((r) => setTimeout(r, 50));
  }

  return { success: updated > 0, updated, errors };
}

// GHL company ID — the agency-level entity that owns all subaccounts
const GHL_COMPANY_ID = "FEDr3fIGdMoLQ5xi6o8s";

/** Create a GHL user in the agency subaccount */
async function createGhlUser(
  locationId: string,
  agent: AgentData,
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const agencyToken = Deno.env.get("GHL_AGENCY_ACCESS_TOKEN");
  if (!agencyToken) {
    return { success: false, error: "Missing GHL_AGENCY_ACCESS_TOKEN" };
  }

  try {
    const res = await fetch(`${GHL_BASE}/users/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agencyToken}`,
        "Content-Type": "application/json",
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
      body: JSON.stringify({
        companyId: GHL_COMPANY_ID,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        phone: agent.phone,
        type: "account",
        role: "user",
        locationIds: [locationId],
        permissions: DEFAULT_USER_PERMISSIONS,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // 422 = user already exists (duplicate email) — treat as soft success
      if (res.status === 422 && errText.toLowerCase().includes("already")) {
        return { success: true, error: `User already exists (${agent.email})` };
      }
      return {
        success: false,
        error: `GHL user creation failed: ${res.status} — ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    return { success: true, userId: data.id || data.userId };
  } catch (err) {
    return {
      success: false,
      error: `GHL user creation error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Process a single agent: push custom values + optionally create user */
async function processAgent(
  agent: AgentData,
  options: { createUser?: boolean; skipCustomValues?: boolean } = {},
): Promise<PushResult> {
  const result: PushResult = {
    agent: `${agent.firstName} ${agent.lastName}`.trim(),
    seatNumber: agent.seatNumber,
    customValuesPushed: false,
    customValuesUpdated: 0,
    userCreated: false,
    sunfirePushed: false,
    sunfireValuesUpdated: 0,
    errors: [],
  };

  const isDualPush = DUAL_PUSH_AGENCIES.has(agent.agency);

  // 1. Get agency GHL config
  const agencyConfig = await getAgencyGhlConfig(agent.agency);
  if (!agencyConfig) {
    result.errors.push(`No GHL config found for agency "${agent.agency}"`);
    return result;
  }

  // 2. Push custom values to agency subaccount
  if (!options.skipCustomValues) {
    const customValues = buildCustomValues(agent);
    const agencyPush = await pushCustomValuesToLocation(
      agencyConfig,
      customValues,
      `${agent.agency} subaccount`,
    );
    result.customValuesPushed = agencyPush.success;
    result.customValuesUpdated = agencyPush.updated;
    result.errors.push(...agencyPush.errors);

    // 3. Dual-push to Sunfire if applicable
    if (isDualPush) {
      const sunfireConfig = getSunfireConfig(agent.agency);
      if (sunfireConfig) {
        const sunfirePush = await pushCustomValuesToLocation(
          sunfireConfig,
          customValues,
          "Sunfire subaccount",
        );
        result.sunfirePushed = sunfirePush.success;
        result.sunfireValuesUpdated = sunfirePush.updated;
        result.errors.push(...sunfirePush.errors);
      } else {
        result.errors.push("Sunfire config not available — skipped dual-push");
      }
    }
  }

  // 4. Create GHL user in agency subaccount (not Sunfire)
  if (options.createUser !== false && agent.email) {
    const userResult = await createGhlUser(agencyConfig.locationId, agent);
    result.userCreated = userResult.success;
    if (userResult.error && !userResult.success) {
      result.errors.push(userResult.error);
    }
  }

  return result;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();

    // Health check / warmup
    if (body.ping) {
      return json({ success: true, warm: true });
    }

    const action = body.action || "onboard";

    // ── Single agent onboard ──
    if (action === "onboard" || action === "push_custom_values" || action === "create_user") {
      const agent: AgentData = {
        seatNumber: body.seatNumber || "",
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        email: body.email || "",
        phone: body.phone || "",
        agentNpn: body.agentNpn || "",
        profileImage: body.profileImage || "",
        crmNumber: body.crmNumber || "",
        agency: body.agency || "",
        digitalBusinessCardUrl: body.digitalBusinessCardUrl || "",
        confirmationPageUrl: body.confirmationPageUrl || "",
        calendarEmbedCode: body.calendarEmbedCode || "",
      };

      if (!agent.agency) {
        return json({ success: false, error: "agency is required" }, 400);
      }
      if (!agent.seatNumber) {
        return json({ success: false, error: "seatNumber is required" }, 400);
      }

      const result = await processAgent(agent, {
        createUser: action !== "push_custom_values",
        skipCustomValues: action === "create_user",
      });

      return json({
        success: result.errors.length === 0 || result.customValuesPushed || result.userCreated,
        result,
      });
    }

    // ── Batch onboard ──
    if (action === "batch") {
      const agents: AgentData[] = body.agents || [];
      const createUsers = body.createUsers !== false;

      if (!Array.isArray(agents) || agents.length === 0) {
        return json({ success: false, error: "agents array is required" }, 400);
      }

      const results: PushResult[] = [];
      let succeeded = 0;
      let failed = 0;

      for (const agentData of agents) {
        const agent: AgentData = {
          seatNumber: agentData.seatNumber || "",
          firstName: agentData.firstName || "",
          lastName: agentData.lastName || "",
          email: agentData.email || "",
          phone: agentData.phone || "",
          agentNpn: agentData.agentNpn || "",
          profileImage: agentData.profileImage || "",
          crmNumber: agentData.crmNumber || "",
          agency: agentData.agency || "",
          digitalBusinessCardUrl: agentData.digitalBusinessCardUrl || "",
          confirmationPageUrl: agentData.confirmationPageUrl || "",
          calendarEmbedCode: agentData.calendarEmbedCode || "",
        };

        const result = await processAgent(agent, { createUser: createUsers });
        results.push(result);

        if (result.customValuesPushed || result.userCreated) {
          succeeded++;
        } else {
          failed++;
        }

        // Rate limiting: 100ms between agents to stay under GHL's 80 req/10s
        await new Promise((r) => setTimeout(r, 100));
      }

      return json({
        success: failed === 0,
        total: agents.length,
        succeeded,
        failed,
        results,
      });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      500,
    );
  }
});
