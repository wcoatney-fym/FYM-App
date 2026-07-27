/**
 * Roster repush logic — ported from OpenClaw-Dashboard rosterRepush.ts
 *
 * Centralizes roster → GHL repush: hidden derived field derivation,
 * warmup + throttle + single-retry loop for CRM onboarding webhook.
 */
// @ts-nocheck
import { supabase } from './portal-client';
import {
  fireCrmOnboardingWebhook,
  warmUpCrmOnboardingWebhook,
} from './webhooks';

export type RosterRepushRow = {
  id: string;
  row_data: Record<string, string>;
};

// Hidden derived field keys (mirrors padRosterTo200)
export const DBC_HOME_PAGE_KEY = 'Digital Business Card Home Page';
export const APPT_CONFIRMATION_KEY = 'Appt Booked Confirmation Page';
export const CALENDAR_EMBED_KEY = 'Calendar Embed Code';

// Timing constants
const WARMUP_SETTLE_MS = 1500;
const PER_ROW_DELAY_MS = 3000;
const RETRY_INITIAL_DELAY_MS = 5000;
const RETRY_PER_ROW_DELAY_MS = 5000;

const seatOf = (row: RosterRepushRow): number =>
  Number(row.row_data['Seat Number']);

const isPopulated = (row: RosterRepushRow): boolean =>
  !!row.row_data['First Name']?.trim();

/**
 * Compute derived hidden-field values for a roster row.
 */
export function deriveHiddenFields(
  seat: number,
  urlPrefix: string,
  calendarEmbed: string
): Record<string, string> {
  const fields: Record<string, string> = {};
  fields[CALENDAR_EMBED_KEY] = calendarEmbed;
  if (urlPrefix && seat) {
    fields[DBC_HOME_PAGE_KEY] =
      `${urlPrefix}.my-agent-appt.com/r${seat}-click-to-schedule`;
    fields[APPT_CONFIRMATION_KEY] =
      `${urlPrefix}.my-agent-appt.com/r${seat}-youre-confirmed`;
  } else {
    fields[DBC_HOME_PAGE_KEY] = '';
    fields[APPT_CONFIRMATION_KEY] = '';
  }
  return fields;
}

export type RegenerateResult = {
  allRows: RosterRepushRow[];
  changedRowIds: Set<string>;
};

/**
 * Regenerate hidden derived fields for every roster row of an agency's
 * active (latest) upload and persist changes.
 */
export async function regenerateAgencyRosterHiddenFields(
  agencyName: string,
  urlPrefixRaw: string | null | undefined,
  calendarEmbedRaw: string | null | undefined
): Promise<RegenerateResult> {
  const urlPrefix = (urlPrefixRaw || '').trim();
  const calendarEmbed = (calendarEmbedRaw || '').trim();

  const { data: upload } = await supabase
    .from('crm_roster_uploads')
    .select('id')
    .eq('agency', agencyName)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!upload) {
    return { allRows: [], changedRowIds: new Set() };
  }

  const { data: rows } = await supabase
    .from('crm_roster')
    .select('id, row_data')
    .eq('upload_id', upload.id);

  const numericRows = (rows || []).filter((r) =>
    /^\d+$/.test(r.row_data['Seat Number'] || '')
  ) as RosterRepushRow[];

  const changedRowIds = new Set<string>();
  const updatedRows: RosterRepushRow[] = [];

  for (const row of numericRows) {
    const seat = seatOf(row);
    const derived = deriveHiddenFields(seat, urlPrefix, calendarEmbed);

    const changed = Object.entries(derived).some(
      ([key, val]) => (row.row_data[key] || '') !== val
    );

    if (changed) {
      const updatedData = { ...row.row_data, ...derived };
      const { error } = await supabase
        .from('crm_roster')
        .update({ row_data: updatedData })
        .eq('id', row.id);
      if (!error) {
        changedRowIds.add(row.id);
        updatedRows.push({ id: row.id, row_data: updatedData });
        continue;
      }
    }
    updatedRows.push(row);
  }

  updatedRows.sort((a, b) => seatOf(a) - seatOf(b));
  return { allRows: updatedRows, changedRowIds };
}

/** Build the exact onboarding webhook payload for a roster row. */
export function buildOnboardingPayload(
  row: RosterRepushRow,
  agency: string
) {
  return {
    seatNumber: row.row_data['Seat Number'] || '',
    agentNpn: row.row_data['Agent NPN'] || '',
    firstName: row.row_data['First Name'] || '',
    lastName: row.row_data['Last Name'] || '',
    email: row.row_data['Email'] || '',
    phone: row.row_data['Phone'] || '',
    profileImage:
      row.row_data['All Templates | Agent Profile Image'] || '',
    crmNumber: row.row_data['All Templates | Agent CRM #'] || '',
    agency,
    digitalBusinessCardUrl: row.row_data[DBC_HOME_PAGE_KEY] || '',
    confirmationPageUrl: row.row_data[APPT_CONFIRMATION_KEY] || '',
    calendarEmbedCode: row.row_data[CALENDAR_EMBED_KEY] || '',
  };
}

export type RepushProgress = {
  sent: number;
  failed: number;
  total: number;
};

export type RepushRowStatus = 'success' | 'failed';

export type RepushOptions = {
  onProgress?: (progress: RepushProgress) => void;
  onRowResult?: (rowId: string, status: RepushRowStatus) => void;
  skipWarmup?: boolean;
};

export type RepushResult = {
  sent: number;
  failed: number;
  total: number;
  paused: boolean;
  rowResults: Record<string, RepushRowStatus>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fire the CRM onboarding webhook for roster rows, one at a time,
 * with warmup + throttle + single-retry.
 */
export async function pushRosterRowsToGhl(
  agencyName: string,
  rows: RosterRepushRow[],
  options: RepushOptions = {}
): Promise<RepushResult> {
  const { data: agencyData } = await supabase
    .from('hierarchy_agencies')
    .select('zaps_paused')
    .eq('name', agencyName)
    .maybeSingle();

  const populated = rows.filter(isPopulated);
  const total = populated.length;
  const rowResults: Record<string, RepushRowStatus> = {};

  if (agencyData?.zaps_paused) {
    return { sent: 0, failed: 0, total, paused: true, rowResults };
  }

  options.onProgress?.({ sent: 0, failed: 0, total });

  if (total === 0) {
    return { sent: 0, failed: 0, total: 0, paused: false, rowResults };
  }

  if (!options.skipWarmup) {
    await warmUpCrmOnboardingWebhook();
    await sleep(WARMUP_SETTLE_MS);
  }

  let sent = 0;
  let failed = 0;
  const failedRows: RosterRepushRow[] = [];

  for (const row of populated) {
    const success = await fireCrmOnboardingWebhook(
      buildOnboardingPayload(row, agencyName)
    );
    if (success) {
      sent++;
      rowResults[row.id] = 'success';
      options.onRowResult?.(row.id, 'success');
    } else {
      failed++;
      failedRows.push(row);
      rowResults[row.id] = 'failed';
      options.onRowResult?.(row.id, 'failed');
    }
    options.onProgress?.({ sent, failed, total });
    await sleep(PER_ROW_DELAY_MS);
  }

  // Retry failed rows once with longer delay
  if (failedRows.length > 0) {
    await sleep(RETRY_INITIAL_DELAY_MS);
    for (const row of failedRows) {
      const success = await fireCrmOnboardingWebhook(
        buildOnboardingPayload(row, agencyName)
      );
      if (success) {
        sent++;
        failed--;
        rowResults[row.id] = 'success';
        options.onRowResult?.(row.id, 'success');
        options.onProgress?.({ sent, failed, total });
      }
      await sleep(RETRY_PER_ROW_DELAY_MS);
    }
  }

  return { sent, failed, total, paused: false, rowResults };
}
