/**
 * Carrier Upload Match Engine
 *
 * Three-tier matching pipeline:
 * 1. Alias lookup — check carrier_entity_aliases for persistent mappings
 * 2. Exact match — case-insensitive first+last name match
 * 3. Fuzzy match — Levenshtein-based similarity with confidence score
 *
 * For agents: matches against portal `agents` table
 * For agencies: matches against `hierarchy_agencies` table
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NormalizedCarrierAgent,
  NormalizedCarrierAgency,
  AgentMatchResult,
  AgencyMatchResult,
  CarrierEntityAlias,
  SupportedCarrier,
} from './types';

// ─── Public API ──────────────────────────────────────────────────────────────

interface PortalAgent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  agency: string | null;
  tags: string[] | null;
}

interface PortalAgency {
  id: string;
  name: string;
}

interface ExistingLobAssignment {
  agent_id: string;
  carrier: string;
  writing_number: string;
}

/**
 * Match a batch of carrier agents against portal data.
 */
export async function matchAgents(
  supabase: SupabaseClient,
  carrier: SupportedCarrier,
  carrierAgents: NormalizedCarrierAgent[],
): Promise<AgentMatchResult[]> {
  // 1. Load all portal agents (we need the full list for fuzzy matching)
  const portalAgents = await loadPortalAgents(supabase);

  // 2. Load persistent aliases for this carrier + entity_type=agent
  const aliases = await loadAliases(supabase, carrier, 'agent');

  // 3. Load existing LOB assignments for conflict detection
  const existingLobs = await loadExistingLobs(supabase, carrier);

  // 4. Match each carrier agent
  return carrierAgents.map((ca) => matchSingleAgent(ca, portalAgents, aliases, existingLobs, carrier));
}

/**
 * Match a batch of carrier agencies against hierarchy_agencies.
 */
export async function matchAgencies(
  supabase: SupabaseClient,
  carrier: SupportedCarrier,
  carrierAgencies: NormalizedCarrierAgency[],
): Promise<AgencyMatchResult[]> {
  // 1. Load all hierarchy agencies
  const portalAgencies = await loadPortalAgencies(supabase);

  // 2. Load persistent aliases for this carrier + entity_type=agency
  const aliases = await loadAliases(supabase, carrier, 'agency');

  // 3. Match each carrier agency
  return carrierAgencies.map((ca) => matchSingleAgency(ca, portalAgencies, aliases));
}

// ─── Single Entity Matching ──────────────────────────────────────────────────

function matchSingleAgent(
  ca: NormalizedCarrierAgent,
  portalAgents: PortalAgent[],
  aliases: CarrierEntityAlias[],
  existingLobs: ExistingLobAssignment[],
  carrier: SupportedCarrier,
): AgentMatchResult {
  const base: Omit<AgentMatchResult, 'match_tier' | 'matched_agent_id' | 'matched_agent_name' | 'confidence' | 'alias_resolved' | 'writing_number_conflict' | 'existing_writing_number'> = {
    carrier_agent: ca,
  };

  // Step 1: Check persistent alias
  const alias = aliases.find(
    (a) => normalize(a.carrier_name) === normalize(ca.raw_name),
  );
  if (alias) {
    const matched = portalAgents.find((p) => p.id === alias.matched_entity_id);
    const conflict = checkWritingNumberConflict(alias.matched_entity_id, carrier, ca.carrier_writing_number, existingLobs);
    return {
      ...base,
      match_tier: 'exact',
      matched_agent_id: alias.matched_entity_id,
      matched_agent_name: matched ? formatAgentName(matched) : alias.carrier_name,
      confidence: 100,
      alias_resolved: true,
      writing_number_conflict: conflict.hasConflict,
      existing_writing_number: conflict.existingNumber,
    };
  }

  // Step 2: Exact name match (case-insensitive, trimmed)
  const caFirst = normalize(ca.first_name);
  const caLast = normalize(ca.last_name);
  const caFull = normalize(ca.raw_name);

  const exactMatch = portalAgents.find((p) => {
    const pFirst = normalize(p.first_name || '');
    const pLast = normalize(p.last_name || '');
    const pFull = normalize(`${p.first_name || ''} ${p.last_name || ''}`);

    // Try first+last match
    if (caFirst && caLast && pFirst && pLast) {
      return caFirst === pFirst && caLast === pLast;
    }
    // Try full name match (for business entities)
    return caFull === pFull && caFull.length > 0;
  });

  if (exactMatch) {
    const conflict = checkWritingNumberConflict(exactMatch.id, carrier, ca.carrier_writing_number, existingLobs);
    return {
      ...base,
      match_tier: 'exact',
      matched_agent_id: exactMatch.id,
      matched_agent_name: formatAgentName(exactMatch),
      confidence: 100,
      alias_resolved: false,
      writing_number_conflict: conflict.hasConflict,
      existing_writing_number: conflict.existingNumber,
    };
  }

  // Step 3: Fuzzy match
  const fuzzyResult = findBestFuzzyMatch(ca, portalAgents);

  if (fuzzyResult && fuzzyResult.confidence >= FUZZY_THRESHOLD) {
    const conflict = checkWritingNumberConflict(fuzzyResult.agent.id, carrier, ca.carrier_writing_number, existingLobs);
    return {
      ...base,
      match_tier: 'fuzzy',
      matched_agent_id: fuzzyResult.agent.id,
      matched_agent_name: formatAgentName(fuzzyResult.agent),
      confidence: fuzzyResult.confidence,
      alias_resolved: false,
      writing_number_conflict: conflict.hasConflict,
      existing_writing_number: conflict.existingNumber,
    };
  }

  // No match
  return {
    ...base,
    match_tier: 'none',
    matched_agent_id: null,
    matched_agent_name: null,
    confidence: fuzzyResult?.confidence ?? null,
    alias_resolved: false,
    writing_number_conflict: false,
    existing_writing_number: null,
  };
}

function matchSingleAgency(
  ca: NormalizedCarrierAgency,
  portalAgencies: PortalAgency[],
  aliases: CarrierEntityAlias[],
): AgencyMatchResult {
  const base = { carrier_agency: ca };

  // Step 1: Alias lookup
  const alias = aliases.find(
    (a) => normalize(a.carrier_name) === normalize(ca.raw_name),
  );
  if (alias) {
    const matched = portalAgencies.find((p) => p.id === alias.matched_entity_id);
    return {
      ...base,
      match_tier: 'exact',
      matched_agency_id: alias.matched_entity_id,
      matched_agency_name: matched?.name || alias.carrier_name,
      confidence: 100,
      alias_resolved: true,
    };
  }

  // Step 2: Exact name match
  const caName = normalize(ca.raw_name);
  const exactMatch = portalAgencies.find((p) => normalize(p.name) === caName);
  if (exactMatch) {
    return {
      ...base,
      match_tier: 'exact',
      matched_agency_id: exactMatch.id,
      matched_agency_name: exactMatch.name,
      confidence: 100,
      alias_resolved: false,
    };
  }

  // Step 3: Fuzzy match
  const fuzzyResult = findBestFuzzyAgencyMatch(ca, portalAgencies);
  if (fuzzyResult && fuzzyResult.confidence >= FUZZY_THRESHOLD) {
    return {
      ...base,
      match_tier: 'fuzzy',
      matched_agency_id: fuzzyResult.agency.id,
      matched_agency_name: fuzzyResult.agency.name,
      confidence: fuzzyResult.confidence,
      alias_resolved: false,
    };
  }

  return {
    ...base,
    match_tier: 'none',
    matched_agency_id: null,
    matched_agency_name: null,
    confidence: fuzzyResult?.confidence ?? null,
    alias_resolved: false,
  };
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function loadPortalAgents(supabase: SupabaseClient): Promise<PortalAgent[]> {
  const all: PortalAgent[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('agents')
      .select('id, first_name, last_name, email, agency, tags')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as PortalAgent[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function loadPortalAgencies(supabase: SupabaseClient): Promise<PortalAgency[]> {
  const all: PortalAgency[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('hierarchy_agencies')
      .select('id, name')
      .eq('is_test', false)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as PortalAgency[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function loadAliases(
  supabase: SupabaseClient,
  carrier: string,
  entityType: 'agent' | 'agency',
): Promise<CarrierEntityAlias[]> {
  const { data, error } = await supabase
    .from('carrier_entity_aliases')
    .select('*')
    .eq('carrier', carrier)
    .eq('entity_type', entityType);

  if (error) throw error;
  return (data as CarrierEntityAlias[]) || [];
}

async function loadExistingLobs(
  supabase: SupabaseClient,
  carrier: string,
): Promise<ExistingLobAssignment[]> {
  const { data, error } = await supabase
    .from('agent_lob_assignments')
    .select('agent_id, carrier, writing_number')
    .eq('carrier', carrier);

  if (error) throw error;
  return (data as ExistingLobAssignment[]) || [];
}

// ─── Fuzzy Matching ──────────────────────────────────────────────────────────

/** Minimum confidence (%) to qualify as a fuzzy match */
const FUZZY_THRESHOLD = 60;

function findBestFuzzyMatch(
  ca: NormalizedCarrierAgent,
  portalAgents: PortalAgent[],
): { agent: PortalAgent; confidence: number } | null {
  const caFull = normalize(ca.raw_name);
  if (!caFull) return null;

  let bestMatch: PortalAgent | null = null;
  let bestScore = 0;

  for (const pa of portalAgents) {
    const paFull = normalize(`${pa.first_name || ''} ${pa.last_name || ''}`);
    if (!paFull) continue;

    const score = similarity(caFull, paFull);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pa;
    }
  }

  if (!bestMatch || bestScore < FUZZY_THRESHOLD / 100) return null;

  return {
    agent: bestMatch,
    confidence: Math.round(bestScore * 100),
  };
}

function findBestFuzzyAgencyMatch(
  ca: NormalizedCarrierAgency,
  portalAgencies: PortalAgency[],
): { agency: PortalAgency; confidence: number } | null {
  const caName = normalize(ca.raw_name);
  if (!caName) return null;

  let bestMatch: PortalAgency | null = null;
  let bestScore = 0;

  for (const pa of portalAgencies) {
    const paName = normalize(pa.name);
    if (!paName) continue;

    const score = similarity(caName, paName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pa;
    }
  }

  if (!bestMatch || bestScore < FUZZY_THRESHOLD / 100) return null;

  return {
    agency: bestMatch,
    confidence: Math.round(bestScore * 100),
  };
}

// ─── Writing Number Conflict Detection ───────────────────────────────────────

function checkWritingNumberConflict(
  agentId: string,
  carrier: string,
  newNumber: string,
  existingLobs: ExistingLobAssignment[],
): { hasConflict: boolean; existingNumber: string | null } {
  const existing = existingLobs.find(
    (l) => l.agent_id === agentId && l.carrier === carrier,
  );

  if (!existing) return { hasConflict: false, existingNumber: null };
  if (existing.writing_number === newNumber) return { hasConflict: false, existingNumber: null };

  return { hasConflict: true, existingNumber: existing.writing_number };
}

// ─── String Utilities ────────────────────────────────────────────────────────

/** Normalize a string for comparison: lowercase, trim, collapse whitespace, strip common suffixes */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(llc|inc|corp|ltd|co)\b/g, '')
    .trim();
}

function formatAgentName(a: PortalAgent): string {
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
}

/**
 * String similarity using Levenshtein distance.
 * Returns 0–1 (1 = identical).
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/**
 * Levenshtein distance — optimized single-row DP.
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space efficiency
  if (a.length > b.length) [a, b] = [b, a];

  const row = Array.from({ length: a.length + 1 }, (_, i) => i);

  for (let j = 1; j <= b.length; j++) {
    let prev = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[i] + 1,        // deletion
        prev + 1,           // insertion
        row[i - 1] + cost,  // substitution
      );
      row[i - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }

  return row[a.length];
}
