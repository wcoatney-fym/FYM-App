/**
 * Manhattan Life Hierarchy Report Parser
 *
 * Input format (XLSX, sheet "AgentHierarchy"):
 *   AgentName | AgentNumber | Status | Email | PhoneNumber |
 *   ContractDate | AdvanceStatus | TerminationDate | State |
 *   DirectManager | Level
 *
 * Status format: "Active: 216 87 72 213 215" — prefix before colon is the status.
 * DirectManager format: "AGENCY NAME 01H71120000" — name + space + carrier number.
 * Level: "02"–"09" hierarchy depth. Level 01 = FYM root (row 0, no AgentNumber).
 *
 * The root row (FYM FINANCIAL LLC, no AgentNumber) is skipped as an agent
 * but used as the hierarchy root for agency extraction.
 */
import type {
  NormalizedCarrierAgent,
  NormalizedCarrierAgency,
  CarrierParseResult,
  ParseError,
} from '../types';

/** Raw row from the Manhattan XLSX */
interface ManhattanRow {
  AgentName: string | null;
  AgentNumber: string | null;
  Status: string | null;
  Email: string | null;
  PhoneNumber: string | number | null;
  ContractDate: string | null;
  AdvanceStatus: string | null;
  TerminationDate: string | null;
  State: string | null;
  DirectManager: string | null;
  Level: string | null;
}

const MANHATTAN_HEADERS = [
  'AgentName', 'AgentNumber', 'Status', 'Email', 'PhoneNumber',
  'ContractDate', 'AdvanceStatus', 'TerminationDate', 'State',
  'DirectManager', 'Level',
] as const;

/**
 * Parse a Manhattan hierarchy XLSX file.
 * @param rows — array of arrays from xlsx sheet (first row = headers)
 */
export function parseManhattanReport(rows: (string | number | null)[][]): CarrierParseResult {
  const agents: NormalizedCarrierAgent[] = [];
  const agencies: NormalizedCarrierAgency[] = [];
  const parse_errors: ParseError[] = [];

  if (rows.length < 2) {
    return { carrier: 'Manhattan', agents, agencies, parse_errors };
  }

  // Validate headers
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const headerMap = new Map<string, number>();
  for (const expected of MANHATTAN_HEADERS) {
    const idx = headers.findIndex((h) => h.toLowerCase() === expected.toLowerCase());
    if (idx >= 0) headerMap.set(expected, idx);
  }

  // Track agencies we've seen (by carrier number) to avoid duplicates
  const seenAgencies = new Set<string>();
  // Map carrier number → agency name for hierarchy building
  const agencyMap = new Map<string, string>();

  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    try {
      const get = (col: typeof MANHATTAN_HEADERS[number]): string | null => {
        const idx = headerMap.get(col);
        if (idx === undefined || idx >= raw.length) return null;
        const v = raw[idx];
        if (v === null || v === undefined) return null;
        return String(v).trim() || null;
      };

      const agentName = get('AgentName');
      const agentNumber = get('AgentNumber');
      const statusRaw = get('Status');
      const directManager = get('DirectManager');
      const level = get('Level');

      // Skip the root row (FYM FINANCIAL LLC — no agent number, no status)
      if (!agentNumber && !statusRaw) {
        // But extract it as the root agency if it has a name
        if (agentName) {
          // Root doesn't have its own number in Manhattan format
          // We'll use it as a reference point
          agencyMap.set('ROOT', agentName);
        }
        continue;
      }

      if (!agentName) {
        parse_errors.push({ row: i + 1, raw_data: rowToObj(raw, headers), reason: 'Missing AgentName' });
        continue;
      }

      // Parse name — Manhattan uses "FIRST LAST" or "BUSINESS NAME LLC"
      const { firstName, lastName } = parseManhattanName(agentName);

      // Parse status — "Active: 216 87 72" → "active"
      const status = normalizeManhattanStatus(statusRaw);

      // Parse DirectManager — "AGENCY NAME 01H71120000" → { name, number }
      const managerInfo = parseDirectManager(directManager);

      // Extract agency from DirectManager if we haven't seen it
      if (managerInfo && managerInfo.number && !seenAgencies.has(managerInfo.number)) {
        seenAgencies.add(managerInfo.number);
        agencyMap.set(managerInfo.number, managerInfo.name);

        // Try to find the parent of this agency from a previously seen agent
        // whose DirectManager points to this agency's parent
        const parentRef = findParentRef(managerInfo.number, rows, headerMap);

        agencies.push({
          raw_name: managerInfo.name,
          carrier_number: managerInfo.number,
          parent_ref: parentRef,
          level: level ? String(Math.max(0, parseInt(level, 10) - 1)).padStart(2, '0') : null,
        });
      }

      // Also register this agent's own number as potential agency if they're an upline
      if (agentNumber) {
        agencyMap.set(agentNumber, agentName);
      }

      agents.push({
        raw_name: agentName,
        first_name: firstName,
        last_name: lastName,
        carrier_writing_number: agentNumber || '',
        status,
        raw_status: statusRaw || '',
        email: get('Email'),
        phone: normalizePhone(get('PhoneNumber')),
        state: get('State'),
        contract_date: get('ContractDate'),
        termination_date: get('TerminationDate'),
        agency_ref: managerInfo?.number || null,
        agency_name: managerInfo?.name || null,
        level,
        advance_status: get('AdvanceStatus'),
      });
    } catch (err) {
      parse_errors.push({
        row: i + 1,
        raw_data: rowToObj(raw, headers),
        reason: err instanceof Error ? err.message : 'Unknown parse error',
      });
    }
  }

  return { carrier: 'Manhattan', agents, agencies, parse_errors };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse "FIRST LAST" or "BUSINESS NAME LLC" into first/last */
function parseManhattanName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };

  // Business entities — keep full name as last_name
  const bizSuffixes = ['LLC', 'INC', 'CORP', 'LTD', 'CO', 'GROUP', 'AGENCY', 'ENTERPRISES', 'ADVISORS', 'BENEFITS', 'INSURANCE', 'FINANCIAL', 'SERVICES'];
  const isBusiness = parts.some((p) => bizSuffixes.includes(p.toUpperCase().replace(/[.,]/g, '')));
  if (isBusiness) return { firstName: '', lastName: name.trim() };

  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Normalize Manhattan status — "Active: 216 87 72" → "active" */
function normalizeManhattanStatus(raw: string | null): 'active' | 'pending' | 'terminated' {
  if (!raw) return 'pending';
  const prefix = raw.split(':')[0].trim().toLowerCase();
  if (prefix === 'active') return 'active';
  if (prefix === 'terminated') return 'terminated';
  return 'pending'; // "Pending", "Pending Advance", etc.
}

/** Parse DirectManager — "AGENCY NAME 01H71120000" → { name, number } */
function parseDirectManager(dm: string | null): { name: string; number: string } | null {
  if (!dm) return null;

  // Manhattan agent numbers follow pattern: 01H + digits (e.g. 01H70010000, 01H71120000)
  const match = dm.match(/^(.+?)\s+(01H\w+)$/);
  if (match) {
    return { name: match[1].trim(), number: match[2].trim() };
  }

  // Fallback — no number suffix, just the name
  return { name: dm.trim(), number: '' };
}

/** Find the parent agency ref for a given agency number by scanning DirectManager values */
function findParentRef(
  agencyNumber: string,
  rows: (string | number | null)[][],
  headerMap: Map<string, number>,
): string | null {
  const dmIdx = headerMap.get('DirectManager');
  const numIdx = headerMap.get('AgentNumber');
  if (dmIdx === undefined || numIdx === undefined) return null;

  // Find a row where this agency's number appears as the AgentNumber
  // and check its DirectManager for the parent
  for (let i = 1; i < rows.length; i++) {
    const num = rows[i][numIdx];
    if (num && String(num).trim() === agencyNumber) {
      const dm = rows[i][dmIdx];
      if (dm) {
        const parsed = parseDirectManager(String(dm));
        if (parsed?.number) return parsed.number;
      }
      break;
    }
  }
  return null;
}

/** Normalize phone number — strip non-digits */
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, '') || null;
}

/** Convert a row array to an object for error reporting */
function rowToObj(row: (string | number | null)[], headers: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < Math.min(row.length, headers.length); i++) {
    obj[headers[i]] = row[i];
  }
  return obj;
}
