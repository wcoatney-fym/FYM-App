const MALE_PROFILE_IMAGE = 'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_PROFILE_IMAGE = 'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

export const CANONICAL_ROSTER_HEADERS = [
  'Seat Number',
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Agent NPN',
  'All Templates | Agent Profile Image',
  'All Templates | Agent CRM #',
];

export const ROSTER_TEMPLATE_HEADERS = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Agent NPN',
  'Gender',
];

const FIELD_ALIASES: Record<string, string[]> = {
  'Seat Number': ['seat number', 'seat_number', 'seat', 'seatnumber'],
  'First Name': ['first name', 'first_name', 'firstname', 'fname'],
  'Last Name': ['last name', 'last_name', 'lastname', 'lname'],
  'Email': ['email', 'e-mail', 'email address'],
  'Phone': ['phone', 'phone number', 'phone_number', 'cell', 'mobile'],
  'Agent NPN': ['agent npn', 'npn', 'agent_npn', 'national producer number'],
  'Gender': ['gender', 'sex'],
};

function resolveColumn(rawHeader: string): string | null {
  const normalized = rawHeader.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalized)) return canonical;
  }
  return null;
}

function buildColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const raw of headers) {
    const resolved = resolveColumn(raw);
    if (resolved) map[resolved] = raw;
  }
  return map;
}

function mapGenderToImage(gender: string): string {
  const g = gender.trim().toLowerCase();
  if (g === 'male' || g === 'm') return MALE_PROFILE_IMAGE;
  if (g === 'female' || g === 'f') return FEMALE_PROFILE_IMAGE;
  return '';
}

function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

export function normalizeRosterRows(
  rawRows: Record<string, string>[],
  agencyCrmNumber: string,
  csrNpn?: string
): { headers: string[]; rows: Record<string, string>[] } {
  if (rawRows.length === 0) return { headers: CANONICAL_ROSTER_HEADERS, rows: [] };

  const rawHeaders = Object.keys(rawRows[0]);
  const colMap = buildColumnMap(rawHeaders);

  const rows: Record<string, string>[] = rawRows.map((raw, idx) => {
    const row: Record<string, string> = {};

    const seatRaw = colMap['Seat Number'] ? sanitize(raw[colMap['Seat Number']] || '') : '';
    row['Seat Number'] = seatRaw && /^\d+$/.test(seatRaw) ? seatRaw : String(idx + 1);

    row['First Name'] = colMap['First Name'] ? sanitize(raw[colMap['First Name']] || '') : '';
    row['Last Name'] = colMap['Last Name'] ? sanitize(raw[colMap['Last Name']] || '') : '';
    row['Email'] = colMap['Email'] ? sanitize(raw[colMap['Email']] || '') : '';
    row['Phone'] = colMap['Phone'] ? sanitize(raw[colMap['Phone']] || '') : '';
    row['Agent NPN'] = colMap['Agent NPN'] ? sanitize(raw[colMap['Agent NPN']] || '') : '';

    const genderRaw = colMap['Gender'] ? sanitize(raw[colMap['Gender']] || '') : '';
    row['All Templates | Agent Profile Image'] = mapGenderToImage(genderRaw);
    row['All Templates | Agent CRM #'] = agencyCrmNumber;

    if (csrNpn && row['Agent NPN'] === csrNpn && row['First Name']) {
      row['CSR Placeholder'] = 'true';
    }

    return row;
  });

  return { headers: CANONICAL_ROSTER_HEADERS, rows };
}
