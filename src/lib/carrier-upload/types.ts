/**
 * Carrier Hierarchy Report Upload — shared types
 *
 * All carrier-specific parsers normalize to these common formats.
 * The match engine operates on NormalizedCarrierAgent/Agency exclusively.
 */

// ─── Carrier Registry ────────────────────────────────────────────────────────

export const SUPPORTED_CARRIERS = ['Manhattan', 'GTL'] as const;
export type SupportedCarrier = typeof SUPPORTED_CARRIERS[number];

// ─── Normalized Agent (output of any carrier parser) ─────────────────────────

export interface NormalizedCarrierAgent {
  /** Full name as it appears in the report */
  raw_name: string;
  first_name: string;
  last_name: string;
  /** Carrier-specific writing/agent number */
  carrier_writing_number: string;
  /** Normalized status */
  status: 'active' | 'pending' | 'terminated';
  /** Raw status string from carrier report */
  raw_status: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  /** Contract/effective date */
  contract_date: string | null;
  /** Termination date if applicable */
  termination_date: string | null;
  /** Reference to agency (carrier-specific upline number or name) */
  agency_ref: string | null;
  /** Parsed agency name (best effort from report) */
  agency_name: string | null;
  /** Hierarchy level (carrier-specific) */
  level: string | null;
  /** Advance status (Manhattan-specific) */
  advance_status: string | null;
}

// ─── Normalized Agency (extracted from hierarchy reports) ────────────────────

export interface NormalizedCarrierAgency {
  /** Agency name as it appears in the report */
  raw_name: string;
  /** Carrier-specific agency/writing number */
  carrier_number: string;
  /** Parent agency reference (carrier number of upline) */
  parent_ref: string | null;
  /** Hierarchy level */
  level: string | null;
}

// ─── Parser Output ───────────────────────────────────────────────────────────

export interface CarrierParseResult {
  carrier: SupportedCarrier;
  agents: NormalizedCarrierAgent[];
  agencies: NormalizedCarrierAgency[];
  /** Rows that couldn't be parsed */
  parse_errors: ParseError[];
}

export interface ParseError {
  row: number;
  raw_data: Record<string, unknown>;
  reason: string;
}

// ─── Match Results ───────────────────────────────────────────────────────────

export type MatchTier = 'exact' | 'fuzzy' | 'none';

export interface AgentMatchResult {
  /** The normalized agent from the carrier report */
  carrier_agent: NormalizedCarrierAgent;
  /** Match tier */
  match_tier: MatchTier;
  /** Matched portal agent ID (if any) */
  matched_agent_id: string | null;
  /** Matched agent name for display */
  matched_agent_name: string | null;
  /** Fuzzy match confidence (0–100) */
  confidence: number | null;
  /** Was this resolved via a persistent alias? */
  alias_resolved: boolean;
  /** Writing number conflict flag */
  writing_number_conflict: boolean;
  /** Existing writing number if conflict */
  existing_writing_number: string | null;
}

export interface AgencyMatchResult {
  /** The normalized agency from the carrier report */
  carrier_agency: NormalizedCarrierAgency;
  /** Match tier */
  match_tier: MatchTier;
  /** Matched hierarchy_agencies ID (if any) */
  matched_agency_id: string | null;
  /** Matched agency name for display */
  matched_agency_name: string | null;
  /** Fuzzy match confidence (0–100) */
  confidence: number | null;
  /** Was this resolved via a persistent alias? */
  alias_resolved: boolean;
}

// ─── Upload Report ───────────────────────────────────────────────────────────

export interface CarrierUploadReport {
  carrier: SupportedCarrier;
  file_name: string;
  upload_id: string;
  timestamp: string;
  summary: {
    total_agents: number;
    exact_matches: number;
    fuzzy_matches: number;
    no_matches: number;
    total_agencies: number;
    agency_exact: number;
    agency_fuzzy: number;
    agency_no_match: number;
    writing_number_conflicts: number;
  };
  agent_results: AgentMatchResult[];
  agency_results: AgencyMatchResult[];
}

// ─── Alias (persistent match mapping) ────────────────────────────────────────

export interface CarrierEntityAlias {
  id: string;
  carrier: string;
  carrier_name: string;
  carrier_number: string | null;
  entity_type: 'agent' | 'agency';
  matched_entity_id: string;
  match_type: 'exact' | 'fuzzy' | 'manual';
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Carrier tag helpers ─────────────────────────────────────────────────────

/** Build a carrier tag: "Manhattan" for active, "GTL:Pending" or "Manhattan:Terminated" for non-active */
export function buildCarrierTag(carrier: SupportedCarrier, status: 'active' | 'pending' | 'terminated'): string {
  if (status === 'active') return carrier;
  return `${carrier}:${status.charAt(0).toUpperCase() + status.slice(1)}`;
}
