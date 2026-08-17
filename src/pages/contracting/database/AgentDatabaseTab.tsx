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
import { useState, useMemo, useEffect } from 'react';
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
  CheckCircle2,
  FileText,
  ClipboardCheck,
  Database,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Award,
  BookOpen,
  Briefcase,
  CheckCircle,
  Clock,
  Plus,
  Save,
  Trash2,
  Edit3,
  AlertCircle,
} from 'lucide-react';
import { useFymAgentDirectory, type FymAgent } from '@/hooks/useFymAgentDirectory';
import { supabase } from '@/lib/supabase';
import { portalSupabase } from '@/lib/portal-supabase';
import { HudFrame } from '@/components/ui/hud-frame';
import { fmt$ } from '@/lib/formatUtils';
import { CrmOnboardingModal } from './CrmOnboardingModal';
import { TerminateAgentModal } from './TerminateAgentModal';
import { fireCrmOnboardingWebhook } from '@/lib/contracting/webhooks';
import type { PortalAgent, PortalIntakeRecord } from '@/lib/contracting/types';

// ── Sorting ────────────────────────────────────────────────────────

type SortKey = 'name' | 'writing_number' | 'source' | 'active' | 'at_risk' | 'total' | 'active_ap';
type SortDir = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  dir: SortDir;
}

const SOURCE_ORDER: Record<string, number> = { roster: 0, intake: 1, prod: 2 };
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isRecentlyAdded(agent: FymAgent): boolean {
  if (!agent.added_at) return false;
  return Date.now() - new Date(agent.added_at).getTime() < THIRTY_DAYS_MS;
}

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
    agents,
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
  const [backfillState, setBackfillState] = useState<{
    running: boolean;
    result: { created: number; skipped: number; failed: number; errors: string[] } | null;
  }>({ running: false, result: null });
  const [crmOnboardAgent, setCrmOnboardAgent] = useState<FymAgent | null>(null);
  const [terminateAgent, setTerminateAgent] = useState<FymAgent | null>(null);

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
            onClick={async () => {
              if (backfillState.running) return;
              if (!portalSupabase) return;
              setBackfillState({ running: true, result: null });

              try {
                // Get all agents with UNL writing numbers
                const agentsWithWn = filteredAgents.filter(a => a.writing_number);

                // Resolve portal agent IDs in batch
                const portalMap = new Map<string, string>(); // wn -> portal agent id

                // Batch 1: Check intake-prefixed IDs
                for (const a of agentsWithWn) {
                  if (a.source === 'intake' && a.id.startsWith('intake-')) {
                    portalMap.set(a.writing_number!, a.id.replace('intake-', ''));
                  }
                }

                // Batch 2: Lookup by email for non-intake agents
                const emailAgents = agentsWithWn.filter(a => a.email && !portalMap.has(a.writing_number!));
                for (const a of emailAgents) {
                  const { data } = await portalSupabase
                    .from('agents')
                    .select('id')
                    .eq('email', a.email!)
                    .limit(1)
                    .maybeSingle();
                  if (data) portalMap.set(a.writing_number!, data.id);
                }

                // Batch 3: Lookup by name for remaining
                const nameAgents = agentsWithWn.filter(a => a.first_name && a.last_name && !portalMap.has(a.writing_number!));
                for (const a of nameAgents) {
                  const { data } = await portalSupabase
                    .from('agents')
                    .select('id')
                    .ilike('first_name', a.first_name!)
                    .ilike('last_name', a.last_name!)
                    .limit(1)
                    .maybeSingle();
                  if (data) portalMap.set(a.writing_number!, data.id);
                }

                // Get all existing LOB assignments for resolved agents
                const portalIds = [...new Set(portalMap.values())];
                const existingLobs = new Set<string>();
                const BATCH = 50;
                for (let i = 0; i < portalIds.length; i += BATCH) {
                  const batch = portalIds.slice(i, i + BATCH);
                  const { data } = await portalSupabase
                    .from('agent_lob_assignments')
                    .select('agent_id, carrier')
                    .in('agent_id', batch)
                    .eq('carrier', 'UNL');
                  for (const row of (data || [])) {
                    existingLobs.add(row.agent_id);
                  }
                }

                // Build insert batch: agents with UNL WN + portal ID + no existing UNL LOB
                const toInsert: { agent_id: string; line_of_business: string; carrier: string; writing_number: string }[] = [];
                let skipped = 0;
                let noPortalId = 0;

                for (const a of agentsWithWn) {
                  const portalId = portalMap.get(a.writing_number!);
                  if (!portalId) { noPortalId++; continue; }
                  if (existingLobs.has(portalId)) { skipped++; continue; }
                  toInsert.push({
                    agent_id: portalId,
                    line_of_business: 'HIP',
                    carrier: 'UNL',
                    writing_number: a.writing_number!,
                  });
                }

                // Insert in batches
                let created = 0;
                let failed = 0;
                const errors: string[] = [];
                for (let i = 0; i < toInsert.length; i += BATCH) {
                  const batch = toInsert.slice(i, i + BATCH);
                  const { error } = await portalSupabase
                    .from('agent_lob_assignments')
                    .insert(batch);
                  if (error) {
                    failed += batch.length;
                    errors.push(error.message);
                  } else {
                    created += batch.length;
                  }
                }

                setBackfillState({
                  running: false,
                  result: {
                    created,
                    skipped: skipped + noPortalId,
                    failed,
                    errors,
                  },
                });
              } catch (err) {
                setBackfillState({
                  running: false,
                  result: {
                    created: 0,
                    skipped: 0,
                    failed: 1,
                    errors: [(err as Error).message],
                  },
                });
              }
            }}
            disabled={backfillState.running || filteredAgents.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {backfillState.running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Briefcase className="w-4 h-4" />
            )}
            {backfillState.running ? 'Backfilling…' : 'Backfill UNL WNs'}
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

      {/* Backfill result banner */}
      {backfillState.result && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
          backfillState.result.failed > 0
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-emerald-500/10 border-emerald-500/20'
        }`}>
          {backfillState.result.failed > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          )}
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Backfill complete: {backfillState.result.created} UNL assignments created
              {backfillState.result.skipped > 0 && `, ${backfillState.result.skipped} skipped (already exists or no portal ID)`}
              {backfillState.result.failed > 0 && `, ${backfillState.result.failed} failed`}
            </p>
            {backfillState.result.errors.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {backfillState.result.errors.join('; ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setBackfillState({ running: false, result: null })}
            className="ml-auto p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Source summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <HudFrame accentColor="hsl(145 63% 42% / 0.5)">
          <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Rostered
            </div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              {totalRoster.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              FYM agency roster
            </p>
          </div>
        </HudFrame>
        <HudFrame accentColor="hsl(270 60% 55% / 0.5)">
          <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ClipboardCheck className="w-4 h-4 text-purple-400" />
              Intake Forms
            </div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              {totalIntake.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Completed contracting intake
            </p>
          </div>
        </HudFrame>
        <HudFrame accentColor="hsl(217 91% 60% / 0.5)">
          <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Globe className="w-4 h-4 text-blue-400" />
              Production File
            </div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              {totalProd.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              FYM direct in prod DB
            </p>
          </div>
        </HudFrame>
        <HudFrame accentColor="hsl(199 89% 48% / 0.5)">
          <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="w-4 h-4 text-cyan-400" />
              FYM Directory
            </div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              {filteredAgents.length.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Deduplicated across sources
            </p>
          </div>
        </HudFrame>
        <HudFrame accentColor="hsl(48 96% 53% / 0.5)">
          <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-yellow-400" />
              CRM Onboarded
            </div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              {agents.filter(a => a.crm_onboarded).length.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Agents with CRM roster seat
            </p>
          </div>
        </HudFrame>
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
              className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
            />
          </div>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) =>
              handleSource(e.target.value as '' | 'roster' | 'intake' | 'prod')
            }
            className="px-4 py-2 bg-card border border-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
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
            <thead className="bg-secondary/50 sticky top-0 z-10">
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
                        {isRecentlyAdded(agent) && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">
                            NEW
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
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setDetailAgent(agent)}
                          className="p-1.5 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                          aria-label={`View details for ${agent.full_name}`}
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {agent.crm_onboarded ? (
                          <span
                            className="p-1.5 text-emerald-400 cursor-default"
                            title="CRM Onboarded"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <button
                            onClick={() => setCrmOnboardAgent(agent)}
                            className="p-1.5 text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                            aria-label={`CRM Onboard ${agent.full_name}`}
                            title="CRM Onboard"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
          onRefresh={refresh}
        />
      )}

      {/* Table-level CRM Onboard Modal */}
      {crmOnboardAgent && (
        <CrmOnboardTableModal
          agent={crmOnboardAgent}
          onClose={() => setCrmOnboardAgent(null)}
          onComplete={() => {
            setCrmOnboardAgent(null);
            refresh();
          }}
        />
      )}

      {/* Table-level Terminate Modal */}
      {terminateAgent && terminateAgent.source !== 'prod' && (
        <TerminateAgentModal
          agent={toPortalAgent(terminateAgent, terminateAgent.source === 'intake' && terminateAgent.id.startsWith('intake-') ? terminateAgent.id.replace('intake-', '') : null)}
          onClose={() => setTerminateAgent(null)}
          onComplete={() => {
            setTerminateAgent(null);
            refresh();
          }}
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

// ── Detail Modal (enriched with portal data) ─────────────────────────

interface PortalEnrichment {
  loading: boolean;
  portalAgentId: string | null;
  lobAssignments: { carrier: string; writing_number: string; verified: boolean }[];
  intakeForm: {
    npn: string | null;
    date_of_birth: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    resident_license_number: string | null;
    resident_state: string | null;
    agent_type: string | null;
    release_needed: string | null;
    state_licenses: string[];
    submitted_at: string | null;
  } | null;
  trainingEvents: {
    event_type: string;
    content_title: string | null;
    quiz_score: number | null;
    quiz_max_score: number | null;
    created_at: string;
  }[];
  pipelineStage: string | null;
}

function resolvePortalAgentId(agent: FymAgent): string | null {
  if (agent.source === 'intake' && agent.id.startsWith('intake-')) {
    return agent.id.replace('intake-', '');
  }
  return null;
}

function usePortalEnrichment(agent: FymAgent): PortalEnrichment {
  const [state, setState] = useState<PortalEnrichment>({
    loading: true,
    portalAgentId: null,
    lobAssignments: [],
    intakeForm: null,
    trainingEvents: [],
    pipelineStage: null,
  });

  useEffect(() => {
    if (!portalSupabase) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Step 1: Resolve portal agent ID
        let portalId = resolvePortalAgentId(agent);

        // For roster/prod agents, try matching by email or name
        if (!portalId && agent.email) {
          const { data } = await portalSupabase
            .from('agents')
            .select('id')
            .eq('email', agent.email)
            .limit(1)
            .maybeSingle();
          if (data) portalId = data.id;
        }

        if (!portalId && agent.first_name && agent.last_name) {
          const { data } = await portalSupabase
            .from('agents')
            .select('id')
            .ilike('first_name', agent.first_name)
            .ilike('last_name', agent.last_name)
            .limit(1)
            .maybeSingle();
          if (data) portalId = data.id;
        }

        if (cancelled) return;

        if (!portalId) {
          setState((s) => ({ ...s, loading: false, portalAgentId: null }));
          return;
        }

        // Step 2: Fetch all portal data in parallel
        const [lobRes, intakeRes, trainingRes, pipelineRes] = await Promise.all([
          portalSupabase
            .from('agent_lob_assignments')
            .select('carrier, writing_number, verified')
            .eq('agent_id', portalId),
          portalSupabase
            .from('agent_intake')
            .select('npn, date_of_birth, address, city, state, postal_code, resident_license_number, resident_state, agent_type, release_needed, state_licenses, submitted_at')
            .eq('agent_id', portalId)
            .maybeSingle(),
          portalSupabase
            .from('agent_training_events')
            .select('event_type, content_title, quiz_score, quiz_max_score, created_at')
            .eq('agent_id', portalId)
            .order('created_at', { ascending: false })
            .limit(20),
          portalSupabase
            .from('agent_pipeline')
            .select('stage')
            .eq('agent_id', portalId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          portalAgentId: portalId,
          lobAssignments: (lobRes.data || []) as { carrier: string; writing_number: string; verified: boolean }[],
          intakeForm: intakeRes.data as PortalEnrichment['intakeForm'],
          trainingEvents: (trainingRes.data || []) as PortalEnrichment['trainingEvents'],
          pipelineStage: pipelineRes.data?.stage || null,
        });
      } catch (err) {
        console.error('Portal enrichment error:', err);
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [agent]);

  return state;
}

// ── Carrier WN Inline Editor ──────────────────────────────────────────

const AVAILABLE_CARRIERS = ['UNL', 'GTL', 'AHL', 'Heartland', 'Manhattan'] as const;

interface WnDraft {
  carrier: string;
  writing_number: string;
  isNew: boolean;
}

// Carrier WN column map for agency_rosters table (FYM App DB)
const ROSTER_WN_COLUMNS: Record<string, string> = {
  GTL: 'gtl_writing_number',
  AHL: 'ahl_writing_number',
  Heartland: 'heartland_writing_number',
  Manhattan: 'manhattan_writing_number',
};

function CarrierWnEditor({
  agent,
  portalAgentId,
  portalLoading,
  initialAssignments,
}: {
  agent: FymAgent;
  portalAgentId: string | null;
  portalLoading: boolean;
  initialAssignments: { carrier: string; writing_number: string; verified: boolean }[];
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<WnDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [assignments, setAssignments] = useState(initialAssignments);

  // Sync when portal data loads
  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  // Build roster carrier WNs list
  const rosterWns: { carrier: string; writing_number: string }[] = [];
  if (agent.gtl_writing_number) rosterWns.push({ carrier: 'GTL', writing_number: agent.gtl_writing_number });
  if (agent.ahl_writing_number) rosterWns.push({ carrier: 'AHL', writing_number: agent.ahl_writing_number });
  if (agent.heartland_writing_number) rosterWns.push({ carrier: 'Heartland', writing_number: agent.heartland_writing_number });
  if (agent.manhattan_writing_number) rosterWns.push({ carrier: 'Manhattan', writing_number: agent.manhattan_writing_number });

  // All current WNs (roster + portal LOB)
  const startEditing = () => {
    // Seed drafts from existing assignments
    const d: WnDraft[] = assignments.map(a => ({
      carrier: a.carrier,
      writing_number: a.writing_number,
      isNew: false,
    }));
    // Add roster WNs not already in portal assignments
    for (const r of rosterWns) {
      if (!d.find(x => x.carrier === r.carrier)) {
        d.push({ carrier: r.carrier, writing_number: r.writing_number, isNew: true });
      }
    }
    setDrafts(d);
    setEditing(true);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const addCarrier = () => {
    const usedCarriers = new Set(drafts.map(d => d.carrier));
    const next = AVAILABLE_CARRIERS.find(c => !usedCarriers.has(c));
    if (next) {
      setDrafts(prev => [...prev, { carrier: next, writing_number: '', isNew: true }]);
    }
  };

  const removeDraft = (idx: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDraft = (idx: number, field: 'carrier' | 'writing_number', value: string) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const handleSave = async () => {
    if (!portalSupabase) {
      setSaveError('Portal connection not available');
      return;
    }

    // Validate
    const validDrafts = drafts.filter(d => d.writing_number.trim());
    if (validDrafts.length === 0 && drafts.length > 0) {
      setSaveError('Enter at least one writing number or remove all rows');
      return;
    }
    const dupeCarriers = validDrafts.map(d => d.carrier).filter((c, i, arr) => arr.indexOf(c) !== i);
    if (dupeCarriers.length > 0) {
      setSaveError(`Duplicate carrier: ${dupeCarriers[0]}`);
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      let targetAgentId = portalAgentId;

      // If no portal agent ID, try to find/create one
      if (!targetAgentId) {
        // Try email match
        if (agent.email) {
          const { data } = await portalSupabase
            .from('agents')
            .select('id')
            .eq('email', agent.email)
            .limit(1)
            .maybeSingle();
          if (data) targetAgentId = data.id;
        }
        // Try name match
        if (!targetAgentId && agent.first_name && agent.last_name) {
          const { data } = await portalSupabase
            .from('agents')
            .select('id')
            .ilike('first_name', agent.first_name)
            .ilike('last_name', agent.last_name)
            .limit(1)
            .maybeSingle();
          if (data) targetAgentId = data.id;
        }
      }

      if (!targetAgentId && agent.source === 'roster' && supabase) {
        // Roster-only agent — save carrier WNs directly to agency_rosters
        const rosterUpdate: Record<string, string | null> = {};
        // Clear all carrier WN columns first
        for (const col of Object.values(ROSTER_WN_COLUMNS)) {
          rosterUpdate[col] = null;
        }
        // Set the ones from drafts
        for (const d of validDrafts) {
          const col = ROSTER_WN_COLUMNS[d.carrier];
          if (col) {
            rosterUpdate[col] = d.writing_number.trim();
          }
          // UNL is stored as unl_writing_number on the roster
          if (d.carrier === 'UNL') {
            rosterUpdate['unl_writing_number'] = d.writing_number.trim();
          }
        }

        const { error: rosterErr } = await supabase
          .from('agency_rosters')
          .update(rosterUpdate)
          .eq('id', agent.id);
        if (rosterErr) throw rosterErr;

        // Update local state
        setAssignments(validDrafts.map(d => ({
          carrier: d.carrier,
          writing_number: d.writing_number.trim(),
          verified: false,
        })));
        setEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        setSaving(false);
        return;
      }

      if (!targetAgentId) {
        setSaveError('Cannot resolve portal agent — agent must exist in the portal (intake or roster) first');
        setSaving(false);
        return;
      }

      // Portal agent found — save to agent_lob_assignments
      await portalSupabase
        .from('agent_lob_assignments')
        .delete()
        .eq('agent_id', targetAgentId);

      if (validDrafts.length > 0) {
        const rows = validDrafts.map(d => ({
          agent_id: targetAgentId,
          line_of_business: 'HIP',
          carrier: d.carrier,
          writing_number: d.writing_number.trim(),
        }));
        const { error } = await portalSupabase
          .from('agent_lob_assignments')
          .insert(rows);
        if (error) throw error;
      }

      // Update local state
      setAssignments(validDrafts.map(d => ({
        carrier: d.carrier,
        writing_number: d.writing_number.trim(),
        verified: false,
      })));
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save carrier WN error:', err);
      setSaveError('Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  };

  const hasAnyWns = rosterWns.length > 0 || assignments.length > 0;
  const usedCarriers = new Set(drafts.map(d => d.carrier));
  const canAddMore = AVAILABLE_CARRIERS.some(c => !usedCarriers.has(c));

  return (
    <DetailSection
      title="Carrier Writing Numbers"
      icon={<Briefcase className="w-4 h-4 text-cyan-400" />}
    >
      {portalLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading carrier assignments…
        </div>
      ) : editing ? (
        /* ── Edit Mode ── */
        <div className="space-y-3">
          {drafts.map((draft, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={draft.carrier}
                onChange={(e) => updateDraft(idx, 'carrier', e.target.value)}
                className="px-2 py-1.5 bg-card border border-border rounded-md text-sm min-w-[110px] focus:ring-2 focus:ring-cyan-500/50"
              >
                {AVAILABLE_CARRIERS.map(c => (
                  <option key={c} value={c} disabled={usedCarriers.has(c) && draft.carrier !== c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={draft.writing_number}
                onChange={(e) => updateDraft(idx, 'writing_number', e.target.value)}
                placeholder="Writing number"
                className="flex-1 px-3 py-1.5 bg-card border border-border rounded-md text-sm font-mono focus:ring-2 focus:ring-cyan-500/50"
              />
              <button
                onClick={() => removeDraft(idx)}
                className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            {canAddMore && (
              <button
                onClick={addCarrier}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 rounded-md hover:bg-cyan-500/20 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Carrier
              </button>
            )}
          </div>

          {saveError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-400">{saveError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-cyan-500/20 rounded-md hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setSaveError(null); }}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── Read Mode ── */
        <div>
          {/* Roster carrier WNs */}
          {rosterWns.length > 0 && (
            <div className="space-y-2 mb-3">
              {rosterWns.map((r) => (
                <div key={r.carrier} className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{r.carrier}</span>
                    <span className="text-[10px] text-muted-foreground">(roster)</span>
                  </div>
                  <span className="font-mono text-sm text-foreground/80">{r.writing_number}</span>
                </div>
              ))}
            </div>
          )}

          {/* Portal LOB assignments */}
          {assignments.length > 0 && (
            <div className="space-y-2 mb-3">
              {assignments.filter(a => !rosterWns.find(r => r.carrier === a.carrier)).map((lob) => (
                <div key={lob.carrier} className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{lob.carrier}</span>
                    {lob.verified && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <span className="font-mono text-sm text-foreground/80">{lob.writing_number}</span>
                </div>
              ))}
            </div>
          )}

          {!hasAnyWns && (
            <p className="text-sm text-muted-foreground italic mb-3">No carrier assignments on file</p>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">Carrier assignments saved</span>
            </div>
          )}

          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 rounded-md hover:bg-cyan-500/20 transition-colors"
          >
            {hasAnyWns ? <Edit3 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {hasAnyWns ? 'Edit Writing Numbers' : 'Add Writing Numbers'}
          </button>
        </div>
      )}
    </DetailSection>
  );
}

const STAGE_LABELS: Record<string, string> = {
  hip_broker: 'HIP Broker',
  hip_career: 'HIP Career',
  iaa: 'IAA',
  signed_iaa: 'Signed IAA',
  bill_com: 'Bill.com',
  in_contracting: 'In Contracting',
  rts: 'RTS',
  crm: 'CRM Onboarding',
  hip_broker_ready: 'HIP Broker READY',
  hip_career_ready: 'HIP Career READY',
  actively_selling: 'Actively Selling',
  terminated: 'Terminated',
};

/** Bridge a FymAgent into the PortalAgent shape the CRM modals expect */
function toPortalAgent(agent: FymAgent, portalAgentId: string | null): PortalAgent {
  return {
    id: portalAgentId || (agent.source === 'intake' && agent.id.startsWith('intake-') ? agent.id.replace('intake-', '') : agent.id),
    first_name: agent.first_name,
    last_name: agent.last_name,
    email: agent.email || '',
    phone: agent.phone || '',
    form_type: (agent.form_type || 'field') as PortalAgent['form_type'],
    agency: 'FYM' as PortalAgent['agency'],
    security_code: '',
    status: (agent.intake_status || 'completed') as PortalAgent['status'],
    date_sent: '',
    date_completed: null,
    expiration_date: '',
    form_url: '',
    crm_onboarded: agent.crm_onboarded,
    terminated_at: null,
    created_at: agent.added_at || '',
    updated_at: '',
  };
}

// ── CRM Onboard from Table — works with FymAgent directly ─────────────

const MALE_IMG = 'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_IMG = 'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

function CrmOnboardTableModal({
  agent,
  onClose,
  onComplete,
}: {
  agent: FymAgent;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<'gender' | 'confirm'>('gender');
  const [gender, setGender] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGender = (g: string) => {
    setGender(g);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!portalSupabase) return;
    setSubmitting(true);
    setError('');

    try {
      const agency = 'FYM';
      const profileImage = gender === 'Male' ? MALE_IMG : FEMALE_IMG;

      // Find roster upload for FYM
      const { data: upload } = await portalSupabase
        .from('crm_roster_uploads')
        .select('id, headers')
        .eq('agency', agency)
        .maybeSingle();

      if (!upload) {
        setError('No CRM roster found for FYM. Please upload a roster first.');
        setSubmitting(false);
        return;
      }

      // Load all rows to find open seat
      const { data: rosterRows } = await portalSupabase
        .from('crm_roster')
        .select('id, row_data')
        .eq('upload_id', upload.id);

      const numericRows = (rosterRows || []).filter(
        (r) => /^\d+$/.test(r.row_data['Seat Number'] || '')
      );

      // Derive shared fields
      const crmNumber = numericRows.find((r) => r.row_data['All Templates | Agent CRM #']?.trim())
        ?.row_data['All Templates | Agent CRM #'] || '';
      const calendarEmbed = numericRows.find((r) => r.row_data['Calendar Embed Code']?.trim())
        ?.row_data['Calendar Embed Code'] || '';
      const urlPrefix = (() => {
        const sample = numericRows.find((r) => r.row_data['Digital Business Card Home Page']?.trim());
        if (!sample) return '';
        const m = sample.row_data['Digital Business Card Home Page'].match(/^(https?:\/\/[^/]+\.my-agent-appt\.com\/r)\d+/);
        return m ? sample.row_data['Digital Business Card Home Page'].replace(/\/r\d+-.*$/, '') : '';
      })();

      // Find closest open seat to 1
      const openSeat = numericRows
        .filter((r) => !r.row_data['First Name']?.trim() || r.row_data['CSR Placeholder'] === 'true')
        .sort((a, b) => Number(a.row_data['Seat Number']) - Number(b.row_data['Seat Number']))[0];

      let seatNumber: string;

      if (openSeat) {
        seatNumber = openSeat.row_data['Seat Number'];
        const updatedRowData: Record<string, string> = {
          ...openSeat.row_data,
          'First Name': agent.first_name,
          'Last Name': agent.last_name,
          'Phone': agent.phone || '',
          'Email': agent.email || '',
          'Agent NPN': agent.npn || '',
          'All Templates | Agent Profile Image': profileImage,
          'All Templates | Agent CRM #': crmNumber,
          'CSR Placeholder': '',
        };
        if (calendarEmbed) updatedRowData['Calendar Embed Code'] = calendarEmbed;
        if (urlPrefix) {
          updatedRowData['Digital Business Card Home Page'] = `${urlPrefix}/r${seatNumber}-click-to-schedule`;
          updatedRowData['Appt Booked Confirmation Page'] = `${urlPrefix}/r${seatNumber}-youre-confirmed`;
        }

        const { error: updateError } = await portalSupabase
          .from('crm_roster')
          .update({ row_data: updatedRowData })
          .eq('id', openSeat.id);

        if (updateError) {
          setError('Failed to update roster seat. Please try again.');
          setSubmitting(false);
          return;
        }
      } else {
        // All seats filled — create max+1
        const maxSeat = numericRows.reduce(
          (max, r) => Math.max(max, Number(r.row_data['Seat Number'])),
          0
        );
        seatNumber = String(maxSeat + 1);

        const newRowData: Record<string, string> = {};
        for (const h of upload.headers) newRowData[h] = '';
        newRowData['Seat Number'] = seatNumber;
        newRowData['First Name'] = agent.first_name;
        newRowData['Last Name'] = agent.last_name;
        newRowData['Phone'] = agent.phone || '';
        newRowData['Email'] = agent.email || '';
        newRowData['Agent NPN'] = agent.npn || '';
        newRowData['All Templates | Agent Profile Image'] = profileImage;
        newRowData['All Templates | Agent CRM #'] = crmNumber;
        if (calendarEmbed) newRowData['Calendar Embed Code'] = calendarEmbed;
        if (urlPrefix) {
          newRowData['Digital Business Card Home Page'] = `${urlPrefix}/r${seatNumber}-click-to-schedule`;
          newRowData['Appt Booked Confirmation Page'] = `${urlPrefix}/r${seatNumber}-youre-confirmed`;
        }

        const { error: insertError } = await portalSupabase
          .from('crm_roster')
          .insert({ upload_id: upload.id, row_data: newRowData });

        if (insertError) {
          setError('Failed to create roster seat. Please try again.');
          setSubmitting(false);
          return;
        }
      }

      // Fire webhook unless zaps are paused
      const { data: agencyData } = await portalSupabase
        .from('hierarchy_agencies')
        .select('zaps_paused, calendar_embed_code')
        .eq('name', agency)
        .maybeSingle();

      if (!agencyData?.zaps_paused) {
        const digitalCardUrl = urlPrefix
          ? `${urlPrefix}/r${seatNumber}-click-to-schedule`
          : '';
        const confirmUrl = urlPrefix
          ? `${urlPrefix}/r${seatNumber}-youre-confirmed`
          : '';

        await fireCrmOnboardingWebhook({
          seatNumber,
          agentNpn: agent.npn || '',
          firstName: agent.first_name,
          lastName: agent.last_name,
          email: agent.email || '',
          phone: agent.phone || '',
          profileImage,
          crmNumber,
          agency,
          digitalBusinessCardUrl: digitalCardUrl,
          confirmationPageUrl: confirmUrl,
          calendarEmbedCode: calendarEmbed || agencyData?.calendar_embed_code || '',
        });
      }

      // If agent has a portal record, mark crm_onboarded + create pipeline entry
      const portalId = agent.source === 'intake' && agent.id.startsWith('intake-')
        ? agent.id.replace('intake-', '')
        : null;

      if (portalId && portalSupabase) {
        await portalSupabase
          .from('agents')
          .update({ crm_onboarded: true })
          .eq('id', portalId);

        const now = new Date().toISOString();
        const autoAdvanceAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const { data: pipelineData } = await portalSupabase
          .from('crm_pipeline')
          .insert({
            agent_id: portalId,
            agency,
            first_name: agent.first_name,
            last_name: agent.last_name,
            email: agent.email || '',
            phone: agent.phone || '',
            seat_number: seatNumber,
            crm_number: crmNumber,
            agent_npn: agent.npn || '',
            stage: 'processing',
            zap_sent_at: now,
            user_created_at: now,
            seat_filled_at: now,
            auto_advance_at: autoAdvanceAt,
          })
          .select('id')
          .maybeSingle();

        if (pipelineData) {
          await portalSupabase.from('crm_pipeline_history').insert({
            pipeline_record_id: pipelineData.id,
            agent_id: portalId,
            agency,
            first_name: agent.first_name,
            last_name: agent.last_name,
            email: agent.email || '',
            phone: agent.phone || '',
            seat_number: seatNumber,
            crm_number: crmNumber,
            agent_npn: agent.npn || '',
            final_stage: 'processing',
            zap_sent_at: now,
            user_created_at: now,
            seat_filled_at: now,
            entered_at: now,
          });
        }
      }

      onComplete();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">
            {step === 'gender' ? 'Select Gender' : 'CRM Onboarding Confirmation'}
          </h2>
        </div>

        {step === 'gender' ? (
          <>
            <div className="px-6 py-5">
              <p className="text-foreground/80 mb-4">
                Gender is required for{' '}
                <span className="font-semibold">{agent.full_name}</span>
                . Please select their gender to continue.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleGender('Male')}
                  className="flex-1 px-4 py-3 text-sm font-medium border-2 border-border rounded-lg hover:border-cyan-500 hover:bg-cyan-500/10 transition-colors"
                >
                  Male
                </button>
                <button
                  onClick={() => handleGender('Female')}
                  className="flex-1 px-4 py-3 text-sm font-medium border-2 border-border rounded-lg hover:border-cyan-500 hover:bg-cyan-500/10 transition-colors"
                >
                  Female
                </button>
              </div>
            </div>
            <div className="px-6 py-4 bg-secondary/50 rounded-b-xl flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-md hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                This will assign a CRM seat and send{' '}
                <span className="font-semibold">{agent.full_name}</span>
                &apos;s information to the Onboarding team for CRM processing.
              </p>
              <p className="text-muted-foreground text-sm mt-2">
                The next available seat (closest to seat 1) will be assigned.
              </p>
              {error && (
                <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </div>
            <div className="px-6 py-4 bg-secondary/50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-md hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Assigning Seat…' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AgentDirectoryDetailModal({
  agent,
  onClose,
  onRefresh,
}: {
  agent: FymAgent;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const portal = usePortalEnrichment(agent);
  const [showCrmOnboard, setShowCrmOnboard] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);

  // Can CRM onboard: not already onboarded, not terminated, has minimum identity (name + email or phone)
  const hasMinIdentity = agent.first_name && agent.last_name && (agent.email || agent.phone);
  const canCrmOnboard = !agent.crm_onboarded && !portal.loading && hasMinIdentity && agent.intake_status !== 'terminated';
  // Can terminate: has a portal agent ID (needs portal record to update status), not already terminated
  const canTerminate = !portal.loading && portal.portalAgentId !== null && agent.intake_status !== 'terminated';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card px-6 py-4 border-b border-border flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {agent.full_name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
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
              {portal.pipelineStage && (
                <span className="px-2 py-0.5 text-xs font-medium bg-indigo-500/20 text-indigo-400 rounded-full">
                  {STAGE_LABELS[portal.pipelineStage] || portal.pipelineStage}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Identity */}
          <DetailSection title="Identity">
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="First Name" value={agent.first_name} />
              <DetailField label="Last Name" value={agent.last_name} />
              <DetailField label="UNL Writing #" value={agent.writing_number} mono />
              <DetailField label="NPN" value={agent.npn || portal.intakeForm?.npn || null} mono />
              <DetailField label="Email" value={agent.email} />
              <DetailField label="Phone" value={agent.phone} />
            </div>
          </DetailSection>

          {/* Carrier Writing Numbers — inline editor */}
          <CarrierWnEditor
            agent={agent}
            portalAgentId={portal.portalAgentId}
            portalLoading={portal.loading}
            initialAssignments={portal.lobAssignments}
          />

          {/* Intake Form Fields */}
          {portal.loading ? (
            <DetailSection title="Intake Form" icon={<FileText className="w-4 h-4 text-purple-400" />}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading intake data…
              </div>
            </DetailSection>
          ) : portal.intakeForm ? (
            <DetailSection title="Intake Form" icon={<FileText className="w-4 h-4 text-purple-400" />}>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Form Type" value={agent.form_type} />
                <DetailField label="Status" value={agent.intake_status} />
                <DetailField label="Agent Type" value={portal.intakeForm.agent_type} />
                <DetailField label="NPN" value={portal.intakeForm.npn} mono />
                <DetailField label="Date of Birth" value={portal.intakeForm.date_of_birth} />
                <DetailField label="Resident State" value={portal.intakeForm.resident_state} />
                <DetailField label="Resident License #" value={portal.intakeForm.resident_license_number} mono />
                <DetailField label="Release Needed" value={portal.intakeForm.release_needed} />
                {portal.intakeForm.address && (
                  <div className="col-span-2">
                    <DetailField
                      label="Address"
                      value={[portal.intakeForm.address, portal.intakeForm.city, portal.intakeForm.state, portal.intakeForm.postal_code].filter(Boolean).join(', ')}
                    />
                  </div>
                )}
                {portal.intakeForm.state_licenses?.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">State Licenses</dt>
                    <dd className="text-sm mt-0.5 flex flex-wrap gap-1">
                      {portal.intakeForm.state_licenses.map((st) => (
                        <span key={st} className="px-1.5 py-0.5 text-xs bg-secondary rounded font-mono">
                          {st}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {portal.intakeForm.submitted_at && (
                  <DetailField
                    label="Submitted"
                    value={new Date(portal.intakeForm.submitted_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                  />
                )}
                <DetailField label="CRM Onboarded" value={agent.crm_onboarded ? 'Yes' : 'No'} />
              </div>
            </DetailSection>
          ) : agent.source === 'intake' ? (
            <DetailSection title="Intake Form" icon={<FileText className="w-4 h-4 text-purple-400" />}>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Form Type" value={agent.form_type} />
                <DetailField label="Status" value={agent.intake_status} />
                <DetailField label="CRM Onboarded" value={agent.crm_onboarded ? 'Yes' : 'No'} />
              </div>
            </DetailSection>
          ) : null}

          {/* Training Completion */}
          {portal.loading ? (
            <DetailSection title="Training" icon={<BookOpen className="w-4 h-4 text-emerald-400" />}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading training data…
              </div>
            </DetailSection>
          ) : portal.trainingEvents.length > 0 ? (
            <DetailSection title="Training" icon={<BookOpen className="w-4 h-4 text-emerald-400" />}>
              <div className="space-y-2">
                {portal.trainingEvents.map((evt, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {evt.event_type === 'quiz_completed' ? (
                        <Award className="w-4 h-4 text-amber-400" />
                      ) : evt.event_type === 'content_completed' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {evt.content_title || evt.event_type.replace(/_/g, ' ')}
                        </span>
                        {evt.quiz_score != null && evt.quiz_max_score != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Score: {evt.quiz_score}/{evt.quiz_max_score}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(evt.created_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                    </span>
                  </div>
                ))}
              </div>
            </DetailSection>
          ) : portal.portalAgentId ? (
            <DetailSection title="Training" icon={<BookOpen className="w-4 h-4 text-emerald-400" />}>
              <p className="text-sm text-muted-foreground italic">No training events recorded</p>
            </DetailSection>
          ) : null}

          {/* Production Metrics */}
          <DetailSection title="Production">
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Active Policies" value={String(agent.active_policies)} />
              <DetailField label="At-Risk" value={String(agent.at_risk_policies)} highlight={agent.at_risk_policies > 0} />
              <DetailField label="Terminated" value={String(agent.terminated_policies)} />
              <DetailField label="Total Policies" value={String(agent.total_policies)} />
              <DetailField label="Active AP" value={fmt$(agent.active_annual_premium)} />
              <DetailField label="Total AP" value={fmt$(agent.total_annual_premium)} />
            </div>
          </DetailSection>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-secondary/50 rounded-b-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            {canCrmOnboard && (
              <button
                onClick={() => setShowCrmOnboard(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors"
              >
                <Users className="w-4 h-4" />
                CRM Onboard
              </button>
            )}
            {canTerminate && (
              <button
                onClick={() => setShowTerminate(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                Terminate
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* CRM Onboarding Modal */}
      {showCrmOnboard && (
        <CrmOnboardingModal
          agent={toPortalAgent(agent, portal.portalAgentId)}
          submission={portal.intakeForm ? {
            id: '',
            agent_id: portal.portalAgentId || '',
            date_of_birth: portal.intakeForm.date_of_birth || '',
            address: portal.intakeForm.address || '',
            city: portal.intakeForm.city || '',
            state: portal.intakeForm.state || '',
            postal_code: portal.intakeForm.postal_code || '',
            ssn: '',
            resident_license_number: portal.intakeForm.resident_license_number || '',
            npn: portal.intakeForm.npn || '',
            resident_state: portal.intakeForm.resident_state || '',
            ctm_acknowledgment: null,
            agent_type: portal.intakeForm.agent_type || null,
            gender: null,
            release_needed: portal.intakeForm.release_needed || '',
            state_licenses: portal.intakeForm.state_licenses || [],
            submitted_at: portal.intakeForm.submitted_at || '',
          } as PortalIntakeRecord : null}
          onClose={() => setShowCrmOnboard(false)}
          onComplete={() => {
            setShowCrmOnboard(false);
            onRefresh();
            onClose();
          }}
        />
      )}

      {/* Terminate Modal */}
      {showTerminate && (
        <TerminateAgentModal
          agent={toPortalAgent(agent, portal.portalAgentId)}
          onClose={() => setShowTerminate(false)}
          onComplete={() => {
            setShowTerminate(false);
            onRefresh();
            onClose();
          }}
        />
      )}
    </div>
  );
}

// ── Detail Section ────────────────────────────────────────────────────

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
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
