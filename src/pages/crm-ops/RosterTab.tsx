/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
/**
 * @crm-team-protected
 *
 * DO NOT standardize agency names or apply crosswalk logic in this file.
 * DO NOT reference cc_agency_crosswalk or cleanDisplayName here.
 * CRM Team tab subtab — owns its own naming; see CrmTeam.tsx for context.
 */
// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Search,
  Undo2,
  Download,
  UserX,
  Zap,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { parseCSV } from '@/lib/crm/csv-parser';
import { fireCrmOnboardingWebhook } from '@/lib/crm/webhooks';
import { pushRosterRowsToGhl } from '@/lib/crm/roster-repush';
import { AgencyRosterCard } from '@/pages/crm-ops/AgencyRosterCard';
import { normalizeRosterRows } from '@/lib/crm/roster-normalizer';

const MALE_PROFILE_IMAGE = 'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_PROFILE_IMAGE = 'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

type RosterUpload = {
  id: string;
  file_name: string;
  row_count: number;
  headers: string[];
  uploaded_at: string;
  agency: string;
};

type RosterRow = {
  id: string;
  upload_id: string;
  row_data: Record<string, string>;
  created_at: string;
};

const PAGE_SIZE = 50;

export const RosterTab: React.FC = () => {
  const [agencyNames, setAgencyNames] = useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = useState('All');
  const [uploadsByAgency, setUploadsByAgency] = useState<Record<string, RosterUpload | null>>({});
  const [activeUpload, setActiveUpload] = useState<RosterUpload | null>(null);
  const [allRows, setAllRows] = useState<RosterRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploadingAgency, setUploadingAgency] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<RosterUpload | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [undoConfirmRow, setUndoConfirmRow] = useState<RosterRow | null>(null);
  const [undoSubmitting, setUndoSubmitting] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [terminateRow, setTerminateRow] = useState<RosterRow | null>(null);
  const [terminateSubmitting, setTerminateSubmitting] = useState(false);
  const [terminateError, setTerminateError] = useState('');
  const [populatedCounts, setPopulatedCounts] = useState<Record<string, number>>({});
  const [addAgentUpload, setAddAgentUpload] = useState<RosterUpload | null>(null);
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  useEffect(() => {
    loadUploads();
  }, []);

  useEffect(() => {
    if (activeUpload) {
      loadRows();
    }
  }, [activeUpload]);

  const loadUploads = async () => {
    setLoading(true);
    const [uploadsRes, agencyRes] = await Promise.all([
      supabase.from('crm_roster_uploads').select('*').order('uploaded_at', { ascending: false }),
      supabase.from('hierarchy_agencies').select('name').eq('is_active', true).eq('crm_enabled', true).order('name'),
    ]);

    const names = (agencyRes.data || []).map((a: { name: string }) => a.name);
    setAgencyNames(names);

    const byAgency: Record<string, RosterUpload | null> = {};
    for (const name of names) {
      byAgency[name] = null;
    }

    if (uploadsRes.data) {
      for (const upload of uploadsRes.data) {
        if (upload.agency && byAgency.hasOwnProperty(upload.agency)) {
          byAgency[upload.agency] = upload;
        }
      }
    }

    setUploadsByAgency(byAgency);
    setLoading(false);

    const uploadIds = Object.values(byAgency)
      .filter((u): u is RosterUpload => u !== null)
      .map((u) => u.id);

    if (uploadIds.length > 0) {
      const { data: rosterRows } = await supabase
        .from('crm_roster')
        .select('upload_id, row_data')
        .in('upload_id', uploadIds);

      if (rosterRows) {
        const counts: Record<string, number> = {};
        for (const name of names) {
          const upload = byAgency[name];
          if (!upload) continue;
          counts[name] = rosterRows.filter(
            (r) =>
              r.upload_id === upload.id &&
              r.row_data['First Name']?.trim()
          ).length;
        }
        setPopulatedCounts(counts);
      }
    }
  };

  const loadRows = async () => {
    if (!activeUpload) return;

    const { data } = await supabase
      .from('crm_roster')
      .select('*')
      .eq('upload_id', activeUpload.id);

    const sorted = (data || []).sort((a, b) => {
      const aNum = parseInt(a.row_data['Seat Number'] || '', 10);
      const bNum = parseInt(b.row_data['Seat Number'] || '', 10);
      if (isNaN(aNum) && isNaN(bNum)) return 0;
      if (isNaN(aNum)) return 1;
      if (isNaN(bNum)) return -1;
      return aNum - bNum;
    });
    setAllRows(sorted);
  };

  const padRosterTo200 = async (uploadId: string, headers: string[], agencyFields?: { calendarEmbedCode?: string | null; agencyUrlPrefix?: string | null }) => {
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
      for (const h of headers) {
        row[h] = '';
      }
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
  };

  const handleUpload = async (agency: string, file: File) => {
    setUploadingAgency(agency);

    try {
      const text = await file.text();
      const { rows: rawRows } = parseCSV(text);

      if (rawRows.length === 0) {
        alert('CSV file appears to be empty or invalid.');
        setUploadingAgency(null);
        return;
      }

      const { data: agencyRecord } = await supabase
        .from('hierarchy_agencies')
        .select('crm_number, csr_npn, calendar_embed_code, agency_url_prefix')
        .eq('name', agency)
        .maybeSingle();
      const crmNumber = agencyRecord?.crm_number || '';

      const { headers: canonicalHeaders, rows: normalizedRows } = normalizeRosterRows(rawRows, crmNumber, agencyRecord?.csr_npn || undefined);

      const existing = uploadsByAgency[agency];
      if (existing) {
        await supabase.from('crm_roster_uploads').delete().eq('id', existing.id);
      }

      const { data: uploadRecord, error: uploadError } = await supabase
        .from('crm_roster_uploads')
        .insert({
          file_name: file.name,
          row_count: normalizedRows.length,
          headers: canonicalHeaders,
          agency,
        })
        .select()
        .maybeSingle();

      if (uploadError || !uploadRecord) {
        throw uploadError || new Error('Failed to create upload record');
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        const batch = normalizedRows.slice(i, i + BATCH_SIZE).map((row) => ({
          upload_id: uploadRecord.id,
          row_data: row,
        }));

        const { error: insertError } = await supabase.from('crm_roster').insert(batch);
        if (insertError) throw insertError;
      }

      await padRosterTo200(uploadRecord.id, canonicalHeaders, {
        calendarEmbedCode: agencyRecord?.calendar_embed_code,
        agencyUrlPrefix: agencyRecord?.agency_url_prefix,
      });
      await loadUploads();
    } catch (err) {
      console.error(err);
      alert('Error uploading CSV. Please check the file and try again.');
    } finally {
      setUploadingAgency(null);
    }
  };

  const handleAddAgentOpen = (upload: RosterUpload) => {
    setAddAgentUpload(upload);
    setAddAgentOpen(true);
  };

  const handleAddAgentClose = () => {
    setAddAgentOpen(false);
    setAddAgentUpload(null);
  };

  const handleAddAgentSaved = async () => {
    await loadUploads();
    if (activeUpload && addAgentUpload && activeUpload.id === addAgentUpload.id) {
      await loadRows();
    }
    handleAddAgentClose();
  };

  const handleView = (upload: RosterUpload) => {
    setActiveUpload(upload);
    setPage(0);
    setSearchTerm('');
    setAllRows([]);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);

    const { error } = await supabase
      .from('crm_roster_uploads')
      .delete()
      .eq('id', deleteConfirm.id);

    if (!error) {
      if (activeUpload?.id === deleteConfirm.id) {
        setActiveUpload(null);
        setAllRows([]);
      }
      await loadUploads();
    }

    setDeleting(false);
    setDeleteConfirm(null);
  };

  const handleBack = () => {
    setActiveUpload(null);
    setAllRows([]);
    setSearchTerm('');
    setPage(0);
  };

  const handleRosterUndo = async () => {
    if (!undoConfirmRow || !activeUpload) return;
    setUndoSubmitting(true);
    setUndoError('');

    try {
      const clearedRowData = {
        ...undoConfirmRow.row_data,
        'First Name': '',
        'Last Name': '',
        'Phone': '',
        'phone': '',
        'Email': '',
        'email': '',
        'Agent NPN': '',
        'All Templates | Agent Profile Image': '',
      };

      const { error: updateError } = await supabase
        .from('crm_roster')
        .update({ row_data: clearedRowData })
        .eq('id', undoConfirmRow.id);

      if (updateError) {
        setUndoError('Failed to clear roster seat. Please try again.');
        setUndoSubmitting(false);
        return;
      }

      const agency = activeUpload.agency;
      const { data: matchingAgents } = await supabase
        .from('agents')
        .select('id, first_name, last_name')
        .eq('status', 'completed')
        .eq('agency', agency);

      const testerAgents = (matchingAgents || []).filter(
        (a) => a.first_name.toLowerCase() === 'tester' && a.last_name.toLowerCase() === 'mitchell'
      );

      for (const agent of testerAgents) {
        await supabase
          .from('agents')
          .update({ crm_onboarded: false })
          .eq('id', agent.id);
      }

      await loadRows();
      setUndoSubmitting(false);
      setUndoConfirmRow(null);
    } catch {
      setUndoError('An unexpected error occurred. Please try again.');
      setUndoSubmitting(false);
    }
  };

  const handleRosterTerminate = async () => {
    if (!terminateRow || !activeUpload) return;
    setTerminateSubmitting(true);
    setTerminateError('');

    try {
      const firstName = terminateRow.row_data['First Name'] || '';
      const lastName = terminateRow.row_data['Last Name'] || '';
      const email = terminateRow.row_data['Email'] || '';
      const agency = activeUpload.agency;

      const { data: agencyData } = await supabase
        .from('hierarchy_agencies')
        .select('csr_can_fill_seat, csr_first_name, csr_last_name, csr_phone, csr_email, csr_npn, csr_gender, zaps_paused')
        .eq('name', agency)
        .maybeSingle();

      const csrCanFill = agencyData?.csr_can_fill_seat && agencyData?.csr_npn?.trim();

      if (csrCanFill) {
        const csrProfileImage = agencyData.csr_gender === 'Male' ? MALE_PROFILE_IMAGE : agencyData.csr_gender === 'Female' ? FEMALE_PROFILE_IMAGE : '';
        const csrRowData = {
          ...terminateRow.row_data,
          'First Name': agencyData.csr_first_name || '',
          'Last Name': agencyData.csr_last_name || '',
          'Phone': agencyData.csr_phone || '',
          'phone': agencyData.csr_phone || '',
          'Email': agencyData.csr_email || '',
          'email': agencyData.csr_email || '',
          'Agent NPN': agencyData.csr_npn || '',
          'All Templates | Agent Profile Image': csrProfileImage,
          'CSR Placeholder': 'true',
        };

        const { error: updateError } = await supabase
          .from('crm_roster')
          .update({ row_data: csrRowData })
          .eq('id', terminateRow.id);

        if (updateError) {
          setTerminateError('Failed to update roster seat with CSR. Please try again.');
          setTerminateSubmitting(false);
          return;
        }

        if (!agencyData.zaps_paused) {
          const crmNumber = terminateRow.row_data['All Templates | Agent CRM #'] || '';
          await fireCrmOnboardingWebhook({
            seatNumber: terminateRow.row_data['Seat Number'] || '',
            agentNpn: agencyData.csr_npn || '',
            firstName: agencyData.csr_first_name || '',
            lastName: agencyData.csr_last_name || '',
            email: agencyData.csr_email || '',
            phone: agencyData.csr_phone || '',
            profileImage: csrProfileImage,
            crmNumber,
            agency,
          });
        }
      } else {
        const clearedRowData = {
          ...terminateRow.row_data,
          'First Name': '',
          'Last Name': '',
          'Phone': '',
          'phone': '',
          'Email': '',
          'email': '',
          'Agent NPN': '',
          'All Templates | Agent Profile Image': '',
          'CSR Placeholder': '',
        };

        const { error: updateError } = await supabase
          .from('crm_roster')
          .update({ row_data: clearedRowData })
          .eq('id', terminateRow.id);

        if (updateError) {
          setTerminateError('Failed to clear roster seat. Please try again.');
          setTerminateSubmitting(false);
          return;
        }
      }

      const now = new Date().toISOString();

      const { data: matchingAgents } = await supabase
        .from('agents')
        .select('id')
        .eq('status', 'completed')
        .eq('agency', agency)
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .ilike('email', email);

      if (matchingAgents && matchingAgents.length > 0) {
        for (const agent of matchingAgents) {
          await supabase
            .from('agents')
            .update({ status: 'terminated', crm_onboarded: false, terminated_at: now, updated_at: now })
            .eq('id', agent.id);

          await supabase
            .from('crm_pipeline')
            .update({ terminated_at: now, updated_at: now })
            .eq('agent_id', agent.id);
        }
      }

      const agentNpn = terminateRow.row_data['Agent NPN'] || '';
      await supabase.from('crm_termination_log').insert({
        agent_name: `${firstName} ${lastName}`.trim(),
        agent_npn: agentNpn,
        status: 'terminated',
        agency,
        terminated_at: now,
      });

      await loadRows();
      setTerminateSubmitting(false);
      setTerminateRow(null);
    } catch {
      setTerminateError('An unexpected error occurred. Please try again.');
      setTerminateSubmitting(false);
    }
  };

  const filteredRows = searchTerm
    ? allRows.filter((row) =>
        Object.values(row.row_data).some((val) =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : allRows;

  const totalRows = filteredRows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const paginatedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const visibleAgencies = agencyFilter === 'All'
    ? agencyNames
    : agencyNames.filter((a) => a === agencyFilter);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 glass rounded-xl p-1.5">
          {[...Array(4)].map((_, i) => <div key={i} className="h-8 w-24 bg-secondary rounded-lg animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-card rounded-2xl border border-border animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {!activeUpload && (
        <div className="flex items-center gap-2 mb-5">
          {['All', ...agencyNames].map((a) => (
            <button
              key={a}
              onClick={() => setAgencyFilter(a)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                agencyFilter === a
                  ? 'gradient-primary text-background'
                  : 'bg-card text-muted-foreground border border-border hover:bg-muted'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {!activeUpload ? (
        <div className={`grid gap-6 ${visibleAgencies.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-1 md:grid-cols-3'}`}>
          {visibleAgencies.map((agency) => (
            <AgencyRosterCard
              key={agency}
              agency={agency}
              upload={uploadsByAgency[agency]}
              uploading={uploadingAgency === agency}
              populatedCount={populatedCounts[agency]}
              onUpload={handleUpload}
              onView={handleView}
              onDelete={setDeleteConfirm}
              onAddAgent={uploadsByAgency[agency] ? () => handleAddAgentOpen(uploadsByAgency[agency]!) : undefined}
            />
          ))}
        </div>
      ) : (
        <RosterTableView
          upload={activeUpload}
          rows={paginatedRows}
          allRows={allRows}
          totalRows={totalRows}
          totalPages={totalPages}
          page={page}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onPageChange={setPage}
          onBack={handleBack}
          onUndo={(row) => { setUndoError(''); setUndoConfirmRow(row); }}
          onTerminate={(row) => { setTerminateError(''); setTerminateRow(row); }}
          onAddAgent={() => handleAddAgentOpen(activeUpload)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full animate-in fade-in">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-red-400">Delete Upload</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                This will permanently delete{' '}
                <span className="font-semibold">{deleteConfirm.file_name}</span> and all{' '}
                <span className="font-semibold">{deleteConfirm.row_count.toLocaleString()}</span>{' '}
                associated records for{' '}
                <span className="font-semibold">{deleteConfirm.agency}</span>.
              </p>
              <p className="text-muted-foreground text-sm mt-2">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {undoConfirmRow && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full animate-in fade-in">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-orange-400">Undo CRM Seat</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                This will clear the agent data from seat <span className="font-semibold">#{undoConfirmRow.row_data['Seat Number']}</span> for{' '}
                <span className="font-semibold">{undoConfirmRow.row_data['First Name']} {undoConfirmRow.row_data['Last Name']}</span> and
                allow re-onboarding.
              </p>
              <p className="text-muted-foreground text-sm mt-2">This is a test-only action.</p>
              {undoError && (
                <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{undoError}</p>
              )}
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => { setUndoConfirmRow(null); setUndoError(''); }}
                disabled={undoSubmitting}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRosterUndo}
                disabled={undoSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500/100/100 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {undoSubmitting ? 'Clearing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {terminateRow && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full animate-in fade-in">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-red-400">Terminate Agent</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                This will terminate <span className="font-semibold">{terminateRow.row_data['First Name']} {terminateRow.row_data['Last Name']}</span>,
                clear seat <span className="font-semibold">#{terminateRow.row_data['Seat Number']}</span> from the{' '}
                <span className="font-semibold">{activeUpload?.agency}</span> CRM roster,
                and mark them as terminated.
              </p>
              <p className="text-muted-foreground text-sm mt-2">This action cannot be undone.</p>
              {terminateError && (
                <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{terminateError}</p>
              )}
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => { setTerminateRow(null); setTerminateError(''); }}
                disabled={terminateSubmitting}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRosterTerminate}
                disabled={terminateSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {terminateSubmitting ? 'Terminating...' : 'Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {addAgentOpen && addAgentUpload && (
        <AddAgentModal
          upload={addAgentUpload}
          onClose={handleAddAgentClose}
          onSaved={handleAddAgentSaved}
        />
      )}
    </>
  );
};

// ── AddAgentModal ─────────────────────────────────────────────────────────────

interface AddAgentModalProps {
  upload: RosterUpload;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const AddAgentModal: React.FC<AddAgentModalProps> = ({ upload, onClose, onSaved }) => {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    agentNpn: '',
    gender: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const profileImage = form.gender === 'Male'
    ? MALE_PROFILE_IMAGE
    : form.gender === 'Female'
    ? FEMALE_PROFILE_IMAGE
    : '';

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { setError('First name is required.'); return; }
    if (!form.lastName.trim()) { setError('Last name is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!form.phone.trim()) { setError('Phone is required.'); return; }
    if (!form.agentNpn.trim()) { setError('Agent NPN is required.'); return; }
    if (!form.gender) { setError('Gender is required to assign a profile image.'); return; }

    setSubmitting(true);
    setError('');

    try {
      const { data: existingRows } = await supabase
        .from('crm_roster')
        .select('id, row_data')
        .eq('upload_id', upload.id);

      const numericRows = (existingRows || []).filter(
        (r) => /^\d+$/.test(r.row_data['Seat Number'] || '')
      );

      const crmNumber = numericRows.find((r) => r.row_data['All Templates | Agent CRM #']?.trim())
        ?.row_data['All Templates | Agent CRM #'] || '';
      const calendarEmbed = numericRows.find((r) => r.row_data['Calendar Embed Code']?.trim())
        ?.row_data['Calendar Embed Code'] || '';
      const urlPrefix = (() => {
        const sample = numericRows.find((r) => r.row_data['Digital Business Card Home Page']?.trim());
        if (!sample) return '';
        return sample.row_data['Digital Business Card Home Page'].replace(/\/r\d+-.*$/, '');
      })();

      const openSeat = numericRows
        .filter((r) => !r.row_data['First Name']?.trim() && r.row_data['CSR Placeholder'] !== 'true')
        .sort((a, b) => Number(a.row_data['Seat Number']) - Number(b.row_data['Seat Number']))[0];

      let seatNumber: string;

      if (openSeat) {
        seatNumber = openSeat.row_data['Seat Number'];
        const updatedRowData: Record<string, string> = {
          ...openSeat.row_data,
          'First Name': form.firstName.trim(),
          'Last Name': form.lastName.trim(),
          'Email': form.email.trim(),
          'Phone': form.phone.trim(),
          'Agent NPN': form.agentNpn.trim(),
          'All Templates | Agent Profile Image': profileImage,
          'CSR Placeholder': '',
        };
        const { error: updateError } = await supabase
          .from('crm_roster')
          .update({ row_data: updatedRowData })
          .eq('id', openSeat.id);
        if (updateError) throw new Error('Failed to update roster seat.');
      } else {
        const maxSeat = numericRows.reduce((max, r) => Math.max(max, Number(r.row_data['Seat Number'])), 0);
        seatNumber = String(maxSeat + 1);
        const newRowData: Record<string, string> = {};
        for (const h of upload.headers) newRowData[h] = '';
        newRowData['Seat Number'] = seatNumber;
        newRowData['First Name'] = form.firstName.trim();
        newRowData['Last Name'] = form.lastName.trim();
        newRowData['Email'] = form.email.trim();
        newRowData['Phone'] = form.phone.trim();
        newRowData['Agent NPN'] = form.agentNpn.trim();
        newRowData['All Templates | Agent Profile Image'] = profileImage;
        newRowData['All Templates | Agent CRM #'] = crmNumber;
        if (calendarEmbed) newRowData['Calendar Embed Code'] = calendarEmbed;
        if (urlPrefix) {
          newRowData['Digital Business Card Home Page'] = `${urlPrefix}/r${seatNumber}-click-to-schedule`;
          newRowData['Appt Booked Confirmation Page'] = `${urlPrefix}/r${seatNumber}-youre-confirmed`;
        }
        const { error: insertError } = await supabase
          .from('crm_roster')
          .insert({ upload_id: upload.id, row_data: newRowData });
        if (insertError) throw new Error('Failed to create roster seat.');
      }

      const { data: agencyData } = await supabase
        .from('crm_agencies')
        .select('zaps_paused, calendar_embed_code, agency_url_prefix')
        .eq('name', upload.agency)
        .maybeSingle();

      if (!agencyData?.zaps_paused) {
        const seatNum = Number(seatNumber);
        const digitalCardUrl = urlPrefix ? `${urlPrefix}/r${seatNum}-click-to-schedule` : '';
        const confirmUrl = urlPrefix ? `${urlPrefix}/r${seatNum}-youre-confirmed` : '';
        await fireCrmOnboardingWebhook({
          seatNumber,
          agentNpn: form.agentNpn.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          profileImage,
          crmNumber,
          agency: upload.agency,
          digitalBusinessCardUrl: digitalCardUrl,
          confirmationPageUrl: confirmUrl,
          calendarEmbedCode: calendarEmbed || agencyData?.calendar_embed_code || '',
        });
      }

      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-none max-w-lg w-full animate-in fade-in">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Add Agent to Roster</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{upload.agency} — next open seat</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">First Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.firstName} onChange={(e) => handleChange('firstName', e.target.value)} placeholder="Jane" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:ring-2 focus:ring-ring focus:border-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Last Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.lastName} onChange={(e) => handleChange('lastName', e.target.value)} placeholder="Smith" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:ring-2 focus:ring-ring focus:border-ring" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="jane.smith@email.com" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:ring-2 focus:ring-ring focus:border-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Phone <span className="text-red-500">*</span></label>
            <input type="tel" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="5551234567" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:ring-2 focus:ring-ring focus:border-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Agent NPN <span className="text-red-500">*</span></label>
            <input type="text" value={form.agentNpn} onChange={(e) => handleChange('agentNpn', e.target.value)} placeholder="12345678" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:ring-2 focus:ring-ring focus:border-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-2">Gender <span className="text-red-500">*</span> <span className="text-muted-foreground font-normal">(sets profile image)</span></label>
            <div className="flex gap-3">
              {(['Male', 'Female'] as const).map((g) => (
                <button key={g} type="button" onClick={() => handleChange('gender', g)}
                  className={`flex-1 py-2 text-sm font-medium border-2 rounded-lg transition-colors ${
                    form.gender === g ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted'
                  }`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Adding...</>
            ) : (
              <><UserPlus className="w-4 h-4" />Add Agent</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RosterTableViewProps {
  upload: RosterUpload;
  rows: RosterRow[];
  allRows: RosterRow[];
  totalRows: number;
  totalPages: number;
  page: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onPageChange: (page: number) => void;
  onBack: () => void;
  onUndo: (row: RosterRow) => void;
  onTerminate: (row: RosterRow) => void;
  onAddAgent: () => void;
}

const escapeCSVField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const RosterTableView: React.FC<RosterTableViewProps> = ({
  upload,
  rows,
  allRows,
  totalRows,
  totalPages,
  page,
  searchTerm,
  onSearchChange,
  onPageChange,
  onBack,
  onUndo,
  onTerminate,
  onAddAgent,
}) => {
  const [zapConfirmOpen, setZapConfirmOpen] = useState(false);
  const [zapSending, setZapSending] = useState(false);
  const [zapProgress, setZapProgress] = useState({ sent: 0, total: 0, failed: 0 });
  const [zapResult, setZapResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [rowZapSending, setRowZapSending] = useState<string | null>(null);
  const [rowZapResults, setRowZapResults] = useState<Record<string, 'success' | 'failed' | 'paused'>>({});

  const AGENCY_COLORS: Record<string, string> = {
    FYM: 'text-primary',
    Wisechoice: 'text-emerald-400',
    Aspire: 'text-amber-400',
  };

  const populatedRows = allRows.filter((row) => row.row_data['First Name']?.trim());

  const handleFireToZap = async () => {
    setZapConfirmOpen(false);
    setZapSending(true);
    setZapResult(null);

    const total = populatedRows.length;
    setZapProgress({ sent: 0, total, failed: 0 });

    const result = await pushRosterRowsToGhl(upload.agency, populatedRows, {
      onProgress: ({ sent, failed, total: t }) => setZapProgress({ sent, failed, total: t }),
    });

    setZapSending(false);
    if (result.paused) {
      setZapResult({ sent: 0, failed: 0, total });
      return;
    }
    setZapResult({ sent: result.sent, failed: result.failed, total: result.total });
  };

  const handleFireRowToZap = async (row: RosterRow) => {
    setRowZapSending(row.id);

    // Single-row fire: skip warmup/throttle, reuse shared payload + paused guard.
    const result = await pushRosterRowsToGhl(upload.agency, [row], { skipWarmup: true });

    if (result.paused) {
      setRowZapResults((prev) => ({ ...prev, [row.id]: 'paused' }));
    } else {
      const status = result.rowResults[row.id] === 'success' ? 'success' : 'failed';
      setRowZapResults((prev) => ({ ...prev, [row.id]: status }));
    }
    setRowZapSending(null);
  };

  const handleExport = () => {
    const headers = upload.headers;
    const csvHeader = headers.map(escapeCSVField).join(',');
    const csvRows = allRows.map((row) =>
      headers.map((h) => escapeCSVField(row.row_data[h] || '')).join(',')
    );
    const csvContent = [csvHeader, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${upload.agency}_roster_export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-muted-foreground" />
            <div>
              <h2 className={`text-xl font-bold ${AGENCY_COLORS[upload.agency] || 'text-foreground'}`}>
                {upload.agency} CRM Roster
              </h2>

              <p className="text-sm text-muted-foreground">
                {upload.file_name} -- {totalRows.toLocaleString()} records
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onAddAgent}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Agent
          </button>
          <button
            onClick={() => { setZapResult(null); setZapConfirmOpen(true); }}
            disabled={zapSending || populatedRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500/100 rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="w-4 h-4" />
            {zapSending
              ? `Sending ${zapProgress.sent}/${zapProgress.total}...`
              : `Send to Zap (${populatedRows.length})`}
          </button>
          <button
            onClick={handleExport}
            disabled={allRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {zapSending && zapProgress.total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
            <span>Sending {zapProgress.sent + zapProgress.failed} of {zapProgress.total}...</span>
            <span className="tabular-nums font-medium">
              {Math.round(((zapProgress.sent + zapProgress.failed) / zapProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full h-3 bg-secondary/80 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${((zapProgress.sent + zapProgress.failed) / zapProgress.total) * 100}%`,
                background: zapProgress.failed > 0
                  ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                  : 'linear-gradient(90deg, #f59e0b, #22c55e)',
              }}
            />
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <span className="text-emerald-400 font-medium">{zapProgress.sent} sent</span>
            {zapProgress.failed > 0 && (
              <span className="text-red-400 font-medium">{zapProgress.failed} failed</span>
            )}
          </div>
        </div>
      )}

      {zapResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          zapResult.failed === 0 && zapResult.sent > 0
            ? 'bg-emerald-500/10 text-emerald-400 border border-green-500/20'
            : zapResult.sent === 0
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        }`}>
          {zapResult.sent === 0 && zapResult.failed === 0
            ? 'Zaps are paused for this agency. No rows were sent.'
            : `Sent ${zapResult.sent} of ${zapResult.total} agents to Zap.${zapResult.failed > 0 ? ` ${zapResult.failed} failed.` : ''}`}
          <button onClick={() => setZapResult(null)} className="ml-3 underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {zapConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full animate-in fade-in">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-amber-400">Send Roster to Zap</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                This will send <span className="font-semibold">{populatedRows.length}</span> populated agent rows
                to the onboarding Zap for <span className="font-semibold">{upload.agency}</span>, one at a time.
              </p>
              <p className="text-muted-foreground text-sm mt-2">Each row includes: Seat Number, First Name, Last Name, Email, Phone, Agent NPN, Profile Image, and CRM Number.</p>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setZapConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFireToZap}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500/100 rounded-lg hover:bg-amber-500 transition-colors"
              >
                Send All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-lg shadow-none border border-border p-4 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search across all columns..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
            />
          </div>
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {totalRows.toLocaleString()} total records
          </p>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-none border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                  #
                </th>
                {upload.headers.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={upload.headers.length + 2}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {searchTerm ? 'No matching records found.' : 'No data available.'}
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.id} className={`transition-colors ${row.row_data['CSR Placeholder'] === 'true' ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'hover:bg-muted'}`}>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {page * PAGE_SIZE + idx + 1}
                    </td>
                    {upload.headers.map((header) => (
                      <td
                        key={header}
                        className="px-4 py-3 text-sm text-foreground whitespace-nowrap max-w-[250px] truncate"
                        title={row.row_data[header] || ''}
                      >
                        {header === 'First Name' && row.row_data['CSR Placeholder'] === 'true' ? (
                          <span className="flex items-center gap-1.5">
                            {row.row_data[header] || ''}
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-400 rounded">
                              CSR
                            </span>
                          </span>
                        ) : (
                          row.row_data[header] || ''
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {row.row_data['First Name']?.trim() && (
                          <div className="relative group/zap">
                            <button
                              onClick={() => handleFireRowToZap(row)}
                              disabled={rowZapSending === row.id || zapSending}
                              className={`p-1.5 rounded transition-colors ${
                                rowZapResults[row.id] === 'success'
                                  ? 'text-green-500 bg-emerald-500/10'
                                  : rowZapResults[row.id] === 'failed'
                                  ? 'text-red-500 bg-red-500/10'
                                  : rowZapResults[row.id] === 'paused'
                                  ? 'text-muted-foreground bg-muted'
                                  : 'text-amber-500 hover:bg-amber-500/10'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                              aria-label="Send row to Zap"
                            >
                              <Zap className={`w-4 h-4 ${rowZapSending === row.id ? 'animate-pulse' : ''}`} />
                            </button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-popover rounded whitespace-nowrap opacity-0 group-hover/zap:opacity-100 transition-opacity pointer-events-none">
                              {rowZapResults[row.id] === 'success' ? 'Sent' : rowZapResults[row.id] === 'failed' ? 'Failed - Click to retry' : rowZapResults[row.id] === 'paused' ? 'Zaps paused' : 'Send to Zap'}
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </div>
                        )}
                        {row.row_data['First Name']?.toLowerCase() === 'tester' &&
                         row.row_data['Last Name']?.toLowerCase() === 'mitchell' && (
                          <div className="relative group/undo">
                            <button
                              onClick={() => onUndo(row)}
                              className="p-1.5 text-orange-500 hover:bg-amber-500/20 rounded transition-colors"
                              aria-label="Undo CRM seat"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-popover rounded whitespace-nowrap opacity-0 group-hover/undo:opacity-100 transition-opacity pointer-events-none">
                              Undo CRM (Test Only)
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </div>
                        )}
                        {row.row_data['First Name']?.trim() && (
                          <div className="relative group/terminate">
                            <button
                              onClick={() => onTerminate(row)}
                              className="p-1.5 text-red-500 hover:bg-red-500/20 rounded transition-colors"
                              aria-label="Terminate agent"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-popover rounded whitespace-nowrap opacity-0 group-hover/terminate:opacity-100 transition-opacity pointer-events-none">
                              Terminate Agent
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(Math.max(0, page - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
