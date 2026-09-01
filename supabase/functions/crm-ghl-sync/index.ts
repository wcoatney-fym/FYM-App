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
 *   - push_cross_sell: Push cross-sell product custom values to GHL (agency only, no Sunfire)
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

// Cross-sell DB field key → GHL custom value label mapping
const CROSS_SELL_FIELD_LABELS: Record<string, string> = {
  headline: "Headline",
  hero_headline: "Hero Headline",
  subheadline: "Subheadline",
  meta_title: "Meta Title",
  meta_description: "Meta Description",
  meta_image_url: "Meta Image URL",
  cta_headline: "CTA Headline",
  cta_text: "CTA Text",
  button_cta_text: "Button CTA Text",
  learn_more_text: "Learn More Text",
  bullet_1: "Bullet 1",
  bullet_1_description: "Bullet 1 Description",
  bullet_2: "Bullet 2",
  bullet_2_description: "Bullet 2 Description",
  bullet_3: "Bullet 3",
  bullet_3_description: "Bullet 3 Description",
  bullet_4: "Bullet 4",
  bullet_4_description: "Bullet 4 Description",
  bullet_5: "Bullet 5",
  bullet_5_description: "Bullet 5 Description",
  benefit_1_title: "Benefit #1 Title",
  benefit_1_description: "Benefit #1 Description",
  benefit_2_title: "Benefit #2 Title",
  benefit_2_description: "Benefit #2 Description",
  benefit_3_title: "Benefit #3 Title",
  benefit_3_description: "Benefit #3 Description",
  benefit_4_title: "Benefit #4 Title",
  benefit_4_description: "Benefit #4 Description",
  benefit_5_title: "Benefit #5 Title",
  benefit_5_description: "Benefit #5 Description",
  specialist_full_name: "Specialist Full Name",
  specialist_title: "Specialist Title",
  specialist_intro: "Specialist Intro",
  specialist_email: "Specialist Email",
  specialist_mobile: "Specialist Mobile #",
  funnel_link_step_1: "Funnel Link | Step 1 - Home & Awareness",
  funnel_link_step_2: "Funnel Link | Step 2 - Appointment Booking",
  booking_url: "Booking URL",
  trigger_link: "Trigger Link",
  calendar_embed_code: "Calendar Embed Code",
  appointment_disclaimer: "Appointment Disclaimer",
  confirmation_headline: "Confirmation Headline",
  confirmation_subheadline: "Confirmation Subheadline",
  confirmation_details: "Confirmation Details",
  confirmation_next_steps: "Confirmation Next Steps",
  system_crm_number: "System CRM #",
  qualification_age_requirement: "Qualification | Age Requirement",
  qualification_doctor_participation: "Qualification | Doctor Participation",
  qualification_enrollment_fee: "Qualification | Enrollment Fee",
  qualification_income_guidelines: "Qualification | Income Guidelines",
  qualification_medication_requirement: "Qualification | Medication Requirement",
  qualification_renewal_requirement: "Qualification | Renewal Requirement",
  qualification_residency: "Qualification | Residency",
};

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
  agencyId?: string;
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
    headers: { ...CORS_HEADERS(req), "Content-Type": "application/json" },
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

/** Normalize an agency name for fuzzy matching (lowercase, trimmed, collapsed whitespace). */
function normalizeAgencyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find env-var mapping with normalized/fuzzy name matching. */
function findEnvMapping(agencyName: string): { envKey: string; locationId: string } | undefined {
  // 1. Exact match (fast path)
  if (AGENCY_CONFIG_MAP[agencyName]) return AGENCY_CONFIG_MAP[agencyName];

  // 2. Normalized match (case-insensitive, trimmed)
  const needle = normalizeAgencyName(agencyName);
  for (const [key, value] of Object.entries(AGENCY_CONFIG_MAP)) {
    if (normalizeAgencyName(key) === needle) return value;
  }

  // 3. Substring/contains match — if the DB name contains an env-map key or vice versa
  for (const [key, value] of Object.entries(AGENCY_CONFIG_MAP)) {
    const nKey = normalizeAgencyName(key);
    if (needle.includes(nKey) || nKey.includes(needle)) return value;
  }

  return undefined;
}

/**
 * Look up per-agency GHL credentials.
 * Resolution order:
 *   1. If agencyId provided → agency_ghl_configs by UUID (immune to name drift)
 *   2. Env var mapping with normalized/fuzzy name match
 *   3. DB lookup by name → agency_ghl_configs by UUID
 */
async function getAgencyGhlConfig(agencyName: string, agencyId?: string): Promise<GhlConfig | null> {
  const portal = getPortalClient();

  // 1. If we have an agency UUID, go straight to the DB config (most reliable)
  if (agencyId) {
    try {
      const { data: config } = await portal
        .from("agency_ghl_configs")
        .select("ghl_api_key, ghl_location_id, connection_status")
        .eq("agency_id", agencyId)
        .maybeSingle();

      if (config?.ghl_api_key && config?.ghl_location_id) {
        return {
          apiKey: config.ghl_api_key,
          locationId: config.ghl_location_id,
        };
      }
    } catch {
      // DB lookup failed — continue to env-var fallback
    }
  }

  // 2. Try env var mapping with normalized/fuzzy name match
  const envMapping = findEnvMapping(agencyName);
  if (envMapping) {
    const apiKey = Deno.env.get(envMapping.envKey);
    if (apiKey) {
      return { apiKey, locationId: envMapping.locationId };
    }
  }

  // 3. Fall back to portal DB by name → agency_ghl_configs by ID
  try {
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
  "360 Insurance": { envKey: "CRM_OPS_360_INSURANCE_AGENCY_API", locationId: "Uc3AEjz4qy9D672Q4IsC" },
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

  // 1. Get agency GHL config (prefer UUID, fall back to name with fuzzy match)
  const agencyConfig = await getAgencyGhlConfig(agent.agency, agent.agencyId);
  if (!agencyConfig) {
    result.errors.push(`No GHL config found for agency "${agent.agency}"${agent.agencyId ? ` (id: ${agent.agencyId})` : ''}`);
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
    return new Response(null, { status: 200, headers: CORS_HEADERS(req) });
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
        agencyId: body.agencyId || "",
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
          agencyId: agentData.agencyId || body.agencyId || "",
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

    // ── Push cross-sell custom values ──
    if (action === "push_cross_sell") {
      const agencyId = body.agencyId;
      const agencyName = body.agencyName || body.agency || "";

      if (!agencyId && !agencyName) {
        return json({ success: false, error: "agencyId or agencyName is required" }, 400);
      }

      // 1. Get agency GHL config
      const agencyConfig = await getAgencyGhlConfig(agencyName, agencyId);
      if (!agencyConfig) {
        return json({
          success: false,
          error: `No GHL config found for agency${agencyId ? ` (id: ${agencyId})` : ` "${agencyName}"`}`,
        }, 400);
      }

      // 2. Read cross-sell products from portal DB
      const portal = getPortalClient();
      const lookupId = agencyId || undefined;
      let crossSellQuery = portal
        .from("crm_agency_cross_sell")
        .select("product_number, product_name, fields")
        .order("product_number");

      if (lookupId) {
        crossSellQuery = crossSellQuery.eq("agency_id", lookupId);
      } else {
        // Fall back: look up agency ID by name first
        const { data: agency } = await portal
          .from("hierarchy_agencies")
          .select("id")
          .eq("name", agencyName)
          .eq("is_active", true)
          .maybeSingle();
        if (!agency) {
          return json({ success: false, error: `Agency not found: "${agencyName}"` }, 400);
        }
        crossSellQuery = crossSellQuery.eq("agency_id", agency.id);
      }

      const { data: products, error: dbError } = await crossSellQuery;
      if (dbError) {
        return json({ success: false, error: "Database query failed" }, 500);
      }
      if (!products || products.length === 0) {
        return json({ success: false, error: "No cross-sell products configured for this agency" }, 400);
      }

      // 3. Build GHL custom value map: "Cross Selling | Product #N | Label" → value
      const customValues: Record<string, string> = {};
      for (const product of products) {
        const fields = product.fields as Record<string, string>;
        for (const [fieldKey, fieldValue] of Object.entries(fields)) {
          if (!fieldValue || fieldValue.trim() === "") continue;
          const label = CROSS_SELL_FIELD_LABELS[fieldKey];
          if (!label) continue; // Unknown field key — skip
          const ghlName = `Cross Selling | Product #${product.product_number} | ${label}`;
          customValues[ghlName] = fieldValue;
        }
      }

      if (Object.keys(customValues).length === 0) {
        return json({ success: false, error: "No cross-sell values to push (all fields empty)" }, 400);
      }

      // 4. Push to GHL (agency subaccount only — no Sunfire for cross-sell)
      const pushResult = await pushCustomValuesToLocation(
        agencyConfig,
        customValues,
        `${agencyName || agencyId} subaccount`,
      );

      return json({
        success: pushResult.success,
        productsProcessed: products.length,
        valuesAttempted: Object.keys(customValues).length,
        valuesUpdated: pushResult.updated,
        errors: pushResult.errors,
      });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json(
      {
        success: false,
        error: "Internal server error",
      },
      500,
    );
  }
});
