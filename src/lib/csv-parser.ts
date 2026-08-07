/**
 * RFC 4180-compliant CSV parser.
 *
 * Handles:
 * - Quoted fields containing commas, newlines, and escaped quotes ("")
 * - Mixed quoted/unquoted fields
 * - CRLF and LF line endings
 * - BOM stripping
 * - Trailing newlines
 *
 * Does NOT handle streaming — loads the full string. Fine for roster-sized
 * files (hundreds of rows, not millions).
 */

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse a CSV string into typed rows keyed by header.
 * Headers are trimmed and lowercased with spaces replaced by underscores.
 */
export function parseCSV(text: string): ParsedCSV {
  // Strip BOM if present
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = parseRecords(clean);

  if (records.length < 2) return { headers: [], rows: [] };

  const headers = records[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_'),
  );

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    // Skip fully empty rows
    if (values.every((v) => v.trim() === '')) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse RFC 4180 CSV text into a 2D array of string values.
 *
 * State machine approach: character-by-character scan tracking whether
 * we're inside a quoted field. Handles doubled quotes ("") as escapes.
 */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: doubled quote = escaped quote literal
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        // CRLF or bare CR — end of record
        fields.push(field);
        records.push(fields);
        fields = [];
        field = '';
        i++;
        if (i < text.length && text[i] === '\n') i++;
      } else if (ch === '\n') {
        fields.push(field);
        records.push(fields);
        fields = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Final field/record (no trailing newline)
  if (field || fields.length > 0) {
    fields.push(field);
    records.push(fields);
  }

  return records;
}
