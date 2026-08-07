/**
 * Shared types and constants for the Contracting Roster Import flow.
 *
 * Extracted from the ContractingRosterImportTab monolith to enable
 * decomposition and testing.
 */

/* ------------------------------------------------------------------ */
/*  Import result types                                               */
/* ------------------------------------------------------------------ */

export type ImportRowStatus = 'imported' | 'skipped' | 'error';

export interface ImportRowDetail {
  row: number;
  name: string;
  npn: string;
  status: ImportRowStatus;
  reason?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: ImportRowDetail[];
}

/* ------------------------------------------------------------------ */
/*  Header normalisation — single source of truth for the import tab  */
/* ------------------------------------------------------------------ */

/**
 * Required columns for a roster import CSV.
 * These must be present (after alias resolution) or the file is rejected.
 */
export const REQUIRED_IMPORT_FIELDS = ['first_name', 'last_name', 'npn'] as const;
export type RequiredImportField = (typeof REQUIRED_IMPORT_FIELDS)[number];

/**
 * Optional columns we recognise and map.
 */
export const OPTIONAL_IMPORT_FIELDS = ['email', 'phone', 'agency', 'resident_state'] as const;

/**
 * All recognised canonical field names (required + optional).
 */
export const ALL_IMPORT_FIELDS = [...REQUIRED_IMPORT_FIELDS, ...OPTIONAL_IMPORT_FIELDS] as const;
export type ImportField = (typeof ALL_IMPORT_FIELDS)[number];

/**
 * Alias map: lowercased CSV header → canonical import field.
 * Consolidates the three prior alias sets scattered across
 * `normalizeHeaders`, `rosterNormalizer.ts`, and `roster-normalizer.ts`.
 */
const IMPORT_HEADER_ALIASES: Record<string, ImportField> = {
  // first_name
  first_name: 'first_name',
  firstname: 'first_name',
  first: 'first_name',
  agent_first_name: 'first_name',
  'first name': 'first_name',
  fname: 'first_name',

  // last_name
  last_name: 'last_name',
  lastname: 'last_name',
  last: 'last_name',
  agent_last_name: 'last_name',
  'last name': 'last_name',
  lname: 'last_name',

  // npn
  npn: 'npn',
  agent_npn: 'npn',
  national_producer_number: 'npn',
  'agent npn': 'npn',
  'national producer number': 'npn',

  // email
  email: 'email',
  agent_email: 'email',
  email_address: 'email',
  'e-mail': 'email',
  'email address': 'email',

  // phone
  phone: 'phone',
  agent_phone: 'phone',
  phone_number: 'phone',
  cell: 'phone',
  mobile: 'phone',
  'phone number': 'phone',
  'cell phone': 'phone',

  // agency
  agency: 'agency',
  agency_name: 'agency',
  sub_agency: 'agency',

  // resident_state
  resident_state: 'resident_state',
  state: 'resident_state',
  home_state: 'resident_state',
};

/**
 * Resolve a set of raw (already-lowercased, underscore-normalised) CSV
 * headers to their canonical import fields.
 *
 * Returns a Map<rawHeader, canonicalField> for every header that matched.
 */
export function resolveImportHeaders(
  rawHeaders: string[],
): Map<string, ImportField> {
  const map = new Map<string, ImportField>();

  for (const raw of rawHeaders) {
    // The csv-parser already lowercases + underscores headers, but alias
    // lookup also needs the space-separated form for headers like "first name".
    const withSpaces = raw.replace(/_/g, ' ');
    const canonical = IMPORT_HEADER_ALIASES[raw] ?? IMPORT_HEADER_ALIASES[withSpaces];
    if (canonical) {
      map.set(raw, canonical);
    }
  }

  return map;
}

/**
 * Check that all required fields are present in a header map.
 * Returns the list of missing required fields, or an empty array if all good.
 */
export function findMissingRequired(
  headerMap: Map<string, ImportField>,
): RequiredImportField[] {
  const mapped = new Set(headerMap.values());
  return REQUIRED_IMPORT_FIELDS.filter((f) => !mapped.has(f));
}

/**
 * Convenience: pull a canonical field value from a raw row using the header map.
 */
export function getMappedValue(
  row: Record<string, string>,
  field: ImportField,
  headerMap: Map<string, ImportField>,
): string {
  for (const [rawHeader, canonical] of headerMap) {
    if (canonical === field) return row[rawHeader]?.trim() ?? '';
  }
  return '';
}

/* ------------------------------------------------------------------ */
/*  Template CSV                                                      */
/* ------------------------------------------------------------------ */

const TEMPLATE_CSV =
  'first_name,last_name,npn,email,phone,agency,resident_state\n' +
  'John,Smith,12345678,john@email.com,555-123-4567,DH Insurance,Georgia\n';

/**
 * Generate a downloadable CSV template blob URL.
 * Caller is responsible for revoking via URL.revokeObjectURL().
 */
export function createTemplateBlobUrl(): string {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  return URL.createObjectURL(blob);
}

/* ------------------------------------------------------------------ */
/*  File size guard                                                    */
/* ------------------------------------------------------------------ */

/** Max CSV file size: 2 MB — more than enough for any realistic roster. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
