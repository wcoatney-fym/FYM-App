/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  Users,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import type { AgencyClient } from '@/lib/crm/types';

interface AgencyContactsTabProps {
  agencyId: string;
  agencyName: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  active: { label: 'Active', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', icon: CheckCircle2 },
  at_risk: { label: 'At Risk', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', icon: AlertTriangle },
  terminated: { label: 'Terminated', color: 'bg-red-500/10 text-red-400 border border-red-500/20', icon: XCircle },
  lapsed: { label: 'Lapsed', color: 'bg-secondary text-muted-foreground border border-border', icon: Clock },
};

const PAGE_SIZE = 50;

type SortField = 'client_name' | 'submit_date' | 'effective_date' | 'carrier' | 'status';
type SortDir = 'asc' | 'desc';

export const AgencyContactsTab: React.FC<AgencyContactsTabProps> = ({ agencyId, agencyName }) => {
  const [contacts, setContacts] = useState<AgencyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('submit_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, count } = await supabase
        .from('agency_clients')
        .select('*', { count: 'exact' })
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .range(0, 9999);

      setContacts(data || []);
      setTotalCount(count || 0);
      setLoading(false);
    };
    load();
  }, [agencyId]);

  const filtered = contacts.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.client_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.carrier.toLowerCase().includes(q) ||
      c.ghl_assigned_to.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'client_name':
        return dir * a.client_name.localeCompare(b.client_name);
      case 'submit_date':
        return dir * ((a.submit_date || '').localeCompare(b.submit_date || ''));
      case 'effective_date':
        return dir * ((a.effective_date || '').localeCompare(b.effective_date || ''));
      case 'carrier':
        return dir * a.carrier.localeCompare(b.carrier);
      case 'status':
        return dir * a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const counts = {
    all: contacts.length,
    active: contacts.filter(c => c.status === 'active').length,
    at_risk: contacts.filter(c => c.status === 'at_risk').length,
    terminated: contacts.filter(c => c.status === 'terminated').length,
    lapsed: contacts.filter(c => c.status === 'lapsed').length,
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  const handleExport = () => {
    const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Status', 'Submit Date', 'Effective Date', 'Carrier', 'Follower', 'Product', 'Policy #', 'Premium'];
    const rows = filtered.map(c => [
      c.first_name,
      c.last_name,
      c.phone,
      c.email,
      c.status,
      c.submit_date ? new Date(c.submit_date).toLocaleDateString() : '',
      c.effective_date || '',
      c.carrier,
      c.ghl_assigned_to,
      c.product_type,
      c.policy_number,
      c.premium_amount.toString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agencyName}_contacts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress(null);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-ghl-data`;
    const headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    let complete = false;
    let isFirst = true;

    while (!complete) {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ agency_id: agencyId, reset_sync: isFirst }),
      });
      isFirst = false;

      if (!res.ok) break;
      const result = await res.json();
      if (!result.success) break;

      setSyncProgress({
        fetched: result.fetched_so_far || 0,
        total: result.total_expected || 0,
      });

      complete = result.complete;
      if (!complete) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const { data, count } = await supabase
      .from('agency_clients')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .range(0, 9999);
    setContacts(data || []);
    setTotalCount(count || 0);
    setSyncing(false);
    setSyncProgress(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total (API)</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{counts.active}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Active</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{counts.at_risk}</p>
          <p className="text-xs text-muted-foreground mt-0.5">At Risk</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{counts.terminated}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Terminated</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{counts.lapsed}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Lapsed</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, email, phone, carrier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing
              ? syncProgress
                ? `Syncing ${syncProgress.fetched.toLocaleString()}${syncProgress.total ? ` / ${syncProgress.total.toLocaleString()}` : ''}...`
                : 'Starting sync...'
              : 'Sync Now'}
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1.5 overflow-x-auto">
        <Filter className="w-3.5 h-3.5 text-muted-foreground ml-2 flex-shrink-0" />
        {[
          { key: 'all', label: `All (${counts.all})` },
          { key: 'active', label: `Active (${counts.active})` },
          { key: 'at_risk', label: `At Risk (${counts.at_risk})` },
          { key: 'terminated', label: `Terminated (${counts.terminated})` },
          { key: 'lapsed', label: `Lapsed (${counts.lapsed})` },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(0); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === f.key ? 'gradient-primary text-background shadow-none' : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th
                  onClick={() => toggleSort('client_name')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                >
                  Name <SortIcon field="client_name" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                <th
                  onClick={() => toggleSort('status')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                >
                  Status <SortIcon field="status" />
                </th>
                <th
                  onClick={() => toggleSort('submit_date')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                >
                  Submit Date <SortIcon field="submit_date" />
                </th>
                <th
                  onClick={() => toggleSort('effective_date')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                >
                  Effective <SortIcon field="effective_date" />
                </th>
                <th
                  onClick={() => toggleSort('carrier')}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                >
                  Carrier <SortIcon field="carrier" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Follower</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paged.map((contact) => {
                const status = STATUS_CONFIG[contact.status] || STATUS_CONFIG.active;
                return (
                  <tr key={contact.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {contact.first_name || contact.last_name
                            ? `${contact.first_name} ${contact.last_name}`.trim()
                            : contact.client_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        {contact.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            {contact.phone}
                          </span>
                        )}
                        {contact.email && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            {contact.email}
                          </span>
                        )}
                        {!contact.phone && !contact.email && (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        <status.icon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {contact.submit_date
                        ? new Date(contact.submit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : '--'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {contact.effective_date
                        ? new Date(contact.effective_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : '--'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-foreground/80">
                      {contact.carrier || '--'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {contact.ghl_assigned_to || '--'}
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {contacts.length === 0 ? 'No contacts synced yet. Run a sync to pull data from GHL.' : 'No contacts match your filters.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-card border border-border rounded-md hover:bg-secondary disabled:opacity-50 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-card border border-border rounded-md hover:bg-secondary disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {contacts.length !== totalCount && totalCount > contacts.length && (
        <p className="text-xs text-amber-400 text-center">
          Showing {contacts.length} of {totalCount} total contacts. Run another sync to import remaining records.
        </p>
      )}
    </div>
  );
};
