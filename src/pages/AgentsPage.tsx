import { useState, useMemo, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';
import { useAgentDirectory, type UnifiedAgent } from '@/hooks/useAgentDirectory';
import {
  Search, Activity, Users, AlertTriangle, DollarSign,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  X, Loader2,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPhone(raw: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

type SortKey = 'name' | 'active' | 'at_risk' | 'premium' | 'retention';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

// ── Component ──────────────────────────────────────────────────────────────
export function AgentsPage() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [detailAgent, setDetailAgent] = useState<UnifiedAgent | null>(null);

  const {
    filteredAgents: allAgents,
    loading,
    error,
    setAgencyFilter,
    refresh,
  } = useAgentDirectory();

  // Sync DataFilters agency to hook
  useEffect(() => {
    setAgencyFilter(filterAgencyId ?? '');
  }, [filterAgencyId, setAgencyFilter]);

  // Scope for non-org-wide users
  const scopedAgents = useMemo(() => {
    if (!isOrgWide && effectiveAgencyId) {
      return allAgents.filter(a => a.agency_id === effectiveAgencyId);
    }
    return allAgents;
  }, [allAgents, isOrgWide, effectiveAgencyId]);

  // Search + sort
  const displayRows = useMemo(() => {
    let r = scopedAgents;

    if (search) {
      const q = search.toLowerCase();
      r = r.filter(a =>
        a.full_name.toLowerCase().includes(q) ||
        (a.writing_number ?? '').toLowerCase().includes(q) ||
        (a.npn ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.agency_name ?? '').toLowerCase().includes(q)
      );
    }

    const dir = sortDir === 'desc' ? -1 : 1;
    return [...r].sort((a, b) => {
      if (sortKey === 'name') return dir * a.full_name.localeCompare(b.full_name);
      if (sortKey === 'active') return dir * (a.active_policies - b.active_policies);
      if (sortKey === 'at_risk') return dir * (a.at_risk_policies - b.at_risk_policies);
      if (sortKey === 'premium') return dir * (a.active_annual_premium - b.active_annual_premium);
      // retention: compute inline
      const retA = a.total_policies > 0 ? (a.active_policies / a.total_policies) * 100 : -1;
      const retB = b.total_policies > 0 ? (b.active_policies / b.total_policies) * 100 : -1;
      if (sortKey === 'retention') return dir * (retA - retB);
      return 0;
    });
  }, [scopedAgents, search, sortKey, sortDir]);

  // KPIs
  const totalAgents = displayRows.length;
  const totalActive = displayRows.reduce((s, a) => s + a.active_policies, 0);
  const totalAtRisk = displayRows.reduce((s, a) => s + a.at_risk_policies, 0);
  const totalPremium = displayRows.reduce((s, a) => s + a.active_annual_premium, 0);

  // Pagination
  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE);
  const pagedRows = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'desc'
      ? <ChevronDown size={13} className="inline ml-0.5" />
      : <ChevronUp size={13} className="inline ml-0.5" />;
  }

  useEffect(() => { setPage(0); }, [search, filterAgencyId]);

  return (
    <div>
      <Header title="Agent Directory" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        <DataFilters
          showAgencyFilter={showAgencyFilter}
          showTimePeriod
          selectedAgencyId={filterAgencyId}
          selectedPreset={datePreset}
          selectedDateRange={dateRange}
          onAgencyChange={setFilterAgencyId}
          onDateRangeChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
        />

        {/* KPI strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Total Agents', end: totalAgents, icon: Users, color: 'text-primary', bg: 'bg-cyan-500/10' },
            { title: 'Active Policies', end: totalActive, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { title: 'At-Risk Policies', end: totalAtRisk, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
            { title: 'Annual Premium', end: totalPremium, fmt: fmt$, icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt}
                        className="text-xl font-bold text-foreground mt-0.5 block font-data"
                      />
                    </div>
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <card.icon size={18} className={card.color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Table */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">All Agents</CardTitle>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {displayRows.length.toLocaleString()} agents
                  {filterAgencyId ? ' (filtered)' : ''}
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  placeholder="Search name, writing #, agency…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 bg-card h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400 mr-2" />
                <span className="text-sm text-muted-foreground">Loading agents from production DB…</span>
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-400 text-sm">
                {error}
                <button onClick={refresh} className="ml-2 underline text-cyan-400">Retry</button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-background">
                    <TableHead
                      className="font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('name')}
                    >
                      Agent <SortIcon k="name" />
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Writing #</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">NPN</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Agency</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Phone</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Email</TableHead>
                    <TableHead
                      className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('active')}
                    >
                      Active <SortIcon k="active" />
                    </TableHead>
                    <TableHead
                      className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('at_risk')}
                    >
                      At-Risk <SortIcon k="at_risk" />
                    </TableHead>
                    <TableHead
                      className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('premium')}
                    >
                      Annual Premium <SortIcon k="premium" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map(a => (
                    <TableRow
                      key={a.id}
                      className="hover:bg-background transition-colors cursor-pointer"
                      onClick={() => setDetailAgent(a)}
                    >
                      <TableCell className="font-medium text-foreground">
                        <span className="text-cyan-400 hover:underline">
                          {a.full_name || <span className="text-muted-foreground/70 italic">Unknown</span>}
                        </span>
                      </TableCell>
                      <TableCell className="font-data text-sm text-foreground/80">
                        {a.writing_number || '—'}
                      </TableCell>
                      <TableCell className="font-data text-sm text-foreground/80">
                        {a.npn || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[160px]">
                        {a.agency_name || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-foreground/80">
                        {fmtPhone(a.phone) || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-foreground/80 truncate max-w-[180px]">
                        {a.email || '—'}
                      </TableCell>
                      <TableCell className="text-right font-data font-medium text-foreground/80">
                        {a.active_policies > 0 ? a.active_policies.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right font-data">
                        {a.at_risk_policies > 0 ? (
                          <span className="text-red-400 font-medium">{a.at_risk_policies.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground/40">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-data font-medium text-foreground/80">
                        {a.active_annual_premium > 0 ? fmt$(a.active_annual_premium) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pagedRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground/70">
                        {loading ? 'Loading…' : scopedAgents.length === 0 ? 'No agent data found.' : 'No agents match your search.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground font-data">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, displayRows.length)} of {displayRows.length.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground font-data px-2">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Detail Popup */}
      {detailAgent && (
        <AgentDetailPopup agent={detailAgent} onClose={() => setDetailAgent(null)} />
      )}
    </div>
  );
}

// ── Agent Detail Popup ─────────────────────────────────────────────────────

function AgentDetailPopup({ agent, onClose }: { agent: UnifiedAgent; onClose: () => void }) {
  // Compute simple retention proxy
  const retentionPct = agent.total_policies > 0
    ? Math.round((agent.active_policies / agent.total_policies) * 1000) / 10
    : null;

  // Health score: simple composite of retention + at-risk ratio
  const atRiskRatio = agent.active_policies > 0
    ? agent.at_risk_policies / agent.active_policies
    : 0;
  const healthScore = retentionPct != null
    ? Math.max(0, Math.min(100, Math.round(retentionPct * (1 - atRiskRatio * 0.5))))
    : null;

  const healthColor = healthScore == null ? 'text-muted-foreground/40'
    : healthScore >= 90 ? 'text-emerald-400'
    : healthScore >= 75 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{agent.full_name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {agent.agency_name || 'Unknown Agency'}
              {agent.is_manager && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">MGR</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Health Score + KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniKpi label="Health Score" value={healthScore != null ? `${healthScore}` : '—'} className={healthColor} />
            <MiniKpi label="Active Policies" value={String(agent.active_policies)} />
            <MiniKpi label="At-Risk" value={String(agent.at_risk_policies)} className={agent.at_risk_policies > 0 ? 'text-red-400' : ''} />
            <MiniKpi label="Active AP" value={fmt$(agent.active_annual_premium)} />
          </div>

          {/* Production Summary */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Production</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <DetailField label="Total Policies" value={String(agent.total_policies)} />
              <DetailField label="Active Policies" value={String(agent.active_policies)} />
              <DetailField label="Terminated" value={String(agent.terminated_policies)} />
              <DetailField label="At-Risk" value={String(agent.at_risk_policies)} highlight={agent.at_risk_policies > 0} />
              <DetailField label="Active AP" value={fmt$(agent.active_annual_premium)} />
              <DetailField label="Total AP" value={fmt$(agent.total_annual_premium)} />
              {retentionPct != null && (
                <DetailField label="Retention" value={`${retentionPct.toFixed(1)}%`}
                  highlight={retentionPct < 90} />
              )}
            </div>
          </div>

          {/* Identity */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Identity</h3>
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="First Name" value={agent.first_name} />
              <DetailField label="Last Name" value={agent.last_name} />
              <DetailField label="Phone" value={fmtPhone(agent.phone)} />
              <DetailField label="Email" value={agent.email} />
              <DetailField label="NPN" value={agent.npn} mono />
              <DetailField label="Agency" value={agent.agency_name} />
            </div>
          </div>

          {/* Writing Numbers */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Writing Numbers</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <DetailField label="UNL" value={agent.writing_number} mono />
              <DetailField label="GTL" value={agent.gtl_writing_number} mono />
              <DetailField label="AHL" value={agent.ahl_writing_number} mono />
              <DetailField label="Heartland" value={agent.heartland_writing_number} mono />
              <DetailField label="Manhattan" value={agent.manhattan_writing_number} mono />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-secondary/50 rounded-b-xl flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-md hover:bg-secondary transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3 text-center">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-data mt-1 ${className || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function DetailField({ label, value, mono = false, highlight = false }: {
  label: string; value: string | null; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm mt-0.5 ${mono ? 'font-mono' : ''} ${highlight ? 'text-amber-400 font-medium' : 'text-foreground'} ${!value ? 'text-muted-foreground/50 italic' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  );
}
