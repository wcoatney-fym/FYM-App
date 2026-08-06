/**
 * Carrier Upload Match Engine
 *
 * Three-tier matching pipeline:
 * 1. Alias lookup — check carrier_entity_aliases for persistent mappings
 * 2. Exact match — first+last name OR phone match (case-insensitive)
 * 3. Fuzzy match — Levenshtein-based similarity with confidence score
 *
 * For agents: matches against the UNIFIED agent directory —
 *   Tier 1: agency_rosters in rcbzag (confirmed agents with name/phone/NPN)
 *   Tier 2: Max's prod DB via agent-directory edge function (all who've written)
 *   Roster agents take priority; prod agents fill the gaps.
 *
 * For agencies: matches against `hierarchy_agencies` table on portal (akhojh)
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
import { fetchAgentDirectory } from '@/lib/prod-api';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Unified agent record — merged from roster + prod DB.
 * This is the same two-tier model the Database/Agents tab uses.
 */
interface UnifiedMatchAgent {
  /** Stable ID — roster UUID or "prod-{writing_number}" */
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  agency_name: string | null;
  writing_number: string | null;
  /** 'roster' = from agency_rosters, 'prod' = from Max's DB */
  source: 'roster' | 'prod';
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
 * Match a batch of carrier agents against the unified agent directory.
 *
 * @param portalSupabase — portal Supabase client (akhojh — for aliases, LOBs, agencies)
 * @param appSupabase — FYM App Supabase client (rcbzag — for agency_rosters)
 * @param carrier — which carrier this report is from
 * @param carrierAgents — normalized agents from the carrier report
 */
export async function matchAgents(
  portalSupabase: SupabaseClient,
  carrier: SupportedCarrier,
  carrierAgents: NormalizedCarrierAgent[],
  appSupabase?: SupabaseClient,
): Promise<AgentMatchResult[]> {
  // 1. Load the unified agent directory (roster + prod DB)
  const unifiedAgents = await loadUnifiedAgents(appSupabase || portalSupabase);

  // 2. Load persistent aliases for this carrier + entity_type=agent
  const aliases = await loadAliases(portalSupabase, carrier, 'agent');

  // 3. Load existing LOB assignments for conflict detection
  const existingLobs = await loadExistingLobs(portalSupabase, carrier);

  // 4. Match each carrier agent
  return carrierAgents.map((ca) =>
    matchSingleAgent(ca, unifiedAgents, aliases, existingLobs, carrier),
  );
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
  agents: UnifiedMatchAgent[],
  aliases: CarrierEntityAlias[],
  existingLobs: ExistingLobAssignment[],
  carrier: SupportedCarrier,
): AgentMatchResult {
  const base: Omit<
    AgentMatchResult,
    | 'match_tier'
    | 'matched_agent_id'
    | 'matched_agent_name'
    | 'confidence'
    | 'alias_resolved'
    | 'writing_number_conflict'
    | 'existing_writing_number'
  > = {
    carrier_agent: ca,
  };

  // Step 1: Check persistent alias
  const alias = aliases.find(
    (a) => normalize(a.carrier_name) === normalize(ca.raw_name),
  );
  if (alias) {
    const matched = agents.find((p) => p.id === alias.matched_entity_id);
    const conflict = checkWritingNumberConflict(
      alias.matched_entity_id,
      carrier,
      ca.carrier_writing_number,
      existingLobs,
    );
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

  // Step 2: Exact match — first+last name OR phone
  const caFirst = normalize(ca.first_name);
  const caLast = normalize(ca.last_name);
  const caFull = normalize(ca.raw_name);
  const caPhone = normalizePhone(ca.phone);

  const exactMatch = agents.find((p) => {
    // 2a: Phone match — if both have phones and they match, it's exact
    if (caPhone && caPhone.length >= 7) {
      const pPhone = normalizePhone(p.phone);
      if (pPhone && pPhone === caPhone) return true;
    }

    // 2b: First + last name match (case-insensitive, trimmed)
    const pFirst = normalize(p.first_name || '');
    const pLast = normalize(p.last_name || '');

    if (caFirst && caLast && pFirst && pLast) {
      return caFirst === pFirst && caLast === pLast;
    }

    // 2c: Full name match (for business entities)
    const pFull = normalize(`${p.first_name || ''} ${p.last_name || ''}`);
    return caFull === pFull && caFull.length > 0;
  });

  if (exactMatch) {
    const conflict = checkWritingNumberConflict(
      exactMatch.id,
      carrier,
      ca.carrier_writing_number,
      existingLobs,
    );
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

  // Step 3: Fuzzy match — name similarity + phone boost
  const fuzzyResult = findBestFuzzyMatch(ca, agents);

  if (fuzzyResult && fuzzyResult.confidence >= FUZZY_THRESHOLD) {
    const conflict = checkWritingNumberConflict(
      fuzzyResult.agent.id,
      carrier,
      ca.carrier_writing_number,
      existingLobs,
    );
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

// ─── Data Loading — Unified Agent Directory ──────────────────────────────────

/** Roster row from rcbzag.agency_rosters */
interface RosterRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  agency_id: string;
  unl_writing_number: string | null;
  manhattan_writing_number: string | null;
  gtl_writing_number: string | null;
  ahl_writing_number: string | null;
  heartland_writing_number: string | null;
}

interface AgencyRow {
  id: string;
  name: string;
  writing_number: string | null;
}

/**
 * Load the unified agent directory — same two-tier model as the Agents tab:
 *   Tier 1: agency_rosters in rcbzag (confirmed roster uploads)
 *   Tier 2: Max's prod DB via agent-directory edge function
 *
 * Roster agents take priority — if a writing number appears in both,
 * the roster version wins (it has confirmed identity data + phone/email).
 */
async function loadUnifiedAgents(
  appSupabase: SupabaseClient,
): Promise<UnifiedMatchAgent[]> {
  const unified: UnifiedMatchAgent[] = [];
  const seenWns = new Set<string>();

  // ── Tier 1: Load roster agents from rcbzag ──────────────────────
  try {
    // Load agencies for name resolution
    const agencyMap = new Map<string, AgencyRow>();
    const { data: agencyData } = await appSupabase
      .from('agencies')
      .select('id, name, writing_number')
      .order('name');

    for (const a of (agencyData || []) as AgencyRow[]) {
      agencyMap.set(a.id, a);
    }

    // Load all active roster entries (paginated)
    const PAGE = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await appSupabase
        .from('agency_rosters')
        .select(
          'id, first_name, last_name, phone, email, agency_id, unl_writing_number, manhattan_writing_number, gtl_writing_number, ahl_writing_number, heartland_writing_number',
        )
        .eq('status', 'active')
        .range(offset, offset + PAGE - 1);

      if (error) {
        // Table might not exist on portal DB — graceful fallback
        if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
          console.warn('[match-engine] agency_rosters not found — skipping roster tier');
          break;
        }
        throw error;
      }

      const rows = (data || []) as RosterRow[];
      if (rows.length === 0) break;

      for (const r of rows) {
        const agency = agencyMap.get(r.agency_id);
        const wn = r.unl_writing_number?.trim() || null;
        if (wn) seenWns.add(wn);

        unified.push({
          id: r.id,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          phone: r.phone || null,
          email: r.email || null,
          agency_name: agency?.name || null,
          writing_number: wn,
          source: 'roster',
        });
      }

      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  } catch (err) {
    console.warn('[match-engine] Roster load failed, continuing with prod only:', err);
  }

  // ── Tier 2: Load prod DB agents via edge function ───────────────
  try {
    let page = 1;
    const PAGE_SIZE = 500;

    while (true) {
      const res = await fetchAgentDirectory({ page, page_size: PAGE_SIZE });

      for (const a of res.data) {
        // Skip if this writing number is already in a roster
        if (a.writing_number && seenWns.has(a.writing_number)) continue;
        if (a.writing_number) seenWns.add(a.writing_number);

        // Parse name — prod DB stores "First Last" (title-cased by edge fn)
        const nameParts = parseProdName(a.agent_name);

        unified.push({
          id: `prod-${a.writing_number}`,
          first_name: nameParts.first,
          last_name: nameParts.last,
          phone: null, // Prod DB doesn't have phone
          email: null, // Prod DB doesn't have email
          agency_name: a.agency_name || null,
          writing_number: a.writing_number,
          source: 'prod',
        });
      }

      if (page >= res.pagination.total_pages) break;
      page++;
    }
  } catch (err) {
    console.warn('[match-engine] Prod DB agent load failed:', err);
    // If prod fails but we have roster agents, continue with those
    if (unified.length === 0) throw err;
  }

  console.log(
    `[match-engine] Loaded ${unified.length} unified agents (${unified.filter((a) => a.source === 'roster').length} roster, ${unified.filter((a) => a.source === 'prod').length} prod)`,
  );

  return unified;
}

/** Parse prod DB name — edge fn title-cases, format is "First Last" */
function parseProdName(raw: string | null): { first: string; last: string } {
  if (!raw) return { first: '', last: '' };
  const trimmed = raw.trim();

  // Check for "LAST, FIRST" format (some prod DB entries)
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',');
    const first = rest.join(',').trim();
    return { first: titleCase(first), last: titleCase(last) };
  }

  // "First Last" or single word
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return {
      first: titleCase(parts.slice(0, -1).join(' ')),
      last: titleCase(parts[parts.length - 1]),
    };
  }

  return { first: titleCase(trimmed), last: '' };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Portal Data Loading (agencies, aliases, LOBs) ──────────────────────────

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

  // Gracefully handle missing table (migration not yet deployed)
  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.message?.includes('Could not find the table')
    ) {
      console.warn(
        '[match-engine] carrier_entity_aliases table not found — skipping alias lookup',
      );
      return [];
    }
    throw error;
  }
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
  agents: UnifiedMatchAgent[],
): { agent: UnifiedMatchAgent; confidence: number } | null {
  const caFull = normalize(ca.raw_name);
  if (!caFull) return null;

  const caPhone = normalizePhone(ca.phone);

  let bestMatch: UnifiedMatchAgent | null = null;
  let bestScore = 0;

  for (const pa of agents) {
    const paFull = normalize(`${pa.first_name || ''} ${pa.last_name || ''}`);
    if (!paFull) continue;

    let score = similarity(caFull, paFull);

    // Phone boost — if phones are close but not exact, bump confidence
    if (caPhone && caPhone.length >= 7) {
      const paPhone = normalizePhone(pa.phone);
      if (paPhone && paPhone.length >= 7) {
        // Last 7 digits match = strong phone signal
        if (caPhone.slice(-7) === paPhone.slice(-7)) {
          score = Math.min(1, score + 0.15);
        }
      }
    }

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
  if (existing.writing_number === newNumber)
    return { hasConflict: false, existingNumber: null };

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

/** Normalize a phone number — strip non-digits, return last 10 digits */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  // Return last 10 digits (strip country code)
  return digits.slice(-10);
}

function formatAgentName(a: UnifiedMatchAgent): string {
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
        row[i] + 1, // deletion
        prev + 1, // insertion
        row[i - 1] + cost, // substitution
      );
      row[i - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }

  return row[a.length];
}
