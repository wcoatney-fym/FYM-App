/**
 * GTL Hierarchy Report Parser
 *
 * Input format (XLSX, two sheets):
 *
 * Sheet 1 — "OOQ00 (A)ctive & (T)erminated":
 *   Up Line Number | Agent Number | Status Code | Agent Name
 *   Status codes: A = Active, T = Terminated, P = Pending
 *   Values are padded with spaces — trim everything.
 *
 * Sheet 2 — "(P)ending":
 *   Agent Number | Status Code | First Name | Last Name | Agency Name | Top Up Line Number
 *   All values space-padded.
 *
 * GTL numbers follow pattern: 011OOQ + suffix (e.g. 011OOQ00, 011OOQ07, 011OOQ0E)
 * The root entry (FYM FINANCIAL LLC) has Up Line Number blank/spaces and is the hierarchy root.
 */
import type {
  NormalizedCarrierAgent,
  NormalizedCarrierAgency,
  CarrierParseResult,
  ParseError,
} from '../types';

/**
 * Parse a GTL hierarchy XLSX file.
 * @param sheets — map of sheet name → array of row arrays (first row = headers per sheet)
 */
export function parseGtlReport(
  sheets: Record<string, (string | number | null)[][]>,
): CarrierParseResult {
  const agents: NormalizedCarrierAgent[] = [];
  const agencies: NormalizedCarrierAgency[] = [];
  const parse_errors: ParseError[] = [];

  // Track seen agency numbers for dedup
  const seenAgencies = new Set<string>();
  // Map agent number → name for agency extraction
  const numberToName = new Map<string, string>();

  // ── Sheet 1: Active & Terminated ──────────────────────────────────────

  const activeSheetName = Object.keys(sheets).find((s) =>
    s.toLowerCase().includes('active') || s.toLowerCase().includes('terminated'),
  );

  if (activeSheetName && sheets[activeSheetName].length > 1) {
    const rows = sheets[activeSheetName];
    const headers = rows[0].map((h) => trim(h));

    const colMap = buildColumnMap(headers, [
      'Up Line Number',
      'Agent Number',
      'Status Code',
      'Agent Name',
    ]);

    // First pass: build number→name map for agency extraction
    for (let i = 1; i < rows.length; i++) {
      const num = trimCell(rows[i], colMap.get('Agent Number'));
      const name = trimCell(rows[i], colMap.get('Agent Name'));
      if (num && name) numberToName.set(num, name);
    }

    // Second pass: parse agents + extract agencies
    for (let i = 1; i < rows.length; i++) {
      try {
        const upline = trimCell(rows[i], colMap.get('Up Line Number'));
        const agentNum = trimCell(rows[i], colMap.get('Agent Number'));
        const statusCode = trimCell(rows[i], colMap.get('Status Code'));
        const agentName = trimCell(rows[i], colMap.get('Agent Name'));

        if (!agentNum || !agentName) {
          parse_errors.push({
            row: i + 1,
            raw_data: rowToObj(rows[i], headers),
            reason: 'Missing Agent Number or Agent Name',
          });
          continue;
        }

        // Skip root entry (FYM FINANCIAL LLC — blank upline)
        if (!upline) {
          numberToName.set(agentNum, agentName);
          continue;
        }

        const status = normalizeGtlStatus(statusCode);
        const { firstName, lastName } = parseGtlName(agentName);

        // Extract agency from upline if not yet seen
        if (upline && !seenAgencies.has(upline)) {
          seenAgencies.add(upline);
          const uplineName = numberToName.get(upline) || upline;
          agencies.push({
            raw_name: uplineName,
            carrier_number: upline,
            parent_ref: null, // GTL active sheet doesn't have upline-of-upline
            level: null,
          });
        }

        agents.push({
          raw_name: agentName,
          first_name: firstName,
          last_name: lastName,
          carrier_writing_number: agentNum,
          status,
          raw_status: statusCode || '',
          email: null, // GTL active sheet doesn't include email
          phone: null,
          state: null,
          contract_date: null,
          termination_date: null,
          agency_ref: upline,
          agency_name: upline ? (numberToName.get(upline) || null) : null,
          level: null,
          advance_status: null,
        });
      } catch (err) {
        parse_errors.push({
          row: i + 1,
          raw_data: rowToObj(rows[i], headers),
          reason: err instanceof Error ? err.message : 'Unknown parse error',
        });
      }
    }
  }

  // ── Sheet 2: Pending ──────────────────────────────────────────────────

  const pendingSheetName = Object.keys(sheets).find((s) =>
    s.toLowerCase().includes('pending'),
  );

  if (pendingSheetName && sheets[pendingSheetName].length > 1) {
    const rows = sheets[pendingSheetName];
    const headers = rows[0].map((h) => trim(h));

    const colMap = buildColumnMap(headers, [
      'Agent Number',
      'Status Code',
      'First Name',
      'Last Name',
      'Agency Name',
      'Top Up Line Number',
    ]);

    for (let i = 1; i < rows.length; i++) {
      try {
        const agentNum = trimCell(rows[i], colMap.get('Agent Number'));
        const statusCode = trimCell(rows[i], colMap.get('Status Code'));
        const firstName = trimCell(rows[i], colMap.get('First Name')) || '';
        const lastName = trimCell(rows[i], colMap.get('Last Name')) || '';
        const agencyName = trimCell(rows[i], colMap.get('Agency Name'));
        const topUpline = trimCell(rows[i], colMap.get('Top Up Line Number'));

        if (!agentNum) {
          parse_errors.push({
            row: i + 1,
            raw_data: rowToObj(rows[i], headers),
            reason: 'Missing Agent Number',
          });
          continue;
        }

        // Extract agency from upline
        const uplineRef = topUpline || null;
        if (uplineRef && !seenAgencies.has(uplineRef)) {
          seenAgencies.add(uplineRef);
          const uplineName = numberToName.get(uplineRef) || agencyName || uplineRef;
          agencies.push({
            raw_name: uplineName,
            carrier_number: uplineRef,
            parent_ref: null,
            level: null,
          });
        }

        const fullName = [firstName, lastName].filter(Boolean).join(' ');

        agents.push({
          raw_name: fullName || agentNum,
          first_name: firstName,
          last_name: lastName,
          carrier_writing_number: agentNum,
          status: normalizeGtlStatus(statusCode),
          raw_status: statusCode || '',
          email: null,
          phone: null,
          state: null,
          contract_date: null,
          termination_date: null,
          agency_ref: uplineRef,
          agency_name: agencyName || (uplineRef ? (numberToName.get(uplineRef) || null) : null),
          level: null,
          advance_status: null,
        });
      } catch (err) {
        parse_errors.push({
          row: i + 1,
          raw_data: rowToObj(rows[i], headers),
          reason: err instanceof Error ? err.message : 'Unknown parse error',
        });
      }
    }
  }

  return { carrier: 'GTL', agents, agencies, parse_errors };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trim(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function trimCell(row: (string | number | null)[], idx: number | undefined): string | null {
  if (idx === undefined || idx >= row.length) return null;
  const v = row[idx];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeGtlStatus(code: string | null): 'active' | 'pending' | 'terminated' {
  if (!code) return 'pending';
  const c = code.trim().toUpperCase();
  if (c === 'A') return 'active';
  if (c === 'T') return 'terminated';
  return 'pending'; // P or anything else
}

function parseGtlName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };

  // Business entities
  const bizSuffixes = ['LLC', 'INC', 'CORP', 'LTD', 'CO', 'GROUP', 'AGENCY', 'ENTERPRISES'];
  const isBusiness = parts.some((p) => bizSuffixes.includes(p.toUpperCase().replace(/[.,]/g, '')));
  if (isBusiness) return { firstName: '', lastName: name.trim() };

  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function buildColumnMap(headers: string[], expected: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const col of expected) {
    const idx = headers.findIndex((h) => h.toLowerCase() === col.toLowerCase());
    if (idx >= 0) map.set(col, idx);
  }
  return map;
}

function rowToObj(row: (string | number | null)[], headers: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < Math.min(row.length, headers.length); i++) {
    obj[headers[i]] = row[i];
  }
  return obj;
}
