/**
 * CRM Onboard Automation — fired when the "Onboard to CRM" substep
 * is checked in the contracting pipeline detail modal.
 *
 * Flow:
 *   1. Look up the agent's agency roster upload
 *   2. Find the nearest open seat to seat #1
 *   3. Fill the roster seat with agent data
 *   4. Call crm-ghl-sync edge function (create GHL user + push custom values)
 *   5. Insert crm_pipeline card at 'processing' stage
 *   6. Mark agent as crm_onboarded on the portal agents table
 *
 * Charlie request (2026-08-27).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fireCrmGhlSync, type CrmGhlSyncResult } from '@/lib/crm/ghl-sync';

// The step ID for "Onboard to CRM" in agent_pipeline_stage_steps
export const CRM_ONBOARD_STEP_ID = '3a88c474-9631-4c09-a774-4ae808d9825c';

// Default profile images by gender (matches RosterTab convention)
const PROFILE_IMAGES = {
  Male: 'https://storage.googleapis.com/msgsndr/FEDr3fIGdMoLQ5xi6o8s/media/66e23a2ddb3cf5e29b18e5cd.png',
  Female: 'https://storage.googleapis.com/msgsndr/FEDr3fIGdMoLQ5xi6o8s/media/66e23a397010b93e3e7daffa.png',
  default: 'https://storage.googleapis.com/msgsndr/FEDr3fIGdMoLQ5xi6o8s/media/66e23a2ddb3cf5e29b18e5cd.png',
};

interface AgentPipelineRecord {
  id: string;
  agent_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  agency: string | null;
  agency_id: string | null;
  agent_id: string | null;
}

interface RosterRow {
  id: string;
  upload_id: string;
  row_data: Record<string, string>;
}

export interface CrmOnboardResult {
  success: boolean;
  seatNumber: string | null;
  ghlResult: CrmGhlSyncResult | null;
  pipelineCardId: string | null;
  errors: string[];
}

/**
 * Run the full CRM onboarding automation for an agent.
 *
 * @param portalSupabase - Portal DB client (akhojh)
 * @param record - The agent's pipeline record
 */
export async function runCrmOnboardAutomation(
  portalSupabase: SupabaseClient,
  record: AgentPipelineRecord,
): Promise<CrmOnboardResult> {
  const result: CrmOnboardResult = {
    success: false,
    seatNumber: null,
    ghlResult: null,
    pipelineCardId: null,
    errors: [],
  };

  const agencyName = record.agency;
  const agencyId = record.agency_id;

  if (!agencyName) {
    result.errors.push('Agent has no agency assigned — cannot onboard to CRM.');
    return result;
  }

  // ── 1. Find the agency's roster upload ──────────────────────────────────
  const { data: upload, error: uploadErr } = await portalSupabase
    .from('crm_roster_uploads')
    .select('id, agency')
    .eq('agency', agencyName)
    .maybeSingle();

  if (uploadErr || !upload) {
    result.errors.push(`No CRM roster found for agency "${agencyName}".`);
    return result;
  }

  // ── 2. Load all roster rows and find nearest open seat ──────────────────
  const { data: rosterRows, error: rosterErr } = await portalSupabase
    .from('crm_roster')
    .select('id, upload_id, row_data')
    .eq('upload_id', upload.id);

  if (rosterErr || !rosterRows) {
    result.errors.push('Failed to load roster data.');
    return result;
  }

  // Filter to rows with numeric seat numbers
  const numericRows = (rosterRows as RosterRow[]).filter(
    (r) => /^\d+$/.test(r.row_data['Seat Number'] || ''),
  );

  // Find open seats: no First Name AND not a CSR placeholder
  const openSeats = numericRows
    .filter(
      (r) =>
        !r.row_data['First Name']?.trim() &&
        r.row_data['CSR Placeholder'] !== 'true',
    )
    .sort(
      (a, b) =>
        Number(a.row_data['Seat Number']) - Number(b.row_data['Seat Number']),
    );

  // Get agency URL prefix for digital card URLs
  let urlPrefix = '';
  if (agencyId) {
    const { data: agencyData } = await portalSupabase
      .from('hierarchy_agencies')
      .select('agency_url_prefix')
      .eq('id', agencyId)
      .maybeSingle();
    urlPrefix = agencyData?.agency_url_prefix || '';
  } else {
    const { data: agencyData } = await portalSupabase
      .from('hierarchy_agencies')
      .select('agency_url_prefix')
      .eq('name', agencyName)
      .eq('is_active', true)
      .maybeSingle();
    urlPrefix = agencyData?.agency_url_prefix || '';
  }

  // Get agent's NPN from portal intake if available
  let agentNpn = '';
  if (record.agent_id) {
    const { data: intake } = await portalSupabase
      .from('agent_intake')
      .select('npn')
      .eq('agent_id', record.agent_id)
      .maybeSingle();
    agentNpn = intake?.npn || '';
  }

  const firstName = record.first_name || '';
  const lastName = record.last_name || '';
  const email = record.email || '';
  const phone = (record.phone || '').replace(/[^\d]/g, '');

  let seatNumber: string;
  let crmNumber = '';

  if (openSeats.length > 0) {
    // ── Fill existing open seat ──
    const openSeat = openSeats[0];
    seatNumber = openSeat.row_data['Seat Number'];
    crmNumber = openSeat.row_data['All Templates | Agent CRM #'] || '';

    const updatedRowData: Record<string, string> = {
      ...openSeat.row_data,
      'First Name': firstName,
      'Last Name': lastName,
      Email: email,
      Phone: phone,
      'Agent NPN': agentNpn,
      'All Templates | Agent Profile Image': PROFILE_IMAGES.default,
      'CSR Placeholder': '',
    };

    // Add digital card URLs if agency has a URL prefix
    if (urlPrefix) {
      updatedRowData['Digital Business Card Home Page'] =
        `${urlPrefix}/r${seatNumber}-click-to-schedule`;
      updatedRowData['Appt Booked Confirmation Page'] =
        `${urlPrefix}/r${seatNumber}-youre-confirmed`;
    }

    const { error: updateErr } = await portalSupabase
      .from('crm_roster')
      .update({ row_data: updatedRowData })
      .eq('id', openSeat.id);

    if (updateErr) {
      result.errors.push(`Failed to fill roster seat #${seatNumber}: ${updateErr.message}`);
      return result;
    }
  } else {
    // ── No open seats — create a new one ──
    const maxSeat = numericRows.reduce(
      (max, r) => Math.max(max, Number(r.row_data['Seat Number'])),
      0,
    );
    seatNumber = String(maxSeat + 1);

    // Build new row with all headers from existing rows
    const templateRow = numericRows[0]?.row_data || {};
    const newRowData: Record<string, string> = {};
    for (const h of Object.keys(templateRow)) newRowData[h] = '';

    newRowData['Seat Number'] = seatNumber;
    newRowData['First Name'] = firstName;
    newRowData['Last Name'] = lastName;
    newRowData['Email'] = email;
    newRowData['Phone'] = phone;
    newRowData['Agent NPN'] = agentNpn;
    newRowData['All Templates | Agent Profile Image'] = PROFILE_IMAGES.default;

    if (urlPrefix) {
      newRowData['Digital Business Card Home Page'] =
        `${urlPrefix}/r${seatNumber}-click-to-schedule`;
      newRowData['Appt Booked Confirmation Page'] =
        `${urlPrefix}/r${seatNumber}-youre-confirmed`;
    }

    const { error: insertErr } = await portalSupabase
      .from('crm_roster')
      .insert({ upload_id: upload.id, row_data: newRowData });

    if (insertErr) {
      result.errors.push(`Failed to create roster seat #${seatNumber}: ${insertErr.message}`);
      return result;
    }
  }

  result.seatNumber = seatNumber;

  // ── 3. Call crm-ghl-sync (create user + push custom values) ─────────────
  const digitalCardUrl = urlPrefix
    ? `${urlPrefix}/r${seatNumber}-click-to-schedule`
    : '';
  const confirmUrl = urlPrefix
    ? `${urlPrefix}/r${seatNumber}-youre-confirmed`
    : '';

  const ghlResult = await fireCrmGhlSync(
    {
      seatNumber,
      firstName,
      lastName,
      email,
      phone,
      agentNpn,
      profileImage: PROFILE_IMAGES.default,
      crmNumber,
      agency: agencyName,
      agencyId: agencyId || undefined,
      digitalBusinessCardUrl: digitalCardUrl,
      confirmationPageUrl: confirmUrl,
      calendarEmbedCode: '',
    },
    'onboard',
  );

  result.ghlResult = ghlResult;

  if (!ghlResult.success && !ghlResult.result?.customValuesPushed && !ghlResult.result?.userCreated) {
    result.errors.push(ghlResult.error || 'GHL sync failed completely.');
    // Continue anyway — roster seat is filled, pipeline card should still be created
  }

  // ── 4. Insert crm_pipeline card ─────────────────────────────────────────
  const { data: pipelineCard, error: pipelineErr } = await portalSupabase
    .from('crm_pipeline')
    .insert({
      agent_id: record.agent_id || null,
      agency: agencyName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      seat_number: seatNumber,
      crm_number: crmNumber,
      agent_npn: agentNpn,
      stage: 'processing',
    })
    .select('id')
    .maybeSingle();

  if (pipelineErr) {
    result.errors.push(`Failed to create CRM pipeline card: ${pipelineErr.message}`);
  } else {
    result.pipelineCardId = pipelineCard?.id || null;
  }

  // ── 5. Mark agent as CRM onboarded ─────────────────────────────────────
  if (record.agent_id) {
    await portalSupabase
      .from('agents')
      .update({ crm_onboarded: true, updated_at: new Date().toISOString() })
      .eq('id', record.agent_id);
  }

  result.success = result.errors.length === 0 || !!result.pipelineCardId;
  return result;
}
