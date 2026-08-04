/**
 * Contracting Tracking Tab — Stage 4
 *
 * Agent status table from portal DB `agents`.
 * Search, filter by status/form-type/agency, sortable columns.
 * Detail modal with submission data + uploaded files.
 *
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Download,
  Eye,
  FileDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase } from '@/lib/portal-supabase';
import { formatPhoneDisplay, formatDate, STATUS_COLORS } from '@/lib/contracting/helpers';
import type { PortalAgent, PortalIntakeRecord, PortalUploadedFile } from '@/lib/contracting/types';

// ─── Sort helpers ────────────────────────────────────────────────────────────

type SortField = 'name' | 'agency' | 'form_type' | 'status' | 'date_sent';
type SortDir = 'asc' | 'desc';

function compareFn(a: PortalAgent, b: PortalAgent, field: SortField): number {
  switch (field) {
    case 'name': {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return nameA.localeCompare(nameB);
    }
    case 'agency':
      return (a.agency ?? '').localeCompare(b.agency ?? '');
    case 'form_type':
      return (a.form_type ?? '').localeCompare(b.form_type ?? '');
    case 'status':
      return (a.status ?? '').localeCompare(b.status ?? '');
    case 'date_sent':
      return new Date(a.date_sent).getTime() - new Date(b.date_sent).getTime();
    default:
      return 0;
  }
}

// ─── Form type display map ──────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<string, string> = {
  'life-only': 'Life Only',
  field: 'Field',
  'direct-pay': 'Direct Pay',
  telesales: 'Telesales',
  hip: 'HIP',
  'hip-career': 'HIP Career',
  'hip-broker': 'HIP Broker',
  'field-hip': 'Field HIP',
  'direct-pay-hip': 'Direct Pay HIP',
  'telesales-hip': 'Telesales HIP',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ContractingTrackingTab() {
  const [agents, setAgents] = useState<PortalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formTypeFilter, setFormTypeFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');

  // Detail modal
  const [selectedAgent, setSelectedAgent] = useState<PortalAgent | null>(null);
  const [submission, setSubmission] = useState<PortalIntakeRecord | null>(null);
  const [files, setFiles] = useState<PortalUploadedFile[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('date_sent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // CSV
  const [exporting, setExporting] = useState(false);

  // ── Load agents ──────────────────────────────────────────────────────────

  const loadAgents = useCallback(async () => {
    if (!portalSupabase) return;
    setError(null);

    try {
      const { data, error: fetchErr } = await portalSupabase
        .from('agents')
        .select('*')
        .order('date_sent', { ascending: false });

      if (fetchErr) throw fetchErr;
      setAgents((data as PortalAgent[]) ?? []);
    } catch (err) {
      console.error('[Contracting Tracking] Load error:', err);
      setError('Failed to load agents. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // ── Filter + sort ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...agents];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.phone.includes(q) ||
          a.security_code.includes(q)
      );
    }

    if (statusFilter) {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (formTypeFilter) {
      list = list.filter((a) => a.form_type === formTypeFilter);
    }
    if (agencyFilter) {
      list = list.filter((a) => a.agency === agencyFilter);
    }

    list.sort((a, b) => {
      const cmp = compareFn(a, b, sortField);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [agents, search, statusFilter, formTypeFilter, agencyFilter, sortField, sortDir]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, formTypeFilter, agencyFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Sort toggle ──────────────────────────────────────────────────────────

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown size={12} className="text-slate-300" />;
    return sortDir === 'asc' ? (
      <ArrowUp size={12} className="text-primary" />
    ) : (
      <ArrowDown size={12} className="text-primary" />
    );
  };

  // ── Unique filter values ─────────────────────────────────────────────────

  const uniqueFormTypes = useMemo(
    () => [...new Set(agents.map((a) => a.form_type))].sort(),
    [agents]
  );

  // ── CSV export ──────────────────────────────────────────────────────────

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const rows = filtered.map((a) => ({
        'First Name': a.first_name,
        'Last Name': a.last_name,
        Email: a.email,
        Phone: a.phone,
        'Form Type': FORM_TYPE_LABELS[a.form_type] ?? a.form_type,
        Agency: a.agency,
        'Security Code': a.security_code,
        Status: a.status,
        'Date Sent': a.date_sent ? new Date(a.date_sent).toLocaleDateString('en-US') : '',
        'Date Completed': a.date_completed ? new Date(a.date_completed).toLocaleDateString('en-US') : '',
        'CRM Onboarded': a.crm_onboarded ? 'Yes' : 'No',
      }));

      if (rows.length === 0) return;

      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(','),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const val = String((row as Record<string, string>)[h] ?? '');
              return val.includes(',') || val.includes('"') || val.includes('\n')
                ? `"${val.replace(/"/g, '""')}"`
                : val;
            })
            .join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = url;
      link.download = `agent-tracking-export-${today}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Contracting Tracking] CSV export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // ── Detail modal ─────────────────────────────────────────────────────────

  const openDetailModal = async (agent: PortalAgent) => {
    if (!portalSupabase) return;
    setSelectedAgent(agent);
    setSubmission(null);
    setFiles([]);
    setModalLoading(true);

    try {
      const [subRes, fileRes] = await Promise.all([
        portalSupabase
          .from('agent_intake')
          .select('*')
          .eq('agent_id', agent.id)
          .maybeSingle(),
        portalSupabase
          .from('uploaded_files')
          .select('*')
          .eq('agent_id', agent.id)
          .order('uploaded_at', { ascending: false }),
      ]);

      setSubmission((subRes.data as PortalIntakeRecord | null) ?? null);
      setFiles((fileRes.data as PortalUploadedFile[]) ?? []);
    } catch (err) {
      console.error('[Contracting Tracking] Modal load error:', err);
    } finally {
      setModalLoading(false);
    }
  };

  const closeDetailModal = () => {
    setSelectedAgent(null);
    setSubmission(null);
    setFiles([]);
  };

  const downloadFile = (file: PortalUploadedFile) => {
    try {
      const byteChars = atob(file.file_data);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNums)], {
        type: file.file_type || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      console.error('[Contracting Tracking] Download error');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-amber-500 mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">
            Portal Connection Required
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Set{' '}
            <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">
              VITE_PORTAL_SUPABASE_URL
            </code>{' '}
            and{' '}
            <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">
              VITE_PORTAL_SUPABASE_KEY
            </code>{' '}
            to connect.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filters Row ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, email, phone, code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-card"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-card"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={formTypeFilter}
          onChange={(e) => setFormTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-card"
        >
          <option value="">All Form Types</option>
          {uniqueFormTypes.map((ft) => (
            <option key={ft} value={ft}>
              {FORM_TYPE_LABELS[ft] ?? ft}
            </option>
          ))}
        </select>
        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-card"
        >
          <option value="">All Agencies</option>
          <option value="FYM">FYM</option>
          <option value="Wisechoice">Wisechoice</option>
          <option value="Aspire">Aspire</option>
        </select>
        <button
          onClick={exportToCSV}
          disabled={exporting || filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-background disabled:opacity-50 transition-colors"
        >
          <FileDown size={14} />
          {exporting ? 'Exporting...' : 'CSV'}
        </button>
        <button
          onClick={() => { setLoading(true); loadAgents(); }}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-muted-foreground' : 'text-muted-foreground'} />
        </button>
      </div>

      {/* ── Count ─────────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {agents.length} agents
      </p>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-secondary/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-background border-b border-border">
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground/80"
                    onClick={() => toggleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Name <SortIcon field="name" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                    Phone
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground/80"
                    onClick={() => toggleSort('form_type')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Form Type <SortIcon field="form_type" />
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground/80"
                    onClick={() => toggleSort('agency')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Agency <SortIcon field="agency" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                    Code
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground/80"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Status <SortIcon field="status" />
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase cursor-pointer select-none hover:text-foreground/80"
                    onClick={() => toggleSort('date_sent')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Sent <SortIcon field="date_sent" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No agents match the current filters.
                    </td>
                  </tr>
                ) : (
                  paginated.map((agent) => (
                    <tr
                      key={agent.id}
                      className="hover:bg-background transition-colors cursor-pointer"
                      onClick={() => openDetailModal(agent)}
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {agent.first_name} {agent.last_name}
                          <Eye size={12} className="text-slate-300" />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatPhoneDisplay(agent.phone)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-secondary/40 text-foreground/80">
                          {FORM_TYPE_LABELS[agent.form_type] ?? agent.form_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {agent.agency}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {agent.security_code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            STATUS_COLORS[agent.status] ?? 'bg-secondary/40 text-muted-foreground'
                          }`}
                        >
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(agent.date_sent).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {agent.date_completed
                          ? new Date(agent.date_completed).toLocaleDateString(
                              'en-US',
                              { month: 'short', day: 'numeric' }
                            )
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} className="text-muted-foreground" />
            </button>
            <span className="text-xs text-muted-foreground px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────── */}
      {selectedAgent && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetailModal(); }}
        >
          <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex justify-between items-center rounded-t-xl z-10">
              <h2 className="text-lg font-bold text-foreground">Agent Details</h2>
              <button
                onClick={closeDetailModal}
                className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {modalLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-lg bg-secondary/30 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Agent Summary */}
                <div className="bg-background rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Agent Summary</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name</span>
                      <p className="font-medium text-foreground">{selectedAgent.first_name} {selectedAgent.last_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone</span>
                      <p className="font-medium text-foreground">{formatPhoneDisplay(selectedAgent.phone)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email</span>
                      <p className="font-medium text-foreground">{selectedAgent.email}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Form Type</span>
                      <p className="font-medium text-foreground">{FORM_TYPE_LABELS[selectedAgent.form_type] ?? selectedAgent.form_type}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agency</span>
                      <p className="font-medium text-foreground">{selectedAgent.agency}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Security Code</span>
                      <p className="font-medium font-mono text-foreground">{selectedAgent.security_code}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[selectedAgent.status] ?? 'bg-secondary/40 text-muted-foreground'}`}>
                          {selectedAgent.status}
                        </span>
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sent</span>
                      <p className="font-medium text-foreground">{formatDate(selectedAgent.date_sent)}</p>
                    </div>
                  </div>
                </div>

                {/* Submission Data */}
                <div className="bg-background rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Form Submission Data</h3>
                  {submission ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {submission.agent_type && (
                        <div>
                          <span className="text-muted-foreground">Agent Type</span>
                          <p className="font-medium text-foreground">{submission.agent_type}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Date of Birth</span>
                        <p className="font-medium text-foreground">{submission.date_of_birth}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SSN</span>
                        <p className="font-medium font-mono text-foreground">
                          {submission.ssn.length >= 9
                            ? `${submission.ssn.slice(0, 3)}-${submission.ssn.slice(3, 5)}-${submission.ssn.slice(5, 9)}`
                            : submission.ssn}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">NPN</span>
                        <p className="font-medium text-foreground">{submission.npn}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Address</span>
                        <p className="font-medium text-foreground">
                          {submission.address}, {submission.city}, {submission.state} {submission.postal_code}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Resident License</span>
                        <p className="font-medium text-foreground">{submission.resident_license_number}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Resident State</span>
                        <p className="font-medium text-foreground">{submission.resident_state}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Release Needed</span>
                        <p className="font-medium text-foreground">{submission.release_needed}</p>
                      </div>
                      {submission.ctm_acknowledgment && (
                        <div>
                          <span className="text-muted-foreground">CTM Acknowledgment</span>
                          <p className="font-medium text-foreground">{submission.ctm_acknowledgment}</p>
                        </div>
                      )}
                      {submission.gender && (
                        <div>
                          <span className="text-muted-foreground">Gender</span>
                          <p className="font-medium text-foreground">{submission.gender}</p>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-muted-foreground">State Licenses</span>
                        <p className="font-medium text-foreground">
                          {Array.isArray(submission.state_licenses) && submission.state_licenses.length > 0
                            ? submission.state_licenses.join(', ')
                            : 'None'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {selectedAgent.status === 'pending' && 'Form not yet submitted'}
                      {selectedAgent.status === 'in-progress' && 'Form in progress — not yet submitted'}
                      {selectedAgent.status === 'expired' && 'Form link expired — no submission received'}
                      {selectedAgent.status === 'terminated' && 'Agent terminated'}
                      {!['pending', 'in-progress', 'expired', 'terminated'].includes(selectedAgent.status) && 'No submission data'}
                    </p>
                  )}
                </div>

                {/* Uploaded Files */}
                <div className="bg-background rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Uploaded Files</h3>
                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2.5 bg-card rounded-lg border border-border"
                        >
                          <span className="text-sm text-foreground/80 truncate">{file.file_name}</span>
                          <button
                            onClick={() => downloadFile(file)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-[#162d4a] transition-colors shrink-0 ml-3"
                          >
                            <Download size={12} /> Download
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No files uploaded</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
