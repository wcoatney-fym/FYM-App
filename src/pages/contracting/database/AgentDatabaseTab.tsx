/**
 * AgentDatabaseTab — Unified agent directory with two-tier resolution
 *
 * Tier 1: agency_rosters in rcbzag (confirmed agents — name/NPN/WN)
 * Tier 2: Max's prod DB fallback (distinct agents from roster_hierarchy_json)
 *
 * Merges both tiers into a single searchable, filterable table with
 * production metrics (policy count, AP, at-risk). Roster agents show
 * a badge; prod-only agents show a different badge.
 *
 * Replaces the old portal-only AgentDatabaseTab that read from akhojh
 * agents table (completed contracting records only).
 */
import { useState } from 'react';
import {
  Search,
  FileDown,
  Database,
  Loader2,
  ShieldCheck,
  Globe,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useAgentDirectory, type UnifiedAgent } from '@/hooks/useAgentDirectory';
import { fmt$ } from '@/lib/formatUtils';

const PAGE_SIZE = 50;

export function AgentDatabaseTab() {
  const {
    filteredAgents,
    agencies,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    agencyFilter,
    setAgencyFilter,
    sourceFilter,
    setSourceFilter,
    totalRoster,
    totalProd,
    rosterAgencyCount,
    refresh,
  } = useAgentDirectory();

  const [page, setPage] = useState(0);
  const [detailAgent, setDetailAgent] = useState<UnifiedAgent | null>(null);

  // Reset page when filters change
  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setPage(0);
  };
  const handleAgency = (v: string) => {
    setAgencyFilter(v);
    setPage(0);
  };
  const handleSource = (v: '' | 'roster' | 'prod') => {
    setSourceFilter(v);
    setPage(0);
  };

  // Pagination
  const totalPages = Math.ceil(filteredAgents.length / PAGE_SIZE);
  const pageAgents = filteredAgents.slice(
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
      'Agency',
      'Source',
      'Email',
      'Phone',
      'Active Policies',
      'At-Risk Policies',
      'Total Policies',
      'Active AP',
      'Total AP',
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
          escapeField(agent.agency_name || ''),
          escapeField(agent.source === 'roster' ? 'Roster' : 'Production DB'),
          escapeField(agent.email || ''),
          escapeField(agent.phone || ''),
          String(agent.active_policies),
          String(agent.at_risk_policies),
          String(agent.total_policies),
          String(agent.active_annual_premium),
          String(agent.total_annual_premium),
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
    link.download = `agent-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mr-2" />
        <span className="text-muted-foreground">
          Loading agent directory…
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
            Agent Directory
          </h2>
          <p className="text-muted-foreground mt-1">
            {filteredAgents.length.toLocaleString()} agent
            {filteredAgents.length !== 1 ? 's' : ''}
            {agencyFilter || sourceFilter || searchTerm
              ? ` (filtered)`
              : ''}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Rostered Agents
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalRoster.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {rosterAgencyCount} agenc{rosterAgencyCount !== 1 ? 'ies' : 'y'} with confirmed rosters
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Globe className="w-4 h-4 text-blue-400" />
            Production DB Agents
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalProd.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            FYM agencies without roster uploads
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Users className="w-4 h-4 text-cyan-400" />
            FYM Directory
          </div>
          <div className="text-2xl font-bold text-foreground">
            {(totalRoster + totalProd).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Rostered + FYM production agents
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, WN, NPN, email…"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
            />
          </div>

          {/* Agency filter */}
          <select
            value={agencyFilter}
            onChange={(e) => handleAgency(e.target.value)}
            className="px-4 py-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          >
            <option value="">All Agencies</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.has_roster ? ' ✓' : ''} ({a.agent_count})
              </option>
            ))}
          </select>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) =>
              handleSource(e.target.value as '' | 'roster' | 'prod')
            }
            className="px-4 py-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          >
            <option value="">All Sources</option>
            <option value="roster">Rostered Only</option>
            <option value="prod">Production DB Only</option>
          </select>

          {/* Count display */}
          <div className="flex items-center justify-end text-sm text-muted-foreground">
            Showing {pageAgents.length} of {filteredAgents.length.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Agent Table */}
      <div className="bg-card/50 backdrop-blur border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Writing #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  NPN
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Agency
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Active
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  At-Risk
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Active AP
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    {filteredAgents.length === 0 && (searchTerm || agencyFilter || sourceFilter)
                      ? 'No agents match the current filters'
                      : 'No agents found'}
                  </td>
                </tr>
              ) : (
                pageAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="hover:bg-secondary/30 transition-colors"
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

                    {/* Agency */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground/80">
                      {agent.agency_name || agent.agency_wn || '—'}
                    </td>

                    {/* Source badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {agent.source === 'roster' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          Roster
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                          <Globe className="w-3 h-3" />
                          Prod DB
                        </span>
                      )}
                    </td>

                    {/* Active policies */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-foreground">
                      {agent.active_policies}
                    </td>

                    {/* At-risk */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      {agent.at_risk_policies > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          {agent.at_risk_policies}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>

                    {/* Total policies */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-foreground/80">
                      {agent.total_policies}
                    </td>

                    {/* Active AP */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-foreground">
                      {fmt$(agent.active_annual_premium)}
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

// ── Detail Modal ──────────────────────────────────────────────────────

function AgentDirectoryDetailModal({
  agent,
  onClose,
}: {
  agent: UnifiedAgent;
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
              {agent.source === 'roster' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  Rostered Agent
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                  <Globe className="w-3 h-3" />
                  Production DB
                </span>
              )}
              {agent.is_manager && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
                  Manager
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
              <DetailField label="UNL Writing #" value={agent.writing_number} mono />
              <DetailField label="NPN" value={agent.npn} mono />
              <DetailField label="Email" value={agent.email} />
              <DetailField label="Phone" value={agent.phone} />
              <DetailField label="Agency" value={agent.agency_name} />
              <DetailField
                label="Agency WN"
                value={agent.agency_wn}
                mono
              />
            </div>
          </div>

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
        className={`text-sm mt-0.5 ${
          mono ? 'font-mono' : ''
        } ${highlight ? 'text-amber-400 font-medium' : 'text-foreground'} ${
          !value ? 'text-muted-foreground italic' : ''
        }`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
