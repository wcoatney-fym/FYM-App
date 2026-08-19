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
  userCreated: boolean;
  sunfirePushed: boolean;
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

/** Look up per-agency GHL credentials from portal DB */
async function getAgencyGhlConfig(agencyName: string): Promise<GhlConfig | null> {
  const portal = getPortalClient();

  // Find agency by name
  const { data: agency } = await portal
    .from("hierarchy_agencies")
    .select("id, ghl_api_enabled")
    .eq("name", agencyName)
    .eq("is_active", true)
    .maybeSingle();

  if (!agency) return null;

  // Get the GHL config
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
}

/** Get Sunfire GHL config from env vars */
function getSunfireConfig(): GhlConfig | null {
  const apiKey = Deno.env.get("GHL_API_KEY_SUNFIRE");
  const locationId = Deno.env.get("GHL_LOCATION_ID_SUNFIRE");
  if (!apiKey || !locationId) return null;
  return { apiKey, locationId };
}

/** Build the custom value key-value pairs for a given agent seat */
function buildCustomValues(agent: AgentData): Record<string, string> {
  const seat = agent.seatNumber;
  const prefix = `Agent # ${seat} | `;

  return {
    [`${prefix}CRM Number`]: agent.crmNumber || "",
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

/** Push custom values to a GHL location */
async function pushCustomValuesToLocation(
  config: GhlConfig,
  customValues: Record<string, string>,
  locationLabel: string,
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // GHL Custom Values API: PUT /locations/{locationId}/customValues
  // Body: { customValues: [{ key: "fieldName", value: "fieldValue" }] }
  const cvPayload = Object.entries(customValues).map(([key, value]) => ({
    key,
    value,
  }));

  try {
    const res = await fetch(
      `${GHL_BASE}/locations/${config.locationId}/customValues`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Version: GHL_API_VERSION,
          Accept: "application/json",
        },
        body: JSON.stringify({ customValues: cvPayload }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      errors.push(
        `Custom values push to ${locationLabel} failed: ${res.status} — ${errText.slice(0, 200)}`,
      );
      return { success: false, errors };
    }

    return { success: true, errors };
  } catch (err) {
    errors.push(
      `Custom values push to ${locationLabel} error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { success: false, errors };
  }
}

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
        companyId: locationId,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        phone: agent.phone,
        type: "user",
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
    userCreated: false,
    sunfirePushed: false,
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
    result.errors.push(...agencyPush.errors);

    // 3. Dual-push to Sunfire if applicable
    if (isDualPush) {
      const sunfireConfig = getSunfireConfig();
      if (sunfireConfig) {
        const sunfirePush = await pushCustomValuesToLocation(
          sunfireConfig,
          customValues,
          "Sunfire subaccount",
        );
        result.sunfirePushed = sunfirePush.success;
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
