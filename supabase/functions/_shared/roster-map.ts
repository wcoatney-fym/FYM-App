/**
 * Shared roster-map helper.
 *
 * Loads agent→agency mappings from the FYM App's own `agency_rosters` table.
 * When an agent's writing number exists in a roster, the roster's agency
 * assignment overrides the hierarchy-derived one from Max's prod DB.
 *
 * This solves the discrepancy where agents are manually assigned to agencies
 * (e.g., FYM Direct agents) but the UNL hierarchy puts them under a
 * different depth-02 entity.
 *
 * Usage:
 *   const rosterMap = await loadRosterMap();
 *   const agencyId = rosterMap.resolveAgency(agentWritingNumber, hierarchyAgencyId);
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RosterMap {
  /** Given an agent's writing number and the hierarchy-derived agency,
   *  return the roster-overridden agency writing number (or the hierarchy one). */
  resolveAgency(agentWn: string | null, hierarchyAgencyWn: string | null): string | null;
  /** Number of roster entries loaded */
  size: number;
}

/**
 * Load all active roster entries and build a lookup map:
 *   agent_writing_number → agency_writing_number
 *
 * Joins agency_rosters → agencies to get the agency's writing_number.
 * Only loads entries where both agent and agency have writing numbers.
 */
export async function loadRosterMap(): Promise<RosterMap> {
  const supabaseUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseKey) {
    console.warn("[roster-map] Missing Supabase credentials — roster override disabled");
    return { resolveAgency: (_agentWn, hierarchyWn) => hierarchyWn, size: 0 };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load roster entries joined with agency writing numbers
  // Only active rosters from active uploads
  const { data, error } = await supabase
    .from("agency_rosters")
    .select(`
      unl_writing_number,
      status,
      agency_id,
      agencies!inner (
        writing_number
      )
    `)
    .eq("status", "active")
    .not("unl_writing_number", "is", null);

  if (error) {
    console.error("[roster-map] Failed to load rosters:", error.message);
    return { resolveAgency: (_agentWn, hierarchyWn) => hierarchyWn, size: 0 };
  }

  // Build the lookup map: agent writing number → agency writing number
  const map = new Map<string, string>();

  for (const entry of data || []) {
    const agentWn = (entry.unl_writing_number as string)?.trim();
    // Supabase returns the joined agencies record
    const agencyRecord = entry.agencies as { writing_number: string | null } | null;
    const agencyWn = agencyRecord?.writing_number?.trim();

    if (agentWn && agencyWn) {
      map.set(agentWn, agencyWn);
    }
  }

  console.log(`[roster-map] Loaded ${map.size} agent→agency roster overrides`);

  return {
    resolveAgency(agentWn: string | null, hierarchyAgencyWn: string | null): string | null {
      if (agentWn && map.has(agentWn)) {
        return map.get(agentWn)!;
      }
      return hierarchyAgencyWn;
    },
    size: map.size,
  };
}
