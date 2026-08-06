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
import React, { useState, useEffect } from 'react';
import {
  Download,
  Filter,
  Search,
  Calendar,
  Building2,
  FileText,
  Bell,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';

type HistoryEvent = {
  id: string;
  date: string;
  agency: string;
  agencyId: string | null;
  type: 'notification' | 'roster_upload' | 'dba_upload' | 'cancellation_upload';
  typeLabel: string;
  description: string;
  status?: string;
};

type AgencyOption = { id: string; name: string };

const TYPE_STYLES: Record<HistoryEvent['type'], { bg: string; text: string; icon: React.FC<{ className?: string }> }> = {
  notification: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: Bell },
  roster_upload: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: Upload },
  dba_upload: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: FileText },
  cancellation_upload: { bg: 'bg-rose-500/10', text: 'text-rose-400', icon: FileText },
};

const PAGE_SIZE = 50;

export const ActivityHistoryTab: React.FC = () => {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [agencyFilter, setAgencyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<HistoryEvent['type'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);

  const loadData = async () => {
    setLoading(true);

    const [agencyRes, notifRes, rosterRes, dbaRes, cancelRes] = await Promise.all([
      supabase.from('hierarchy_agencies').select('id, name').order('name'),
      supabase.from('crm_notifications').select('id, agency_id, type, message, created_at, hierarchy_agencies(name)').order('created_at', { ascending: false }),
      supabase.from('crm_roster_uploads').select('id, agency, file_name, row_count, uploaded_at').order('uploaded_at', { ascending: false }),
      supabase.from('crm_dba_uploads').select('id, agency, file_name, row_count, uploaded_at').order('uploaded_at', { ascending: false }),
      supabase.from('agency_cancellation_uploads').select('id, agency_id, file_name, row_count, status, created_at, confirmed_at, hierarchy_agencies(name)').order('created_at', { ascending: false }),
    ]);

    const agenciesList: AgencyOption[] = (agencyRes.data || []).map((a: any) => ({ id: a.id, name: a.name }));
    setAgencies(agenciesList);

    const agencyMap = new Map(agenciesList.map(a => [a.id, a.name]));

    const unified: HistoryEvent[] = [];

    for (const n of notifRes.data || []) {
      const agencyName = (n as any).hierarchy_agencies?.name || agencyMap.get(n.agency_id) || 'Unknown';
      unified.push({
        id: `notif-${n.id}`,
        date: n.created_at,
        agency: agencyName,
        agencyId: n.agency_id,
        type: 'notification',
        typeLabel: n.type || 'notification',
        description: n.message,
      });
    }

    for (const r of rosterRes.data || []) {
      unified.push({
        id: `roster-${r.id}`,
        date: r.uploaded_at,
        agency: r.agency || 'Unknown',
        agencyId: null,
        type: 'roster_upload',
        typeLabel: 'Roster Upload',
        description: `File "${r.file_name}" uploaded (${r.row_count} rows)`,
      });
    }

    for (const d of dbaRes.data || []) {
      unified.push({
        id: `dba-${d.id}`,
        date: d.uploaded_at,
        agency: d.agency || 'Unknown',
        agencyId: null,
        type: 'dba_upload',
        typeLabel: 'DBA Upload',
        description: `File "${d.file_name}" uploaded (${d.row_count} rows)`,
      });
    }

    for (const c of cancelRes.data || []) {
      const agencyName = (c as any).hierarchy_agencies?.name || agencyMap.get(c.agency_id) || 'Unknown';
      const statusDesc = c.status === 'success' ? 'Confirmed' : c.status === 'rejected' ? 'Rejected' : 'Pending';
      unified.push({
        id: `cancel-${c.id}`,
        date: c.created_at,
        agency: agencyName,
        agencyId: c.agency_id,
        type: 'cancellation_upload',
        typeLabel: 'Cancellation Upload',
        description: `File "${c.file_name}" (${c.row_count} rows) -- ${statusDesc}`,
        status: c.status,
      });
    }

    unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEvents(unified);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = events.filter((e) => {
    if (agencyFilter !== 'all') {
      if (e.agencyId !== agencyFilter && e.agency !== agencies.find(a => a.id === agencyFilter)?.name) return false;
    }
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!e.description.toLowerCase().includes(q) && !e.agency.toLowerCase().includes(q) && !e.typeLabel.toLowerCase().includes(q)) return false;
    }
    if (startDate) {
      if (new Date(e.date) < new Date(startDate)) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (new Date(e.date) > end) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const downloadCSV = () => {
    const headers = ['Date', 'Agency', 'Type', 'Description', 'Status'];
    const rows = filtered.map(e => [
      new Date(e.date).toLocaleString(),
      e.agency,
      e.typeLabel,
      e.description,
      e.status || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const agencyName = agencyFilter !== 'all'
      ? (agencies.find(a => a.id === agencyFilter)?.name || 'filtered').replace(/\s+/g, '_')
      : 'all_agencies';
    const dateStr = new Date().toISOString().slice(0, 10);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity_history_${agencyName}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setAgencyFilter('all');
    setTypeFilter('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const hasActiveFilters = agencyFilter !== 'all' || typeFilter !== 'all' || searchQuery || startDate || endDate;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-card rounded-2xl border border-border animate-pulse" />
        <div className="h-64 bg-card rounded-2xl border border-border animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-none">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/80">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-2 text-xs text-red-500 hover:text-red-400 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
            <button
              onClick={downloadCSV}
              className="inline-flex items-center gap-2 px-3 py-1.5 gradient-primary text-background text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-none hover:shadow-none"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Agency Filter */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Agency</label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={agencyFilter}
                onChange={(e) => { setAgencyFilter(e.target.value); setPage(0); }}
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-primary appearance-none bg-card"
              >
                <option value="all">All Agencies</option>
                {agencies.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as any); setPage(0); }}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-primary appearance-none bg-card"
            >
              <option value="all">All Types</option>
              <option value="notification">Notifications</option>
              <option value="roster_upload">Roster Uploads</option>
              <option value="dba_upload">DBA Uploads</option>
              <option value="cancellation_upload">Cancellation Uploads</option>
            </select>
          </div>

          {/* Date Start */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">From</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-primary bg-card"
              />
            </div>
          </div>

          {/* Date End */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">To</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-primary bg-card"
              />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                placeholder="Search descriptions..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-primary bg-card"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Agency</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No activity records match the current filters
                  </td>
                </tr>
              ) : (
                paginated.map((event) => {
                  const style = TYPE_STYLES[event.type];
                  const Icon = style.icon;
                  return (
                    <tr key={event.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(event.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                          <Building2 className="w-3.5 h-3.5 text-primary/60" />
                          {event.agency}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}>
                          <Icon className="w-3 h-3" />
                          {event.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground/80 max-w-md truncate" title={event.description}>
                        {event.description}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/50">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs font-medium rounded border border-border bg-card text-foreground/80 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs font-medium rounded border border-border bg-card text-foreground/80 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
