/**
 * CRM Ops helpers — ported from OpenClaw-Dashboard kpiHelpers.ts + crm-portal-client.ts
 */

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

export function weeksSince(dateCreated: string): number {
  const created = new Date(dateCreated + 'T00:00:00Z');
  const now = new Date();
  const ms = now.getTime() - created.getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

export function monthsSince(dateCreated: string): number {
  const created = new Date(dateCreated + 'T00:00:00Z');
  const now = new Date();
  const months =
    (now.getUTCFullYear() - created.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - created.getUTCMonth());
  return Math.max(1, months);
}

export function avgContactsPerWeek(
  totalContacts: number,
  dateCreated: string | null,
  dbaClientCount = 0
): number {
  const newContacts = Math.max(0, totalContacts - dbaClientCount);
  if (!dateCreated) return newContacts;
  return Math.round(newContacts / weeksSince(dateCreated));
}

export function avgContactsPerMonth(
  totalContacts: number,
  dateCreated: string | null,
  dbaClientCount = 0
): number {
  const newContacts = Math.max(0, totalContacts - dbaClientCount);
  if (!dateCreated) return newContacts;
  return Math.round(newContacts / monthsSince(dateCreated));
}
