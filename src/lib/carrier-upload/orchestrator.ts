/**
 * Carrier Upload Orchestrator
 *
 * Ties together: file parsing → match engine → report generation.
 * Handles DB writes for exact matches (auto-apply) and stores the
 * upload record for audit trail.
 *
 * Flow:
 * 1. Read XLSX file → detect carrier → parse with appropriate parser
 * 2. Run match engine (alias → exact → fuzzy) for agents and agencies
 * 3. Auto-apply exact matches (write carrier tags + LOB assignments)
 * 4. Return full report with three tiers for UI to render
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';
import { parseManhattanReport } from './parsers/manhattan';
import { parseGtlReport } from './parsers/gtl';
import { matchAgents, matchAgencies } from './match-engine';
import type {
  SupportedCarrier,
  CarrierParseResult,
  CarrierUploadReport,
  AgentMatchResult,
  AgencyMatchResult,
} from './types';
import { buildCarrierTag } from './types';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Process a carrier hierarchy report file end-to-end.
 *
 * @param supabase — portal Supabase client
 * @param file — the XLSX file (ArrayBuffer)
 * @param carrier — which carrier this report is from
 * @param fileName — original file name for audit trail
 * @param uploadedBy — who uploaded (display name or ID)
 */
export async function processCarrierUpload(
  supabase: SupabaseClient,
  file: ArrayBuffer,
  carrier: SupportedCarrier,
  fileName: string,
  uploadedBy?: string,
): Promise<CarrierUploadReport> {
  // 1. Create upload record
  const uploadId = await createUploadRecord(supabase, carrier, fileName, uploadedBy);

  try {
    // 2. Parse the XLSX file
    const parseResult = parseFile(file, carrier);

    // 3. Run match engine
    const agentResults = await matchAgents(supabase, carrier, parseResult.agents);
    const agencyResults = await matchAgencies(supabase, carrier, parseResult.agencies);

    // 4. Auto-apply exact matches
    await applyExactMatches(supabase, carrier, agentResults);

    // 5. Build report
    const report = buildReport(carrier, fileName, uploadId, agentResults, agencyResults);

    // 6. Update upload record with summary
    await updateUploadRecord(supabase, uploadId, 'completed', report.summary);

    return report;
  } catch (err) {
    await updateUploadRecord(supabase, uploadId, 'failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

/**
 * Manually resolve a fuzzy or failed match — creates a persistent alias
 * and applies the match (writes carrier tag + LOB assignment).
 */
export async function resolveMatch(
  supabase: SupabaseClient,
  carrier: SupportedCarrier,
  entityType: 'agent' | 'agency',
  carrierName: string,
  carrierNumber: string | null,
  matchedEntityId: string,
  resolvedBy?: string,
): Promise<void> {
  // 1. Create persistent alias
  await supabase.from('carrier_entity_aliases').upsert(
    {
      carrier,
      carrier_name: carrierName,
      carrier_number: carrierNumber,
      entity_type: entityType,
      matched_entity_id: matchedEntityId,
      match_type: 'manual',
      created_by: resolvedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'carrier,carrier_name,entity_type' },
  );
}

/**
 * Apply a single agent match — write carrier tag + LOB assignment.
 * Used for manual resolution of fuzzy/failed matches.
 */
export async function applySingleAgentMatch(
  supabase: SupabaseClient,
  carrier: SupportedCarrier,
  agentId: string,
  carrierWritingNumber: string,
  status: 'active' | 'pending' | 'terminated',
): Promise<void> {
  // 1. Upsert LOB assignment
  await upsertLobAssignment(supabase, agentId, carrier, carrierWritingNumber);

  // 2. Update carrier tag
  await updateCarrierTag(supabase, agentId, carrier, status);
}

/**
 * Add a new agent from a carrier report (failed match → "add new" action).
 */
export async function addNewAgentFromCarrier(
  supabase: SupabaseClient,
  carrier: SupportedCarrier,
  agent: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    carrier_writing_number: string;
    status: 'active' | 'pending' | 'terminated';
    agency: string | null;
  },
): Promise<string> {
  // 1. Insert new agent
  const { data, error } = await supabase
    .from('agents')
    .insert({
      first_name: agent.first_name,
      last_name: agent.last_name,
      email: agent.email,
      phone: agent.phone,
      agency: agent.agency,
      status: 'pending',
      source: `carrier-upload:${carrier}`,
      tags: [buildCarrierTag(carrier, agent.status)],
    })
    .select('id')
    .single();

  if (error) throw error;
  const agentId = data.id;

  // 2. Create LOB assignment
  await upsertLobAssignment(supabase, agentId, carrier, agent.carrier_writing_number);

  // 3. Create persistent alias
  const fullName = [agent.first_name, agent.last_name].filter(Boolean).join(' ');
  await supabase.from('carrier_entity_aliases').upsert(
    {
      carrier,
      carrier_name: fullName,
      carrier_number: agent.carrier_writing_number,
      entity_type: 'agent',
      matched_entity_id: agentId,
      match_type: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'carrier,carrier_name,entity_type' },
  );

  return agentId;
}

// ─── File Parsing ────────────────────────────────────────────────────────────

function parseFile(file: ArrayBuffer, carrier: SupportedCarrier): CarrierParseResult {
  const workbook = xlsxRead(file, { type: 'array' });

  switch (carrier) {
    case 'Manhattan': {
      // Manhattan uses a single sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsxUtils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        raw: false,
        defval: null,
      });
      return parseManhattanReport(rows);
    }

    case 'GTL': {
      // GTL has multiple sheets — pass all of them
      const sheets: Record<string, (string | number | null)[][]> = {};
      for (const sheetName of workbook.SheetNames) {
        sheets[sheetName] = xlsxUtils.sheet_to_json<(string | number | null)[]>(
          workbook.Sheets[sheetName],
          { header: 1, raw: false, defval: null },
        );
      }
      return parseGtlReport(sheets);
    }

    default:
      throw new Error(`Unsupported carrier: ${carrier}`);
  }
}

// ─── Auto-Apply Exact Matches ────────────────────────────────────────────────

async function applyExactMatches(
  supabase: SupabaseClient,
  carrier: SupportedCarrier,
  agentResults: AgentMatchResult[],
): Promise<void> {
  const exactMatches = agentResults.filter(
    (r) => r.match_tier === 'exact' && r.matched_agent_id && !r.writing_number_conflict,
  );

  // Batch in chunks of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < exactMatches.length; i += BATCH_SIZE) {
    const batch = exactMatches.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (result) => {
        if (!result.matched_agent_id) return;

        // Upsert LOB assignment
        await upsertLobAssignment(
          supabase,
          result.matched_agent_id,
          carrier,
          result.carrier_agent.carrier_writing_number,
        );

        // Update carrier tag
        await updateCarrierTag(
          supabase,
          result.matched_agent_id,
          carrier,
          result.carrier_agent.status,
        );

        // Create alias for future lookups (if not alias-resolved already)
        if (!result.alias_resolved) {
          await supabase.from('carrier_entity_aliases').upsert(
            {
              carrier,
              carrier_name: result.carrier_agent.raw_name,
              carrier_number: result.carrier_agent.carrier_writing_number,
              entity_type: 'agent',
              matched_entity_id: result.matched_agent_id,
              match_type: 'exact',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'carrier,carrier_name,entity_type' },
          );
        }
      }),
    );
  }
}

// ─── DB Helpers ──────────────────────────────────────────────────────────────

async function upsertLobAssignment(
  supabase: SupabaseClient,
  agentId: string,
  carrier: string,
  writingNumber: string,
): Promise<void> {
  // Check if assignment exists
  const { data: existing } = await supabase
    .from('agent_lob_assignments')
    .select('id')
    .eq('agent_id', agentId)
    .eq('carrier', carrier)
    .maybeSingle();

  if (existing) {
    // Update existing
    await supabase
      .from('agent_lob_assignments')
      .update({
        writing_number: writingNumber,
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: 'carrier-upload',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Insert new
    await supabase.from('agent_lob_assignments').insert({
      agent_id: agentId,
      carrier,
      writing_number: writingNumber,
      line_of_business: 'HIP',
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: 'carrier-upload',
      submitted_by_agent: false,
      ai_extracted: false,
    });
  }
}

async function updateCarrierTag(
  supabase: SupabaseClient,
  agentId: string,
  carrier: SupportedCarrier,
  status: 'active' | 'pending' | 'terminated',
): Promise<void> {
  // Get current tags
  const { data: agent } = await supabase
    .from('agents')
    .select('tags')
    .eq('id', agentId)
    .single();

  const currentTags: string[] = agent?.tags || [];

  // Remove any existing tags for this carrier
  const filtered = currentTags.filter(
    (t) => !t.startsWith(carrier) && !t.startsWith(`${carrier}:`),
  );

  // Add the new carrier tag
  const newTag = buildCarrierTag(carrier, status);
  filtered.push(newTag);

  await supabase
    .from('agents')
    .update({ tags: filtered, updated_at: new Date().toISOString() })
    .eq('id', agentId);
}

async function createUploadRecord(
  supabase: SupabaseClient,
  carrier: string,
  fileName: string,
  uploadedBy?: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('carrier_hierarchy_uploads')
    .insert({
      carrier,
      file_name: fileName,
      uploaded_by: uploadedBy,
      status: 'processing',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function updateUploadRecord(
  supabase: SupabaseClient,
  uploadId: string,
  status: 'completed' | 'failed',
  summary: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('carrier_hierarchy_uploads')
    .update({
      status,
      summary,
      completed_at: new Date().toISOString(),
    })
    .eq('id', uploadId);
}

// ─── Report Builder ──────────────────────────────────────────────────────────

function buildReport(
  carrier: SupportedCarrier,
  fileName: string,
  uploadId: string,
  agentResults: AgentMatchResult[],
  agencyResults: AgencyMatchResult[],
): CarrierUploadReport {
  return {
    carrier,
    file_name: fileName,
    upload_id: uploadId,
    timestamp: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()),
    summary: {
      total_agents: agentResults.length,
      exact_matches: agentResults.filter((r) => r.match_tier === 'exact').length,
      fuzzy_matches: agentResults.filter((r) => r.match_tier === 'fuzzy').length,
      no_matches: agentResults.filter((r) => r.match_tier === 'none').length,
      total_agencies: agencyResults.length,
      agency_exact: agencyResults.filter((r) => r.match_tier === 'exact').length,
      agency_fuzzy: agencyResults.filter((r) => r.match_tier === 'fuzzy').length,
      agency_no_match: agencyResults.filter((r) => r.match_tier === 'none').length,
      writing_number_conflicts: agentResults.filter((r) => r.writing_number_conflict).length,
    },
    agent_results: agentResults,
    agency_results: agencyResults,
  };
}
