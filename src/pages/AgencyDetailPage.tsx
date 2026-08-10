/**
 * AgencyDetailPage — Agency drill-down with agents table
 *
 * Rewrite (2026-08-10):
 * - Dropped slow fetchBookOfBusiness paginated fetch (caused loading timeout on 14K+ agencies)
 * - Uses fetchRetentionSummary for agency KPIs (fast, single call)
 * - Uses fetchAgentProduction for per-agent stats table (new)
 * - Full drill-down: Agencies → Agency (agents list) → Agent detail
 * - Product mix derived from agent stats, not individual policies
 *
 * Route: /agencies/:agencyId
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { supabase } from '@/lib/supabase';
import {
  fetchRetentionSummary,
  fetchAgentProduction,
  type AgentProduction,
} from '@/lib/prod-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { fmt$ } from '@/lib/formatUtils';
import {
  ArrowLeft, ShieldCheck, TrendingUp, AlertTriangle, DollarSign,
  Search, ChevronRight, ChevronUp, ChevronDown, Download, Users,
  ChevronLeft,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgencySummary {
  agency_id: string;
  agency_name: string | null;
  active_policies: number;
  terminated_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  recent_3mo_pct: number | null;
  prior_3mo_pct: number | null;
}

interface AgencyInfo {
  writing_number: string | null;
  name: string;
  slug: string | null;
  is_active: boolean;
}

type SortKey = 'name' | 'active_policies' | 'active_monthly_premium' | 'at_risk_policies' | 'retention_pct' | 'ap_this_month';

const PAGE_SIZE = 25;

// ── Helpers ────────────────────────────────────────────────────────────────
function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400 font-semibold';
  if (pct >= 85) return 'text-amber-400 font-semibold';
  return 'text-red-400 font-bold';
}

function retentionBadge(pct: number | null) {
  if (pct === null) return null;
  if (pct >= 90) return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px] px-1.5 py-0">On target</Badge>;
  if (pct >= 85) return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-[10px] px-1.5 py-0">At risk</Badge>;
  return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border text-[10px] px-1.5 py-0">Below target</Badge>;
}

function escCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Component ──────────────────────────────────────────────────────────────
export function AgencyDetailPage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const navigate = useNavigate();
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();

  const [info, setInfo] = useState<AgencyInfo | null>(null);
  const [summary, setSummary] = useState<AgencySummary | null>(null);
  const [agents, setAgents] = useState<AgentProduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agent table controls
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('active_monthly_premium');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  // Load agency name from local Supabase
  useEffect(() => {
    if (!supabase || !agencyId) return;
    (async () => {
      const { data: byWn } = await (supabase as any)
        .from('agencies')
        .select('id, writing_number, name, slug, is_active')
        .eq('writing_number', agencyId)
        .maybeSingle();
      if (byWn) {
        setInfo(byWn as AgencyInfo);
      } else {
        const { data: byId } = await (supabase as any)
          .from('agencies')
          .select('id, writing_number, name, slug, is_active')
          .eq('id', agencyId)
          .maybeSingle();
        if (byId) setInfo(byId as AgencyInfo);
      }
    })();
  }, [agencyId]);

  // Load data from edge functions — parallel, no book-of-business
  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [retRes, agentRes] = await Promise.all([
          fetchRetentionSummary({ agency_id: agencyId }),
          fetchAgentProduction({ agency_id: agencyId }),
        ]);

        if (cancelled) return;

        // Find this agency in the retention summary
        const agencySummary = retRes.data.agencies.find(
          (a: any) => a.agency_id === agencyId
        );
        if (agencySummary) {
          setSummary(agencySummary as AgencySummary);
        } else {
          // Agency exists but no data — show empty state
          setSummary(null);
        }

        setAgents(agentRes);
      } catch (err) {
        if (!cancelled) {
          console.error('AgencyDetailPage fetch error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load agency data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [agencyId]);

  // Guard: managers / agency admins cannot view another agency's detail page
  if (!isOrgWide && effectiveAgencyId && agencyId !== effectiveAgencyId) {
    return <Navigate to="/" replace />;
  }

  const agencyName = info?.name ?? summary?.agency_name ?? agencyId ?? '—';

  // Filter + sort agents
  const filtered = useMemo(() => {
    let result = agents;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        (a.agent_name ?? a.agent_id).toLowerCase().includes(q) ||
        a.agent_id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [agents, search]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name': {
          const nameA = (a.agent_name ?? a.agent_id).toLowerCase();
          const nameB = (b.agent_name ?? b.agent_id).toLowerCase();
          return dir * nameA.localeCompare(nameB);
        }
        case 'active_policies': return dir * (a.active_policies - b.active_policies);
        case 'active_monthly_premium': return dir * (a.active_monthly_premium - b.active_monthly_premium);
        case 'at_risk_policies': return dir * (a.at_risk_policies - b.at_risk_policies);
        case 'retention_pct': return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        case 'ap_this_month': return dir * (a.ap_this_month - b.ap_this_month);
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search]);

  // Sort toggle
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'name'); }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc
      ? <ChevronUp size={10} className="inline ml-0.5" />
      : <ChevronDown size={10} className="inline ml-0.5" />;
  }

  // Navigate to agent detail
  const handleAgentClick = useCallback((agentWn: string) => {
    navigate(`/production/${agencyId}/agent/${agentWn}`);
  }, [navigate, agencyId]);

  // CSV export
  const handleExport = useCallback(() => {
    const headers = ['Agent', 'Writing Number', 'Active Policies', 'Premium/mo', 'At-Risk', 'Retention %', 'MTD AP', 'Status'];
    const csvRows = sorted.map(a => [
      escCsv(a.agent_name ?? a.agent_id),
      escCsv(a.agent_id),
      a.active_policies,
      Math.round(a.active_monthly_premium),
      a.at_risk_policies,
      a.retention_pct !== null ? a.retention_pct : '',
      Math.round(a.ap_this_month),
      a.retention_pct === null ? '' : a.retention_pct >= 90 ? 'On target' : a.retention_pct >= 85 ? 'At risk' : 'Below target',
    ]);
    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(info?.name ?? agencyId ?? 'agency').replace(/[^a-zA-Z0-9]/g, '_')}-agents-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [sorted, info, agencyId]);

  // Aggregate stats from agents
  const totalAgents = agents.length;
  const totalAtRisk = agents.reduce((s, a) => s + a.at_risk_policies, 0);

  if (loading) {
    return (
      <div>
        <Header title="Agency Detail" />
        <div className="p-6 space-y-4">
          <Link to="/people/agencies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft size={14} /> All Agencies
          </Link>
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-lg shimmer" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Agency Detail" />
        <div className="p-6 space-y-4">
          <Link to="/people/agencies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft size={14} /> All Agencies
          </Link>
          <Card className="border-red-500/20">
            <CardContent className="py-8 text-center">
              <AlertTriangle size={32} className="mx-auto text-red-400 mb-3" />
              <p className="text-foreground font-medium mb-1">Failed to load agency data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const s = summary;

  return (
    <div>
      <Header title={agencyName} />
      <div className="p-6 space-y-6">

        {/* Back link */}
        <Link to="/people/agencies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft size={14} /> All Agencies
        </Link>

        {/* Agency name + writing number header */}
        <div>
          <h2 className="text-xl font-bold text-foreground">{agencyName}</h2>
          {agencyId && agencyId !== agencyName && (
            <p className="text-sm text-muted-foreground font-data mt-0.5">{agencyId}</p>
          )}
          {info?.slug && (
            <p className="text-xs text-muted-foreground mt-0.5">{info.slug}</p>
          )}
        </div>

        {/* KPI strip */}
        <StaggerContainer
          className="grid grid-cols-2 lg:grid-cols-5 gap-4"
          role="region"
          aria-label="Agency key metrics"
        >
          {[
            {
              label: 'Active Policies',
              end: s?.active_policies ?? 0,
              sub: s ? fmt$(s.active_premium) + '/mo' : '',
              icon: ShieldCheck,
              accent: undefined,
            },
            {
              label: '90-Day Retention',
              end: s?.retention_pct ?? 0,
              fmt: (n: number) => n > 0 ? `${n}%` : '—',
              sub: s ? `${s.retained_90d} of ${s.eligible_90d} eligible` : '',
              icon: TrendingUp,
              color: s ? retentionColor(s.retention_pct) : 'text-muted-foreground',
              accent: s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90
                ? 'hsl(142 71% 45% / 0.4)' : 'hsl(38 92% 50% / 0.4)',
            },
            {
              label: 'At-Risk',
              end: s?.at_risk_count ?? 0,
              sub: 'flagged policies',
              icon: AlertTriangle,
              color: (s?.at_risk_count ?? 0) > 0 ? 'text-red-400' : 'text-muted-foreground',
              accent: (s?.at_risk_count ?? 0) > 0 ? 'hsl(0 84% 60% / 0.4)' : undefined,
            },
            {
              label: 'Agents',
              end: totalAgents,
              sub: 'writing agents',
              icon: Users,
              accent: undefined,
            },
            {
              label: 'Avg Premium',
              end: s && s.active_policies > 0 ? Math.round(s.active_premium / s.active_policies) : 0,
              fmt: (n: number) => n > 0 ? fmt$(n) : '—',
              sub: 'per active policy',
              icon: DollarSign,
              accent: undefined,
            },
          ].map(c => (
            <StaggerItem key={c.label}>
              <HudFrame accentColor={c.accent}>
                <Card className="border-border" role="group" aria-label={`${c.label}: ${c.fmt ? c.fmt(c.end) : c.end}`}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                        <CountUp
                          end={c.end}
                          format={c.fmt}
                          className={`text-2xl font-bold mt-0.5 block ${c.color ?? 'text-foreground'}`}
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-cyan-500/10" aria-hidden="true">
                        <c.icon size={16} className="text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </HudFrame>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Retention trend (recent vs prior 3-month) */}
        {s?.recent_3mo_pct !== null && s?.prior_3mo_pct !== null && s?.recent_3mo_pct !== undefined && s?.prior_3mo_pct !== undefined && (
          <Card className="border-border">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Recent 3-Month Retention</p>
                  <p className={`text-lg font-bold ${retentionColor(s.recent_3mo_pct)}`}>
                    {s.recent_3mo_pct}%
                  </p>
                </div>
                <div className="text-muted-foreground">vs</div>
                <div>
                  <p className="text-xs text-muted-foreground">Prior 3-Month</p>
                  <p className={`text-lg font-bold ${retentionColor(s.prior_3mo_pct)}`}>
                    {s.prior_3mo_pct}%
                  </p>
                </div>
                {s.recent_3mo_pct !== s.prior_3mo_pct && (
                  <Badge className={`text-xs px-2 py-0.5 ${
                    s.recent_3mo_pct > s.prior_3mo_pct
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  } border`}>
                    {s.recent_3mo_pct > s.prior_3mo_pct ? '↑' : '↓'}{' '}
                    {Math.abs(Math.round((s.recent_3mo_pct - s.prior_3mo_pct) * 10) / 10)}pp
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Agents table */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-foreground">Agents</CardTitle>
                <Badge className="bg-primary/10 text-primary border-primary/20 border text-xs">
                  {filtered.length}
                </Badge>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* CSV export */}
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Export agents to CSV"
                  disabled={sorted.length === 0}
                >
                  <Download size={12} /> Export
                </button>
                {/* Search */}
                <div className="relative w-full sm:w-56">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search agent…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 bg-card h-8 text-sm"
                    aria-label="Search agents"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-background">
                  <TableHead
                    className="font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort('name')}
                  >
                    Agent <SortArrow k="name" />
                  </TableHead>
                  <TableHead
                    className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort('active_policies')}
                  >
                    Active <SortArrow k="active_policies" />
                  </TableHead>
                  <TableHead
                    className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort('active_monthly_premium')}
                  >
                    Premium/mo <SortArrow k="active_monthly_premium" />
                  </TableHead>
                  <TableHead
                    className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort('at_risk_policies')}
                  >
                    At-Risk <SortArrow k="at_risk_policies" />
                  </TableHead>
                  <TableHead
                    className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort('retention_pct')}
                  >
                    Retention <SortArrow k="retention_pct" />
                  </TableHead>
                  <TableHead
                    className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort('ap_this_month')}
                  >
                    MTD AP <SortArrow k="ap_this_month" />
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-center">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(a => (
                  <TableRow
                    key={a.agent_id}
                    className={`hover:bg-background transition-colors cursor-pointer ${
                      a.retention_pct !== null && a.retention_pct < 90 ? 'bg-red-500/5' : ''
                    }`}
                    onClick={() => handleAgentClick(a.agent_id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') handleAgentClick(a.agent_id); }}
                  >
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {a.agent_name ?? <span className="font-data text-xs text-muted-foreground">{a.agent_id}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground font-data">{a.agent_id}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground/80 font-data">
                      {a.active_policies.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-foreground/80 font-data">
                      {fmt$(a.active_monthly_premium)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={a.at_risk_policies > 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>
                        {a.at_risk_policies || '—'}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right ${retentionColor(a.retention_pct)}`}>
                      {a.retention_pct !== null ? `${a.retention_pct}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-foreground/80 font-data">
                      {a.ap_this_month > 0 ? fmt$(a.ap_this_month) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {retentionBadge(a.retention_pct)}
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        aria-label={`View ${a.agent_name ?? a.agent_id} details`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      {agents.length === 0 ? 'No agents found for this agency.' : 'No agents match your search.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination controls */}
            {sorted.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-sm">
                <span className="text-muted-foreground">
                  Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} agents
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="p-1.5 rounded-md hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} className="text-muted-foreground" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={`min-w-[28px] h-7 rounded-md text-xs font-medium transition-all ${
                        i === safePage
                          ? 'gradient-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="p-1.5 rounded-md hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} className="text-muted-foreground" />
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
