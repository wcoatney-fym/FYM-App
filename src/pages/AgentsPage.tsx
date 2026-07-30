import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';
import {
  Search, Activity, Users, AlertTriangle, DollarSign,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgentRow {
  writing_number: string;
  agent_name: string | null;
  agency_id: string;
  agency_name: string | null;
  total_policies: number;
  active_policies: number;
  pending_policies: number;
  terminated_policies: number;
  at_risk_count: number;
  active_premium: number;
  annual_premium: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  profile_id: string | null;
  profile_role: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function retentionColor(pct: number | null) {
  if (pct == null) return 'text-muted-foreground/40';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

type SortKey = 'name' | 'active' | 'at_risk' | 'premium' | 'retention';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

// ── Component ──────────────────────────────────────────────────────────────
export function AgentsPage() {
  const navigate = useNavigate();
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    async function load() {
      const PAGE = 1000;
      const allRows: AgentRow[] = [];
      let offset = 0;

      while (true) {
        let query = (supabase as any)
          .from('agent_summary')
          .select('*')
          .order('active_policies', { ascending: false })
          .range(offset, offset + PAGE - 1);

        // Scope to agency for non-org-wide users
        if (!isOrgWide && effectiveAgencyId) {
          query = query.eq('agency_id', effectiveAgencyId);
        }

        const { data, error } = await query;
        if (error) { console.error('Agent summary fetch error:', error.message); break; }
        if (!data || data.length === 0) break;

        allRows.push(...(data as AgentRow[]));
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      setAgents(allRows);
      setLoading(false);
    }

    load();
  }, [effectiveAgencyId, isOrgWide]);

  // Filter + sort
  const displayRows = useMemo(() => {
    let r = agents;

    if (filterAgencyId) {
      r = r.filter(a => a.agency_id === filterAgencyId);
    }

    if (search) {
      const q = search.toLowerCase();
      r = r.filter(a =>
        (a.agent_name ?? '').toLowerCase().includes(q) ||
        a.writing_number.toLowerCase().includes(q) ||
        (a.agency_name ?? '').toLowerCase().includes(q)
      );
    }

    const dir = sortDir === 'desc' ? -1 : 1;
    return [...r].sort((a, b) => {
      if (sortKey === 'name') return dir * (a.agent_name ?? '').localeCompare(b.agent_name ?? '');
      if (sortKey === 'active') return dir * (a.active_policies - b.active_policies);
      if (sortKey === 'at_risk') return dir * (a.at_risk_count - b.at_risk_count);
      if (sortKey === 'premium') return dir * (Number(a.annual_premium) - Number(b.annual_premium));
      if (sortKey === 'retention') return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
      return 0;
    });
  }, [agents, search, filterAgencyId, sortKey, sortDir]);

  // KPIs from filtered data
  const totalAgents = displayRows.length;
  const totalActive = displayRows.reduce((s, a) => s + a.active_policies, 0);
  const totalAtRisk = displayRows.reduce((s, a) => s + a.at_risk_count, 0);
  const totalPremium = displayRows.reduce((s, a) => s + Number(a.annual_premium), 0);

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

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [search, filterAgencyId]);

  return (
    <div>
      <Header title="Agent Directory" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Filters — time period always visible, agency for admins */}
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
              <div className="p-6 space-y-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded shimmer" />)}
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
                    <TableHead className="font-semibold text-muted-foreground">Agency</TableHead>
                    <TableHead
                      className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('active')}
                    >
                      Active <SortIcon k="active" />
                    </TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right">Pending</TableHead>
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
                    <TableHead
                      className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('retention')}
                    >
                      90-Day Ret. <SortIcon k="retention" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map(a => (
                    <TableRow
                      key={a.writing_number}
                      className="hover:bg-background transition-colors cursor-pointer"
                      onClick={() => {
                        if (a.profile_id) navigate(`/agents/${a.profile_id}/health`);
                      }}
                    >
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {a.agent_name ?? <span className="text-muted-foreground/70 italic">Unknown</span>}
                          {a.profile_id && (
                            <Badge className="text-[9px] px-1 py-0 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 border">
                              Provisioned
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-data text-sm text-foreground/80">
                        {a.writing_number}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[160px]">
                        {a.agency_name || '—'}
                      </TableCell>
                      <TableCell className="text-right font-data font-medium text-foreground/80">
                        {a.active_policies.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-data text-muted-foreground">
                        {a.pending_policies > 0 ? a.pending_policies.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right font-data">
                        {a.at_risk_count > 0 ? (
                          <span className="text-red-400 font-medium">{a.at_risk_count.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground/40">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-data font-medium text-foreground/80">
                        {fmt$(Number(a.annual_premium))}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.retention_pct != null ? (
                          <span className={`font-semibold font-data ${retentionColor(a.retention_pct)}`}>
                            {Number(a.retention_pct).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">&lt; 90d</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pagedRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground/70">
                        {agents.length === 0 ? 'No agent data found.' : 'No agents match your search.'}
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
    </div>
  );
}
