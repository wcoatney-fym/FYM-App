/**
 * AgentDatabaseTab — FYM-only agent directory
 *
 * Shows agents from three FYM-specific sources:
 *   1. Intake form completions (portal agents table)
 *   2. FYM agency roster uploads
 *   3. FYM's direct agents in the production file
 *
 * Sub-agency agents (Guardian, Wisechoice, etc.) do NOT appear here.
 * Those belong on the Agents page.
 */
import { useState, useMemo } from 'react';
import {
  Search,
  FileDown,
  Loader2,
  ShieldCheck,
  Globe,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  AlertTriangle,
  Eye,
  FileText,
  ClipboardCheck,
  Database,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useFymAgentDirectory, type FymAgent } from '@/hooks/useFymAgentDirectory';
import { fmt$ } from '@/lib/formatUtils';

// ── Sorting ────────────────────────────────────────────────────────

type SortKey = 'name' | 'writing_number' | 'source' | 'active' | 'at_risk' | 'total' | 'active_ap';
type SortDir = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  dir: SortDir;
}

const SOURCE_ORDER: Record<string, number> = { roster: 0, intake: 1, prod: 2 };

function compareFymAgents(a: FymAgent, b: FymAgent, sort: SortState): number {
  const m = sort.dir === 'asc' ? 1 : -1;
  switch (sort.key) {
    case 'name':
      return m * a.full_name.localeCompare(b.full_name);
    case 'writing_number':
      return m * (a.writing_number || '').localeCompare(b.writing_number || '');
    case 'source':
      return m * ((SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9));
    case 'active':
      return m * (a.active_policies - b.active_policies);
    case 'at_risk':
      return m * (a.at_risk_policies - b.at_risk_policies);
    case 'total':
      return m * (a.total_policies - b.total_policies);
    case 'active_ap':
      return m * (a.active_annual_premium - b.active_annual_premium);
    default:
      return 0;
  }
}

const PAGE_SIZE = 50;

export function AgentDatabaseTab() {
  const {
    filteredAgents,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    sourceFilter,
    setSourceFilter,
    totalRoster,
    totalIntake,
    totalProd,
    refresh,
  } = useFymAgentDirectory();

  const [page, setPage] = useState(0);
  const [detailAgent, setDetailAgent] = useState<FymAgent | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'active_ap', dir: 'desc' });

  // Sort the filtered agents
  const sortedAgents = useMemo(
    () => [...filteredAgents].sort((a, b) => compareFymAgents(a, b, sort)),
    [filteredAgents, sort]
  );

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' || key === 'writing_number' || key === 'source' ? 'asc' : 'desc' }
    );
    setPage(0);
  };

  // Reset page when filters change
  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setPage(0);
  };
  const handleSource = (v: '' | 'roster' | 'intake' | 'prod') => {
    setSourceFilter(v);
    setPage(0);
  };

  // Pagination (uses sorted list)
  const totalPages = Math.ceil(sortedAgents.length / PAGE_SIZE);
  const pageAgents = sortedAgents.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

  // CSV export
  const handleExportCsv = () => {
    const escapeField = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headerRow = [
      'Agent Name',
      'Writing Number',
      'NPN',
      'Source',
      'Email',
      'Phone',
      'Active Policies',
      'At-Risk Policies',
      'Total Policies',
      'Active AP',
      'Total AP',
      'Form Type',
      'Intake Status',
      'CRM Onboarded',
      'GTL WN',
      'Is Manager',
    ];
    const csvRows = [headerRow.join(',')];

    filteredAgents.forEach((agent) => {
      csvRows.push(
        [
          escapeField(agent.full_name),
          escapeField(agent.writing_number || ''),
          escapeField(agent.npn || ''),
          escapeField(
            agent.source === 'roster'
              ? 'Roster'
              : agent.source === 'intake'
              ? 'Intake Form'
              : 'Production DB'
          ),
          escapeField(agent.email || ''),
          escapeField(agent.phone || ''),
          String(agent.active_policies),
          String(agent.at_risk_policies),
          String(agent.total_policies),
          String(agent.active_annual_premium),
          String(agent.total_annual_premium),
          escapeField(agent.form_type || ''),
          escapeField(agent.intake_status || ''),
          agent.crm_onboarded ? 'Yes' : 'No',
          escapeField(agent.gtl_writing_number || ''),
          agent.is_manager ? 'Yes' : 'No',
        ].join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fym-agent-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mr-2" />
        <span className="text-muted-foreground">
          Loading FYM agent directory…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Database className="w-12 h-12 mx-auto mb-3 text-red-400/50" />
        <p className="font-medium text-red-400">Failed to load agent directory</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={refresh}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            FYM Agent Directory
          </h2>
          <p className="text-muted-foreground mt-1">
            {filteredAgents.length.toLocaleString()} agent
            {filteredAgents.length !== 1 ? 's' : ''}
            {sourceFilter || searchTerm ? ' (filtered)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground border border-border rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportCsv}
            disabled={filteredAgents.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-500/20 text-cyan-400 rounded-lg font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            <FileDown className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Source summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Rostered
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalRoster.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            FYM agency roster
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <ClipboardCheck className="w-4 h-4 text-purple-400" />
            Intake Forms
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalIntake.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Completed contracting intake
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Globe className="w-4 h-4 text-blue-400" />
            Production File
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalProd.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            FYM direct in prod DB
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Users className="w-4 h-4 text-cyan-400" />
            FYM Directory
          </div>
          <div className="text-2xl font-bold text-foreground">
            {filteredAgents.length.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Deduplicated across sources
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, WN, NPN, email, phone…"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
            />
          </div>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) =>
              handleSource(e.target.value as '' | 'roster' | 'intake' | 'prod')
            }
            className="px-4 py-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          >
            <option value="">All Sources</option>
            <option value="roster">Rostered Only</option>
            <option value="intake">Intake Forms Only</option>
            <option value="prod">Production File Only</option>
          </select>

          {/* Count display */}
          <div className="flex items-center justify-end text-sm text-muted-foreground">
            Showing {pageAgents.length} of{' '}
            {sortedAgents.length.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Agent Table */}
      <div className="bg-card/50 backdrop-blur border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <SortableHeader label="Agent" sortKey="name" align="left" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Writing #" sortKey="writing_number" align="left" sort={sort} onToggle={toggleSort} />
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  NPN
                </th>
                <SortableHeader label="Source" sortKey="source" align="left" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Active" sortKey="active" align="right" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="At-Risk" sortKey="at_risk" align="right" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Total" sortKey="total" align="right" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Active AP" sortKey="active_ap" align="right" sort={sort} onToggle={toggleSort} />
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    {sortedAgents.length === 0 &&
                    (searchTerm || sourceFilter)
                      ? 'No agents match the current filters'
                      : 'No agents found'}
                  </td>
                </tr>
              ) : (
                pageAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className={`hover:bg-secondary/30 transition-colors ${
                      agent.at_risk_policies > 0
                        ? 'border-l-2 border-l-amber-500/70 bg-amber-500/[0.04]'
                        : ''
                    }`}
                  >
                    {/* Agent name */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDetailAgent(agent)}
                          className="text-cyan-400 hover:text-cyan-300 hover:underline font-medium text-sm"
                        >
                          {agent.full_name}
                        </button>
                        {agent.is_manager && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                            MGR
                          </span>
                        )}
                      </div>
                      {agent.email && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {agent.email}
                        </div>
                      )}
                    </td>

                    {/* Writing number */}
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-foreground/80">
                      {agent.writing_number || '—'}
                    </td>

                    {/* NPN */}
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-foreground/80">
                      {agent.npn || '—'}
                    </td>

                    {/* Source badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <SourceBadge source={agent.source} />
                    </td>

                    {/* Active policies */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-foreground">
                      {agent.active_policies || '—'}
                    </td>

                    {/* At-risk */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      {agent.at_risk_policies > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          {agent.at_risk_policies}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {agent.total_policies > 0 ? '0' : '—'}
                        </span>
                      )}
                    </td>

                    {/* Total policies */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-foreground/80">
                      {agent.total_policies || '—'}
                    </td>

                    {/* Active AP */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-foreground">
                      {agent.active_annual_premium > 0
                        ? fmt$(agent.active_annual_premium)
                        : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button
                        onClick={() => setDetailAgent(agent)}
                        className="p-1.5 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                        aria-label={`View details for ${agent.full_name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/30">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailAgent && (
        <AgentDirectoryDetailModal
          agent={detailAgent}
          onClose={() => setDetailAgent(null)}
        />
      )}
    </div>
  );
}

// ── Sortable Header ──────────────────────────────────────────────────

function SortableHeader({
  label,
  sortKey,
  align,
  sort,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  align: 'left' | 'right';
  sort: SortState;
  onToggle: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = active
    ? sort.dir === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-medium uppercase tracking-wider select-none cursor-pointer group transition-colors hover:bg-secondary/30 ${
        active ? 'text-cyan-400' : 'text-muted-foreground'
      }`}
      onClick={() => onToggle(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <Icon className={`w-3 h-3 transition-opacity ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
        }`} />
      </span>
    </th>
  );
}

// ── Source Badge ──────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'roster' | 'intake' | 'prod' }) {
  switch (source) {
    case 'roster':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-full">
          <ShieldCheck className="w-3 h-3" />
          Roster
        </span>
      );
    case 'intake':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full">
          <FileText className="w-3 h-3" />
          Intake
        </span>
      );
    case 'prod':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
          <Globe className="w-3 h-3" />
          Prod DB
        </span>
      );
  }
}

// ── Detail Modal ──────────────────────────────────────────────────────

function AgentDirectoryDetailModal({
  agent,
  onClose,
}: {
  agent: FymAgent;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {agent.full_name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <SourceBadge source={agent.source} />
              {agent.is_manager && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
                  Manager
                </span>
              )}
              {agent.crm_onboarded && (
                <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded-full">
                  CRM Onboarded
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Identity */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Identity
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="First Name" value={agent.first_name} />
              <DetailField label="Last Name" value={agent.last_name} />
              <DetailField
                label="UNL Writing #"
                value={agent.writing_number}
                mono
              />
              <DetailField label="NPN" value={agent.npn} mono />
              <DetailField label="Email" value={agent.email} />
              <DetailField label="Phone" value={agent.phone} />
            </div>
          </div>

          {/* Intake info (if from intake) */}
          {agent.source === 'intake' && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Intake Form
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Form Type" value={agent.form_type} />
                <DetailField label="Status" value={agent.intake_status} />
                <DetailField
                  label="CRM Onboarded"
                  value={agent.crm_onboarded ? 'Yes' : 'No'}
                />
              </div>
            </div>
          )}

          {/* Carrier Writing Numbers (roster only) */}
          {agent.source === 'roster' && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Carrier Writing Numbers
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailField
                  label="GTL"
                  value={agent.gtl_writing_number}
                  mono
                />
                <DetailField
                  label="AHL"
                  value={agent.ahl_writing_number}
                  mono
                />
                <DetailField
                  label="Heartland"
                  value={agent.heartland_writing_number}
                  mono
                />
                <DetailField
                  label="Manhattan"
                  value={agent.manhattan_writing_number}
                  mono
                />
              </div>
            </div>
          )}

          {/* Production Metrics */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Production
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <DetailField
                label="Active Policies"
                value={String(agent.active_policies)}
              />
              <DetailField
                label="At-Risk"
                value={String(agent.at_risk_policies)}
                highlight={agent.at_risk_policies > 0}
              />
              <DetailField
                label="Terminated"
                value={String(agent.terminated_policies)}
              />
              <DetailField
                label="Total Policies"
                value={String(agent.total_policies)}
              />
              <DetailField
                label="Active AP"
                value={fmt$(agent.active_annual_premium)}
              />
              <DetailField
                label="Total AP"
                value={fmt$(agent.total_annual_premium)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-secondary/50 rounded-b-xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`text-sm mt-0.5 ${mono ? 'font-mono' : ''} ${
          highlight ? 'text-amber-400 font-medium' : 'text-foreground'
        } ${!value ? 'text-muted-foreground italic' : ''}`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
