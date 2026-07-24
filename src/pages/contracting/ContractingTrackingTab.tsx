/**
 * Contracting Tracking Tab — Stage 4
 *
 * Agent status table from portal DB `agents`.
 * Search, filter by status/form-type/agency, sortable columns.
 *
 * Future: detail modal, CSV export, pagination.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase } from '@/lib/portal-supabase';
import { formatPhoneDisplay, STATUS_COLORS } from '@/lib/contracting/helpers';
import type { PortalAgent, AgentFormStatus } from '@/lib/contracting/types';

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

  // Sort
  const [sortField, setSortField] = useState<SortField>('date_sent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
      <ArrowUp size={12} className="text-[#1e3a5f]" />
    ) : (
      <ArrowDown size={12} className="text-[#1e3a5f]" />
    );
  };

  // ── Unique filter values ─────────────────────────────────────────────────

  const uniqueFormTypes = useMemo(
    () => [...new Set(agents.map((a) => a.form_type))].sort(),
    [agents]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-amber-500 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-900">
            Portal Connection Required
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Set{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
              VITE_PORTAL_SUPABASE_URL
            </code>{' '}
            and{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, email, phone, code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
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
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
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
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          <option value="">All Agencies</option>
          <option value="FYM">FYM</option>
          <option value="Wisechoice">Wisechoice</option>
          <option value="Aspire">Aspire</option>
        </select>
        <button
          onClick={() => { setLoading(true); loadAgents(); }}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-slate-400' : 'text-slate-400'} />
        </button>
      </div>

      {/* ── Count ─────────────────────────────────────────────────────── */}
      <p className="text-xs text-slate-400">
        {filtered.length} of {agents.length} agents
      </p>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Name <SortIcon field="name" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                    Phone
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('form_type')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Form Type <SortIcon field="form_type" />
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('agency')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Agency <SortIcon field="agency" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                    Code
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Status <SortIcon field="status" />
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('date_sent')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Sent <SortIcon field="date_sent" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      No agents match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((agent) => (
                    <tr
                      key={agent.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {agent.first_name} {agent.last_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatPhoneDisplay(agent.phone)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {FORM_TYPE_LABELS[agent.form_type] ?? agent.form_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {agent.agency}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {agent.security_code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            STATUS_COLORS[agent.status] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(agent.date_sent).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
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
    </div>
  );
}
