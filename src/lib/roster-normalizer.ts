/**
 * Roster Normalizer — FYM App Agency Roster Management
 *
 * Normalizes CSV uploads to the canonical roster template format.
 * Template columns match the CRM Onboarding roster template (Charlie spec 2026-07-29):
 *   Mandatory: First Name, Last Name, Email, Phone, Agent NPN, Gender
 *   Carrier WNs (at least 1 required): UNL, GTL, AHL, Heartland, Manhattan Writing Numbers
 */

export const ROSTER_TEMPLATE_HEADERS = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Agent NPN',
  'Gender',
  'UNL Writing Number',
  'GTL Writing Number',
  'AHL Writing Number',
  'Heartland Writing Number',
  'Manhattan Writing Number',
] as const;

export type RosterTemplateHeader = (typeof ROSTER_TEMPLATE_HEADERS)[number];

/** Alias map: common CSV header variations → canonical header */
const HEADER_ALIASES: Record<string, RosterTemplateHeader> = {
  'first name': 'First Name',
  'firstname': 'First Name',
  'first': 'First Name',
  'last name': 'Last Name',
  'lastname': 'Last Name',
  'last': 'Last Name',
  'email': 'Email',
  'email address': 'Email',
  'e-mail': 'Email',
  'phone': 'Phone',
  'phone number': 'Phone',
  'cell': 'Phone',
  'cell phone': 'Phone',
  'mobile': 'Phone',
  'agent npn': 'Agent NPN',
  'npn': 'Agent NPN',
  'national producer number': 'Agent NPN',
  'gender': 'Gender',
  'sex': 'Gender',
  'unl writing number': 'UNL Writing Number',
  'unl wn': 'UNL Writing Number',
  'unl': 'UNL Writing Number',
  'gtl writing number': 'GTL Writing Number',
  'gtl wn': 'GTL Writing Number',
  'gtl': 'GTL Writing Number',
  'ahl writing number': 'AHL Writing Number',
  'ahl wn': 'AHL Writing Number',
  'ahl': 'AHL Writing Number',
  'heartland writing number': 'Heartland Writing Number',
  'heartland wn': 'Heartland Writing Number',
  'heartland': 'Heartland Writing Number',
  'manhattan writing number': 'Manhattan Writing Number',
  'manhattan wn': 'Manhattan Writing Number',
  'manhattan': 'Manhattan Writing Number',
};

const MANDATORY_FIELDS: RosterTemplateHeader[] = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Agent NPN',
  'Gender',
];

const WRITING_NUMBER_FIELDS: RosterTemplateHeader[] = [
  'UNL Writing Number',
  'GTL Writing Number',
  'AHL Writing Number',
  'Heartland Writing Number',
  'Manhattan Writing Number',
];

export interface RosterValidationError {
  row: number;
  field: string;
  message: string;
}

export interface NormalizeResult {
  rows: Record<string, string>[];
  errors: RosterValidationError[];
  headerMap: Record<string, string>;
}

function normalizeGender(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'Male';
  if (v === 'female' || v === 'f') return 'Female';
  return null;
}

/**
 * Normalize raw CSV rows to canonical roster format.
 * Returns normalized rows and any validation errors.
 */
export function normalizeRosterRows(
  rawRows: Record<string, string>[],
): NormalizeResult {
  if (rawRows.length === 0) {
    return { rows: [], errors: [{ row: 0, field: '', message: 'CSV file is empty' }], headerMap: {} };
  }

  // Build header mapping from raw headers → canonical
  const rawHeaders = Object.keys(rawRows[0]);
  const headerMap: Record<string, string> = {};

  for (const rawHeader of rawHeaders) {
    const normalized = rawHeader.trim().toLowerCase();
    const canonical = HEADER_ALIASES[normalized];
    if (canonical) {
      headerMap[rawHeader] = canonical;
    }
  }

  // Check all mandatory fields are mappable
  const mappedCanonical = new Set(Object.values(headerMap));
  const missingMandatory = MANDATORY_FIELDS.filter((f) => !mappedCanonical.has(f));
  if (missingMandatory.length > 0) {
    return {
      rows: [],
      errors: [{ row: 0, field: '', message: `Missing required columns: ${missingMandatory.join(', ')}` }],
      headerMap,
    };
  }

  // Check at least one WN column is present
  const hasAnyWN = WRITING_NUMBER_FIELDS.some((f) => mappedCanonical.has(f));
  if (!hasAnyWN) {
    return {
      rows: [],
      errors: [{ row: 0, field: '', message: 'At least one carrier writing number column is required' }],
      headerMap,
    };
  }

  const errors: RosterValidationError[] = [];
  const normalizedRows: Record<string, string>[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const row: Record<string, string> = {};
    let rowValid = true;

    // Map raw values to canonical headers
    for (const [rawHeader, canonical] of Object.entries(headerMap)) {
      row[canonical] = (raw[rawHeader] || '').trim();
    }

    // Validate mandatory fields
    for (const field of MANDATORY_FIELDS) {
      if (!row[field]) {
        errors.push({ row: i + 1, field, message: `${field} is required` });
        rowValid = false;
      }
    }

    // Validate gender
    if (row['Gender']) {
      const normalizedGender = normalizeGender(row['Gender']);
      if (!normalizedGender) {
        errors.push({ row: i + 1, field: 'Gender', message: `Invalid gender value: "${row['Gender']}". Use Male/Female/M/F` });
        rowValid = false;
      } else {
        row['Gender'] = normalizedGender;
      }
    }

    // Validate at least one writing number per row
    const hasWN = WRITING_NUMBER_FIELDS.some((f) => row[f]);
    if (!hasWN) {
      errors.push({ row: i + 1, field: 'Writing Numbers', message: 'At least one carrier writing number is required' });
      rowValid = false;
    }

    if (rowValid) {
      normalizedRows.push(row);
    }
  }

  return { rows: normalizedRows, errors, headerMap };
}

/**
 * Generate a blank CSV template for download.
 */
export function generateTemplateCSV(): string {
  return ROSTER_TEMPLATE_HEADERS.join(',') + '\n';
}
