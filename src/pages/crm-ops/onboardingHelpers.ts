/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
// @ts-nocheck
import { supabase } from '@/lib/crm/portal-client';
import type { CrmAgency } from '@/lib/crm/types';
import { UserCheck, Phone, Upload, Database } from 'lucide-react';

export const STEPS = [
  { key: 'csr', label: 'CSR Assignment', icon: UserCheck },
  { key: 'phone_setup', label: 'Phone & Subaccount Setup', icon: Phone },
  { key: 'roster', label: 'Agent Roster Upload', icon: Upload },
  { key: 'dba', label: 'DBA Client Roster Upload', icon: Database },
] as const;

export function getStepIndex(agency: CrmAgency): number {
  if (agency.onboarding_status === 'onboarding_complete') return 4;
  if (agency.onboarding_status === 'awaiting_dba_upload') return 3;
  if (agency.onboarding_status === 'awaiting_roster_upload') return 2;
  if (agency.onboarding_status === 'awaiting_agency_phone') return 1;
  return 0;
}

export function getStepState(
  stepIdx: number,
  currentIdx: number,
  agency: CrmAgency
): 'locked' | 'active' | 'awaiting' | 'complete' {
  if (stepIdx > currentIdx) return 'locked';
  if (stepIdx < currentIdx) return 'complete';

  if (stepIdx === 0) {
    if (agency.csr_confirmed) return 'complete';
    if (agency.assigned_csr?.trim()) return 'awaiting';
    return 'active';
  }
  if (stepIdx === 1) {
    const phoneAndSetupDone =
      agency.agency_phone?.trim() &&
      agency.setup_subaccount &&
      agency.setup_snapshot &&
      agency.setup_ghl_api &&
      agency.setup_zapier;
    if (phoneAndSetupDone) return 'complete';
    return 'active';
  }
  if (stepIdx === 2) {
    if (agency.roster_confirmed) return 'complete';
    return 'active';
  }
  if (stepIdx === 3) {
    if (agency.dba_confirmed) return 'complete';
    return 'active';
  }
  return 'active';
}

export async function deleteRosterData(agencyName: string) {
  const { data: uploads } = await supabase
    .from('crm_roster_uploads')
    .select('id')
    .eq('agency', agencyName);
  if (uploads) {
    for (const u of uploads) {
      await supabase.from('crm_roster').delete().eq('upload_id', u.id);
      await supabase.from('crm_roster_uploads').delete().eq('id', u.id);
    }
  }
}

export async function deleteDbaData(agencyName: string) {
  const { data: uploads } = await supabase
    .from('crm_dba_uploads')
    .select('id')
    .eq('agency', agencyName);
  if (uploads) {
    for (const u of uploads) {
      await supabase.from('crm_dba_rows').delete().eq('upload_id', u.id);
      await supabase.from('crm_dba_uploads').delete().eq('id', u.id);
    }
  }
}

export async function handleUndoStep(
  stepIdx: number,
  agency: CrmAgency
) {
  const now = new Date().toISOString();

  if (stepIdx === 0) {
    await deleteDbaData(agency.name);
    await deleteRosterData(agency.name);
    await supabase
      .from('hierarchy_agencies')
      .update({
        csr_confirmed: false,
        roster_confirmed: false,
        dba_confirmed: false,
        assigned_csr: null,
        agency_phone: null,
        crm_number: null,
        calendar_embed_code: null,
        agency_url_prefix: null,
        setup_subaccount: false,
        setup_snapshot: false,
        setup_ghl_api: false,
        setup_zapier: false,
        onboarding_status: 'pending_csr_assignment',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'test_undo',
      message: `[TEST] CSR assignment undone for ${agency.name} -- all steps reset`,
    });
  } else if (stepIdx === 1) {
    await deleteDbaData(agency.name);
    await deleteRosterData(agency.name);
    await supabase
      .from('hierarchy_agencies')
      .update({
        roster_confirmed: false,
        dba_confirmed: false,
        agency_phone: null,
        crm_number: null,
        calendar_embed_code: null,
        agency_url_prefix: null,
        setup_subaccount: false,
        setup_snapshot: false,
        setup_ghl_api: false,
        setup_zapier: false,
        onboarding_status: 'awaiting_agency_phone',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'test_undo',
      message: `[TEST] Phone & setup undone for ${agency.name} -- steps 2-4 reset`,
    });
  } else if (stepIdx === 2) {
    await deleteDbaData(agency.name);
    await deleteRosterData(agency.name);
    await supabase
      .from('hierarchy_agencies')
      .update({
        roster_confirmed: false,
        dba_confirmed: false,
        onboarding_status: 'awaiting_roster_upload',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'test_undo',
      message: `[TEST] Roster upload undone for ${agency.name} -- steps 3 & 4 reset`,
    });
  } else if (stepIdx === 3) {
    await deleteDbaData(agency.name);
    await supabase
      .from('hierarchy_agencies')
      .update({
        dba_confirmed: false,
        onboarding_status: 'awaiting_dba_upload',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'test_undo',
      message: `[TEST] DBA upload undone for ${agency.name} -- step 4 reset`,
    });
  }
}

export function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function padRosterTo200(
  uploadId: string,
  headers: string[],
  agencyFields?: { calendarEmbedCode?: string | null; agencyUrlPrefix?: string | null }
) {
  const { data: existingRows } = await supabase
    .from('crm_roster')
    .select('id, row_data')
    .eq('upload_id', uploadId);

  const numericRows = (existingRows || []).filter(
    (r) => /^\d+$/.test(r.row_data['Seat Number'] || '')
  );

  const occupiedSeats = new Set(numericRows.map((r) => Number(r.row_data['Seat Number'])));

  let crmNumber = '';
  const rowWithCrm = numericRows.find((r) => r.row_data['All Templates | Agent CRM #']?.trim());
  if (rowWithCrm) {
    crmNumber = rowWithCrm.row_data['All Templates | Agent CRM #'];
  }

  const calendarEmbed = agencyFields?.calendarEmbedCode?.trim() || '';
  const urlPrefix = agencyFields?.agencyUrlPrefix?.trim() || '';

  const emptyRow = (seat: number): Record<string, string> => {
    const row: Record<string, string> = {};
    for (const h of headers) row[h] = '';
    row['Seat Number'] = String(seat);
    if (crmNumber) row['All Templates | Agent CRM #'] = crmNumber;
    if (calendarEmbed) row['Calendar Embed Code'] = calendarEmbed;
    if (urlPrefix) {
      row['Digital Business Card Home Page'] = `${urlPrefix}.my-agent-appt.com/r${seat}-click-to-schedule`;
      row['Appt Booked Confirmation Page'] = `${urlPrefix}.my-agent-appt.com/r${seat}-youre-confirmed`;
    }
    return row;
  };

  const rowsToInsert: { upload_id: string; row_data: Record<string, string> }[] = [];
  for (let seat = 1; seat <= 200; seat++) {
    if (!occupiedSeats.has(seat)) {
      rowsToInsert.push({ upload_id: uploadId, row_data: emptyRow(seat) });
    }
  }

  if (crmNumber || calendarEmbed || urlPrefix) {
    const rowsNeedingUpdate = numericRows.filter(
      (r) => (crmNumber && !r.row_data['All Templates | Agent CRM #']?.trim()) ||
             (calendarEmbed && !r.row_data['Calendar Embed Code']?.trim()) ||
             (urlPrefix && !r.row_data['Digital Business Card Home Page']?.trim())
    );
    for (const row of rowsNeedingUpdate) {
      const seat = Number(row.row_data['Seat Number']);
      const updatedData: Record<string, string> = { ...row.row_data };
      if (crmNumber) updatedData['All Templates | Agent CRM #'] = crmNumber;
      if (calendarEmbed) updatedData['Calendar Embed Code'] = calendarEmbed;
      if (urlPrefix && seat) {
        updatedData['Digital Business Card Home Page'] = `${urlPrefix}.my-agent-appt.com/r${seat}-click-to-schedule`;
        updatedData['Appt Booked Confirmation Page'] = `${urlPrefix}.my-agent-appt.com/r${seat}-youre-confirmed`;
      }
      await supabase
        .from('crm_roster')
        .update({ row_data: updatedData })
        .eq('id', row.id);
    }
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    await supabase.from('crm_roster').insert(batch);
  }
}
