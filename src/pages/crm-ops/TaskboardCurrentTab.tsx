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
import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  Building2,
  Send,
  ChevronDown,
  Tag,
  User,
  ArrowLeft,
  MessageSquareText,
  FileText,
  ChevronRight,
  XCircle,
  FileDown,
  Calendar,
  UserCheck,
  Package,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { fireCrmOnboardingWebhook } from '@/lib/crm/webhooks';
import type { CrmTicket, CrmTicketMessage } from '@/lib/crm/types';

interface TicketWithAgency extends CrmTicket {
  agency_name: string;
}

interface PendingCancellationUpload {
  id: string;
  agency_id: string;
  agency_name: string;
  file_name: string;
  row_count: number;
  created_at: string;
}

interface CancellationRow {
  first_name: string;
  last_name: string;
  phone: string;
  tag: string;
}


const STATUS_COLUMNS: { key: CrmTicket['status']; label: string; color: string; headerBg: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'open', label: 'Open', color: 'border-blue-500/20', headerBg: 'bg-cyan-500/10', icon: AlertCircle },
  { key: 'in-progress', label: 'In Progress', color: 'border-amber-500/20', headerBg: 'bg-amber-500/10', icon: Loader2 },
  { key: 'resolved', label: 'Resolved', color: 'border-emerald-500/20', headerBg: 'bg-emerald-500/10', icon: CheckCircle2 },
];

const PRIORITY_CONFIG: Record<string, { label: string; dot: string }> = {
  low: { label: 'Low', dot: 'bg-muted-foreground' },
  normal: { label: 'Normal', dot: 'bg-cyan-500/100' },
  high: { label: 'High', dot: 'bg-red-500/100' },
};

const CATEGORY_LABELS: Record<string, string> = {
  'agent-issue': 'Agent Issue',
  'crm-issue': 'CRM Issue',
  billing: 'Billing',
  other: 'Other',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const TaskboardCurrentTab: React.FC = () => {
  const [tickets, setTickets] = useState<TicketWithAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketWithAgency | null>(null);

  const loadTickets = useCallback(async () => {
    const { data } = await supabase
      .from('crm_tickets')
      .select('*, hierarchy_agencies!inner(name)')
      .in('status', ['open', 'in-progress', 'resolved'])
      .order('created_at', { ascending: false });

    const mapped: TicketWithAgency[] = (data || []).map((row: any) => ({
      ...row,
      agency_name: row.hierarchy_agencies?.name || 'Unknown',
      hierarchy_agencies: undefined,
    }));
    setTickets(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const handleStatusChange = async (ticketId: string, newStatus: CrmTicket['status']) => {
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'resolved') updates.resolved_at = new Date().toISOString();

    await supabase.from('crm_tickets').update(updates).eq('id', ticketId);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-card rounded-2xl border border-border animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (selectedTicket) {
    return (
      <TicketDetailPanel
        ticket={selectedTicket}
        onBack={() => { setSelectedTicket(null); loadTickets(); }}
        onStatusChange={handleStatusChange}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SpecialistChangeRequestsSection />
      <CancellationApprovalsSection />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-muted-foreground">Support Tickets</h2>
          <p className="text-sm text-muted-foreground">{tickets.length} active ticket{tickets.length !== 1 ? 's' : ''} across all agencies</p>
        </div>
        <button
          onClick={loadTickets}
          className="text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {STATUS_COLUMNS.map(col => {
          const colTickets = tickets.filter(t => t.status === col.key);
          const Icon = col.icon;
          return (
            <div key={col.key} className={`rounded-2xl border ${col.color} bg-card/50 min-h-[400px] shadow-none`}>
              <div className={`px-4 py-3 border-b ${col.color} flex items-center gap-2 rounded-t-2xl ${col.headerBg}`}>
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">{col.label}</span>
                <span className="ml-auto text-[11px] font-bold text-muted-foreground bg-card/80 px-2 py-0.5 rounded-full shadow-none">
                  {colTickets.length}
                </span>
              </div>
              <div className="p-3 space-y-3">
                {colTickets.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No tickets</p>
                )}
                {colTickets.map(ticket => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => setSelectedTicket(ticket)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface SpecialistRequest {
  id: string;
  agency_id: string;
  agency_name: string;
  product_number: number;
  product_name: string;
  requested_full_name: string;
  requested_mobile: string;
  status: 'pending' | 'calendar_added' | 'confirmed';
  submitted_by: string;
  created_at: string;
}

const SpecialistChangeRequestsSection: React.FC = () => {
  const [requests, setRequests] = useState<SpecialistRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('specialist_change_requests')
      .select('*, hierarchy_agencies!inner(name)')
      .in('status', ['pending', 'calendar_added'])
      .order('created_at', { ascending: false });

    const mapped: SpecialistRequest[] = [];
    for (const row of data || []) {
      const { data: productData } = await supabase
        .from('crm_agency_cross_sell')
        .select('product_name')
        .eq('agency_id', row.agency_id)
        .eq('product_number', row.product_number)
        .maybeSingle();

      mapped.push({
        id: row.id,
        agency_id: row.agency_id,
        agency_name: (row as any).hierarchy_agencies?.name || 'Unknown',
        product_number: row.product_number,
        product_name: productData?.product_name || `Product #${row.product_number}`,
        requested_full_name: row.requested_full_name,
        requested_mobile: row.requested_mobile,
        status: row.status,
        submitted_by: row.submitted_by,
        created_at: row.created_at,
      });
    }
    setRequests(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleCalendarAdded = async (req: SpecialistRequest) => {
    setProcessing(req.id);
    await supabase
      .from('specialist_change_requests')
      .update({ status: 'calendar_added', calendar_added_at: new Date().toISOString() })
      .eq('id', req.id);
    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'calendar_added' as const } : r));
    setProcessing(null);
  };

  const handleConfirm = async (req: SpecialistRequest) => {
    setProcessing(req.id);
    const now = new Date().toISOString();

    await supabase
      .from('specialist_change_requests')
      .update({ status: 'confirmed', confirmed_at: now })
      .eq('id', req.id);

    const { data: existing } = await supabase
      .from('crm_agency_cross_sell')
      .select('fields')
      .eq('agency_id', req.agency_id)
      .eq('product_number', req.product_number)
      .maybeSingle();

    if (existing) {
      const updatedFields = {
        ...(existing.fields as Record<string, string>),
        specialist_full_name: req.requested_full_name,
        specialist_mobile: req.requested_mobile,
      };
      await supabase
        .from('crm_agency_cross_sell')
        .update({ fields: updatedFields, updated_at: now })
        .eq('agency_id', req.agency_id)
        .eq('product_number', req.product_number);
    }

    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    setProcessing(null);
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const calendarCount = requests.filter((r) => r.status === 'calendar_added').length;

  if (loading && requests.length === 0) return null;
  if (requests.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-none overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted transition-colors text-left"
      >
        <Package className="w-5 h-5 text-emerald-400" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Specialist Change Requests</h3>
          <p className="text-xs text-muted-foreground">
            {pendingCount} pending, {calendarCount} awaiting confirmation
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>

      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/50">
          {requests.map((req) => (
            <div key={req.id} className="px-5 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground">{req.agency_name}</span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    Product #{req.product_number}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">{req.product_name}</span> -- Change specialist to{' '}
                  <span className="font-semibold text-foreground">{req.requested_full_name}</span>{' '}
                  <span className="text-muted-foreground">({req.requested_mobile})</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Submitted by {req.submitted_by} -- {timeAgo(req.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {req.status === 'pending' && (
                  <button
                    onClick={() => handleCalendarAdded(req)}
                    disabled={processing === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Calendar Added
                  </button>
                )}
                {req.status === 'calendar_added' && (
                  <button
                    onClick={() => handleConfirm(req)}
                    disabled={processing === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Confirm Change
                  </button>
                )}
                {processing === req.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CancellationApprovalsSection: React.FC = () => {
  const [pending, setPending] = useState<PendingCancellationUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [previewUploadId, setPreviewUploadId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<CancellationRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingUpload, setRejectingUpload] = useState<PendingCancellationUpload | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const loadPending = useCallback(async () => {
    const { data } = await supabase
      .from('agency_cancellation_uploads')
      .select('id, agency_id, file_name, row_count, created_at, hierarchy_agencies!inner(name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    const mapped: PendingCancellationUpload[] = (data || []).map((row: any) => ({
      id: row.id,
      agency_id: row.agency_id,
      agency_name: row.hierarchy_agencies?.name || 'Unknown',
      file_name: row.file_name,
      row_count: row.row_count,
      created_at: row.created_at,
    }));
    setPending(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const loadPreview = async (uploadId: string) => {
    if (previewUploadId === uploadId) {
      setPreviewUploadId(null);
      return;
    }
    setPreviewUploadId(uploadId);
    setLoadingPreview(true);
    const { data } = await supabase
      .from('agency_cancellations')
      .select('first_name, last_name, phone, tag')
      .eq('upload_id', uploadId)
      .limit(10);
    setPreviewRows((data as CancellationRow[]) || []);
    setLoadingPreview(false);
  };

  const handleConfirm = async (upload: PendingCancellationUpload) => {
    setProcessingId(upload.id);
    const confirmedAt = new Date().toISOString();

    await supabase
      .from('agency_cancellation_uploads')
      .update({ status: 'success', confirmed_at: confirmedAt })
      .eq('id', upload.id);

    const { data: rows } = await supabase
      .from('agency_cancellations')
      .select('first_name, last_name, phone, tag')
      .eq('upload_id', upload.id);

    const csvHeaders = 'First Name,Last Name,Phone,Tag';
    const csvRows = (rows || []).map((r: any) =>
      [r.first_name, r.last_name, r.phone, r.tag]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = [csvHeaders, ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${upload.agency_name.replace(/\s+/g, '_')}_cancellations_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    await supabase.from('crm_notifications').insert({
      agency_id: upload.agency_id,
      type: 'cancellation_confirmed',
      message: `Cancellation upload "${upload.file_name}" confirmed and processed for ${upload.agency_name}`,
    });

    setProcessingId(null);
    loadPending();
  };

  const handleReject = async () => {
    if (!rejectingUpload || !rejectReason.trim()) return;
    setSubmittingReject(true);

    await supabase
      .from('agency_cancellation_uploads')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
      .eq('id', rejectingUpload.id);

    await supabase.from('crm_notifications').insert({
      agency_id: rejectingUpload.agency_id,
      type: 'cancellation_rejected',
      message: `Cancellation upload "${rejectingUpload.file_name}" rejected: ${rejectReason.trim()}`,
    });

    setSubmittingReject(false);
    setRejectingUpload(null);
    setRejectReason('');
    loadPending();
  };

  if (loading) return null;
  if (pending.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        <h3 className="text-sm font-bold text-muted-foreground">Cancellation Uploads Pending Approval</h3>
        <span className="ml-2 px-2.5 py-0.5 text-[11px] font-bold bg-amber-500/10 text-amber-400 rounded-full">
          {pending.length}
        </span>
      </button>

      {rejectingUpload && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Reject Cancellation Upload</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-foreground/80">
                This will reject the upload <span className="font-semibold">"{rejectingUpload.file_name}"</span> from{' '}
                <span className="font-semibold">{rejectingUpload.agency_name}</span>. They will see your explanation and can re-upload corrected data.
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Reason *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-ring text-sm resize-none bg-card"
                  placeholder="Explain why the cancellation upload is being rejected..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => { setRejectingUpload(null); setRejectReason(''); }}
                disabled={submittingReject}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={submittingReject || !rejectReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {submittingReject ? 'Rejecting...' : 'Reject Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div className="space-y-3">
          {pending.map(upload => (
            <div key={upload.id} className="bg-card rounded-xl border border-amber-500/20 shadow-none overflow-hidden hover:shadow-none transition-shadow duration-200">
              <div className="px-4 py-3 flex items-center gap-3">
                <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground truncate">{upload.file_name}</span>
                    <span className="text-xs text-muted-foreground">{upload.row_count} rows</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{upload.agency_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(upload.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => loadPreview(upload.id)}
                    className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    {previewUploadId === upload.id ? 'Hide' : 'Preview'}
                  </button>
                  <button
                    onClick={() => setRejectingUpload(upload)}
                    disabled={processingId === upload.id}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleConfirm(upload)}
                    disabled={processingId === upload.id}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {processingId === upload.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                    ) : (
                      <>
                        <FileDown className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                        Confirm & Download CSV
                      </>
                    )}
                  </button>
                </div>
              </div>

              {previewUploadId === upload.id && (
                <div className="border-t border-amber-500/20 bg-amber-500/30 px-4 py-3">
                  {loadingPreview ? (
                    <div className="text-center py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                    </div>
                  ) : previewRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No rows found</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-amber-500/20">
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">First Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Last Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Phone</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Tag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-amber-500/20 last:border-0">
                            <td className="px-2 py-1.5 text-muted-foreground">{row.first_name}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.last_name}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.phone}</td>
                            <td className="px-2 py-1.5 text-muted-foreground font-mono">{row.tag}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {previewRows.length > 0 && upload.row_count > 10 && (
                    <p className="text-[10px] text-muted-foreground mt-2">Showing 10 of {upload.row_count} rows</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TicketCard: React.FC<{
  ticket: TicketWithAgency;
  onClick: () => void;
  onStatusChange: (id: string, status: CrmTicket['status']) => void;
}> = ({ ticket, onClick, onStatusChange }) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [zapSending, setZapSending] = useState(false);
  const [zapResult, setZapResult] = useState<'success' | 'failed' | 'paused' | null>(null);
  const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
  const isRosterEdit = ticket.order_type === 'roster-edit' && !!ticket.roster_row_id;

  const handleSendToZap = async () => {
    if (!ticket.roster_row_id) return;
    setZapSending(true);
    setZapResult(null);

    // Pull the live payload straight from the referenced crm_roster row.
    const { data: row } = await supabase
      .from('crm_roster')
      .select('row_data')
      .eq('id', ticket.roster_row_id)
      .maybeSingle();

    if (!row) {
      setZapResult('failed');
      setZapSending(false);
      return;
    }

    const { data: agencyData } = await supabase
      .from('hierarchy_agencies')
      .select('zaps_paused')
      .eq('name', ticket.agency_name)
      .maybeSingle();

    if (agencyData?.zaps_paused) {
      setZapResult('paused');
      setZapSending(false);
      return;
    }

    const rd = row.row_data as Record<string, string>;
    const success = await fireCrmOnboardingWebhook({
      seatNumber: rd['Seat Number'] || '',
      agentNpn: rd['Agent NPN'] || '',
      firstName: rd['First Name'] || '',
      lastName: rd['Last Name'] || '',
      email: rd['Email'] || '',
      phone: rd['Phone'] || '',
      profileImage: rd['All Templates | Agent Profile Image'] || '',
      crmNumber: rd['All Templates | Agent CRM #'] || '',
      agency: ticket.agency_name,
      digitalBusinessCardUrl: rd['Digital Business Card Home Page'] || '',
      confirmationPageUrl: rd['Appt Booked Confirmation Page'] || '',
      calendarEmbedCode: rd['Calendar Embed Code'] || '',
    });

    setZapResult(success ? 'success' : 'failed');
    setZapSending(false);
  };

  return (
    <div
      className="glass rounded-xl shadow-none hover:shadow-none hover:border-primary transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <h4 className="text-sm font-semibold text-muted-foreground line-clamp-2 leading-snug group-hover:text-foreground transition-colors">
            {ticket.subject}
          </h4>
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 glass rounded-xl shadow-none z-10 min-w-[130px] py-1">
                {(['open', 'in-progress', 'resolved', 'closed'] as CrmTicket['status'][]).map(s => (
                  <button
                    key={s}
                    onClick={() => { onStatusChange(ticket.id, s); setShowStatusMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${
                      ticket.status === s ? 'font-semibold text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-2.5">
          <Building2 className="w-3 h-3 text-primary/60" />
          <span className="text-xs font-medium text-primary">{ticket.agency_name}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
            <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
            {CATEGORY_LABELS[ticket.category] || ticket.category}
          </span>
          {isRosterEdit && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
              <Zap className="w-2.5 h-2.5" />
              Roster Edit
            </span>
          )}
        </div>

        {isRosterEdit && (
          <div className="mt-3" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleSendToZap}
              disabled={zapSending}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                zapResult === 'success'
                  ? 'text-emerald-400 bg-emerald-500/10 border border-green-500/20'
                  : zapResult === 'failed'
                  ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                  : zapResult === 'paused'
                  ? 'text-muted-foreground bg-muted border border-border'
                  : 'text-white bg-amber-500/100 hover:bg-amber-500'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${zapSending ? 'animate-pulse' : ''}`} />
              {zapSending
                ? 'Sending...'
                : zapResult === 'success'
                ? 'Sent to Zap'
                : zapResult === 'failed'
                ? 'Failed -- Retry'
                : zapResult === 'paused'
                ? 'Zaps Paused'
                : 'Send to Zap'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" />
            {ticket.submitted_by}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(ticket.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
};

const TicketDetailPanel: React.FC<{
  ticket: TicketWithAgency;
  onBack: () => void;
  onStatusChange: (id: string, status: CrmTicket['status']) => void;
}> = ({ ticket, onBack, onStatusChange }) => {
  const [messages, setMessages] = useState<CrmTicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(ticket.status);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('crm_ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoadingMessages(false);
  }, [ticket.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    await supabase.from('crm_ticket_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'admin',
      sender_name: 'CRM Team',
      message: reply.trim(),
    });
    await supabase.from('crm_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticket.id);
    setReply('');
    setSending(false);
    loadMessages();
  };

  const handleStatusUpdate = async (status: CrmTicket['status']) => {
    setCurrentStatus(status);
    onStatusChange(ticket.id, status);
  };

  const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to board
      </button>

      <div className="bg-card rounded-2xl border border-border shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-muted-foreground">{ticket.subject}</h2>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {ticket.agency_name}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {ticket.submitted_by}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={currentStatus}
                onChange={e => handleStatusUpdate(e.target.value as CrmTicket['status'])}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-muted text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded">
              <span className={`w-2 h-2 rounded-full ${priority.dot}`} />
              {priority.label} Priority
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded">
              <Tag className="w-3 h-3" />
              {CATEGORY_LABELS[ticket.category] || ticket.category}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 py-4 border-b border-border bg-muted/50">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.description}</p>
        </div>

        {/* Messages Thread */}
        <div className="px-6 py-4 border-b border-border max-h-[400px] overflow-y-auto space-y-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquareText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No replies yet</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.sender_type === 'admin'
                    ? 'gradient-primary text-background'
                    : 'bg-secondary text-muted-foreground'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold ${msg.sender_type === 'admin' ? 'text-primary/40' : 'text-muted-foreground'}`}>
                      {msg.sender_name}
                    </span>
                    <span className={`text-[10px] ${msg.sender_type === 'admin' ? 'text-primary/50' : 'text-muted-foreground'}`}>
                      {timeAgo(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Reply Input */}
        <div className="px-6 py-4">
          <div className="flex items-end gap-3">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Type a reply as CRM Team..."
              rows={2}
              className="flex-1 px-4 py-2.5 text-sm border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(); }}
            />
            <button
              onClick={handleReply}
              disabled={!reply.trim() || sending}
              className="px-4 py-2.5 gradient-primary text-background rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : 'Reply'}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Press Cmd+Enter to send</p>
        </div>
      </div>
    </div>
  );
};
