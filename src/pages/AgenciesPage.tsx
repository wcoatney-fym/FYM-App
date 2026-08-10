/**
 * AgenciesPage — Agency Directory
 *
 * Audit fixes (2026-08-04):
 * 1. Column sorting (ChevronUp/Down pattern from LeaderboardPage)
 * 2. Entire row clickable + removed misleading cursor-pointer
 * 3. Retention filter toggle (All / Below Target / On Target)
 * 4. KPI card values bumped to text-3xl (match Dashboard)
 * 5. CSV export button
 * 6. aria-labels on search + chevron
 * 7. Debounce name loading flash — preload names, show shimmer until ready
 * 8. Pagination (25 per page)
 * 9. HudFrame on KPI cards
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import {
  Search, Building2, ChevronRight, ChevronUp, ChevronDown,
  Download, ChevronLeft, Zap,
} from 'lucide-react';
import { fmt$ } from '@/lib/formatUtils';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgencyRow {
  agency_id: string;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  eligible_90d: number;
  retained_90d: number;
  retention_pct: number | null;
  name?: string;
  slug?: string;
  is_active?: boolean;
  ghl_api_enabled?: boolean;
}

type SortKey = 'name' | 'active_policies' | 'active_premium' | 'at_risk_count' | 'eligible_90d' | 'retention_pct';
type RetentionFilter = 'all' | 'below' | 'on_target';

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
export function AgenciesPage() {
  const navigate = useNavigate();
  const { effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();
  const orgData = useOrgData();
  const [nameMap, setNameMap] = useState<Map<string, { name: string; slug?: string; is_active: boolean }>>(new Map());
  const [namesLoaded, setNamesLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('active_premium');
  const [sortAsc, setSortAsc] = useState(false);
  const [retentionFilter, setRetentionFilter] = useState<RetentionFilter>('all');
  const [page, setPage] = useState(0);

  // Load agency names from local Supabase (lightweight, not from Max's DB)
  useEffect(() => {
    if (!supabase) { setNamesLoaded(true); return; }
    (async () => {
      const { data: agencyNames } = await (supabase as any)
        .from('agencies')
        .select('id, writing_number, name, slug, is_active, ghl_api_enabled');
      if (agencyNames) {
        const nm = new Map<string, { name: string; slug?: string; is_active: boolean; ghl_api_enabled?: boolean }>();
        for (const a of agencyNames as any[]) {
          if (a.writing_number) nm.set(a.writing_number, { name: a.name, slug: a.slug ?? undefined, is_active: a.is_active, ghl_api_enabled: a.ghl_api_enabled ?? false });
        }
        setNameMap(nm);
      }
      setNamesLoaded(true);
    })();
  }, []);

  // Derive rows from OrgDataCache — wait for names so there's no flash of raw IDs
  const dataReady = !orgData.initialLoading || orgData.retentionAgencies.length > 0;
  const loading = !dataReady || !namesLoaded;

  const rows = useMemo((): AgencyRow[] => {
    const stats = orgData.retentionAgencies;
    if (!stats || stats.length === 0) return [];
    return stats.map(s => {
      // Name priority: 1) agencies table lookup (canonical), 2) edge function ga_name from Max's DB
      const lookup = nameMap.get(s.agency_id);
      const edgeName = (s as any).agency_name as string | null;
      // Title-case the ga_name from Max's DB (it comes in ALL CAPS)
      const formattedEdgeName = edgeName
        ? edgeName.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        : undefined;
      return {
        agency_id: s.agency_id,
        active_policies: s.active_policies,
        active_premium: s.active_premium,
        at_risk_count: s.at_risk_count,
        eligible_90d: s.eligible_90d,
        retained_90d: s.retained_90d,
        retention_pct: s.retention_pct,
        name: lookup?.name ?? formattedEdgeName,
        slug: lookup?.slug,
        is_active: lookup?.is_active,
        ghl_api_enabled: (lookup as any)?.ghl_api_enabled,
      };
    });
  }, [orgData.retentionAgencies, nameMap]);

  // Managers / agency admins: redirect to their own agency detail
  if (!isOrgWide && (effectiveAgencyWritingNumber || effectiveAgencyId)) {
    return <Navigate to={`/agencies/${effectiveAgencyWritingNumber || effectiveAgencyId}`} replace />;
  }

  // Filter: search + retention
  const filtered = useMemo(() => {
    let result = rows;

    // Retention filter
    if (retentionFilter === 'below') {
      result = result.filter(r => r.retention_pct === null || r.retention_pct < 90);
    } else if (retentionFilter === 'on_target') {
      result = result.filter(r => r.retention_pct !== null && r.retention_pct >= 90);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        (r.name ?? r.agency_id).toLowerCase().includes(q) ||
        (r.slug ?? '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [rows, search, retentionFilter]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name': {
          const nameA = (a.name ?? a.agency_id).toLowerCase();
          const nameB = (b.name ?? b.agency_id).toLowerCase();
          return dir * nameA.localeCompare(nameB);
        }
        case 'active_policies': return dir * (a.active_policies - b.active_policies);
        case 'active_premium': return dir * (a.active_premium - b.active_premium);
        case 'at_risk_count': return dir * (a.at_risk_count - b.at_risk_count);
        case 'eligible_90d': return dir * (a.eligible_90d - b.eligible_90d);
        case 'retention_pct': return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Reset page when filters/search change
  useEffect(() => { setPage(0); }, [search, retentionFilter]);

  // KPI stats (from all rows, unfiltered)
  const totalPremium = rows.reduce((s, r) => s + r.active_premium, 0);
  const belowTarget = rows.filter(r => r.retention_pct !== null && r.retention_pct < 90).length;
  const onTarget = rows.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length;

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

  // Row click → navigate to agency detail
  const handleRowClick = useCallback((agencyId: string) => {
    navigate(`/agencies/${agencyId}`);
  }, [navigate]);

  // CSV export
  const handleExport = useCallback(() => {
    const headers = ['Agency', 'Slug', 'Active Policies', 'Premium/mo', 'At-Risk', 'Eligible 90d', 'Retention %', 'Status'];
    const csvRows = sorted.map(r => [
      escCsv(r.name ?? r.agency_id),
      escCsv(r.slug),
      r.active_policies,
      Math.round(r.active_premium),
      r.at_risk_count,
      r.eligible_90d,
      r.retention_pct !== null ? r.retention_pct : '',
      r.retention_pct === null ? '' : r.retention_pct >= 90 ? 'On target' : r.retention_pct >= 85 ? 'At risk' : 'Below target',
    ]);
    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fym-agencies-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [sorted]);

  return (
    <div>
      <Header title="Agencies" />
      <div className="p-6 space-y-4">

        {/* KPI strip — HudFrame wrapped, text-3xl values */}
        <StaggerContainer
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          role="region"
          aria-label="Agency key metrics"
        >
          {[
            {
              label: 'Total Agencies',
              end: rows.length,
              sub: 'writing active policies',
              accent: undefined,
            },
            {
              label: 'Active Premium',
              end: totalPremium,
              sub: '/mo across all agencies',
              fmt: (n: number) => fmt$(n),
              accent: undefined,
            },
            {
              label: 'On Target (≥90%)',
              end: onTarget,
              sub: 'retention ≥ 90%',
              color: 'text-emerald-400',
              accent: 'hsl(142 71% 45% / 0.4)',
            },
            {
              label: 'Below Target',
              end: belowTarget,
              sub: 'need coaching',
              color: belowTarget > 0 ? 'text-red-400' : 'text-foreground',
              accent: belowTarget > 0 ? 'hsl(0 84% 60% / 0.4)' : undefined,
            },
          ].map(c => (
            <StaggerItem key={c.label}>
              <HudFrame accentColor={c.accent}>
                <Card className="border-border" role="group" aria-label={`${c.label}: ${c.fmt ? c.fmt(c.end) : c.end}`}>
                  <CardContent className="py-4 px-5">
                    {loading ? (
                      <div className="h-14 rounded shimmer" aria-hidden="true" />
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                          <CountUp
                            end={c.end}
                            format={c.fmt}
                            className={`text-3xl font-bold mt-0.5 block ${c.color ?? 'text-foreground'}`}
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-cyan-500/10" aria-hidden="true">
                          <Building2 size={18} className="text-primary" />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </HudFrame>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base font-semibold text-foreground">Agency Directory</CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Retention filter toggle */}
                <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
                  {([
                    ['all', 'All'] as const,
                    ['below', 'Below 90%'] as const,
                    ['on_target', '≥ 90%'] as const,
                  ]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setRetentionFilter(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        retentionFilter === key
                          ? 'gradient-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* CSV export */}
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Export agencies to CSV"
                  disabled={sorted.length === 0}
                >
                  <Download size={12} /> Export
                </button>
                {/* Search */}
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search agency…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 bg-card h-8 text-sm"
                    aria-label="Search agencies"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded shimmer" aria-hidden="true" />)}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-background">
                      <TableHead
                        className="font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('name')}
                      >
                        Agency <SortArrow k="name" />
                      </TableHead>
                      <TableHead
                        className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('active_policies')}
                      >
                        Active <SortArrow k="active_policies" />
                      </TableHead>
                      <TableHead
                        className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('active_premium')}
                      >
                        Premium/mo <SortArrow k="active_premium" />
                      </TableHead>
                      <TableHead
                        className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('at_risk_count')}
                      >
                        At-Risk <SortArrow k="at_risk_count" />
                      </TableHead>
                      <TableHead
                        className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('eligible_90d')}
                      >
                        Eligible <SortArrow k="eligible_90d" />
                      </TableHead>
                      <TableHead
                        className="font-semibold text-muted-foreground text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('retention_pct')}
                      >
                        Retention <SortArrow k="retention_pct" />
                      </TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-center">Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map(r => (
                      <TableRow
                        key={r.agency_id}
                        className={`hover:bg-background transition-colors cursor-pointer ${r.retention_pct !== null && r.retention_pct < 90 ? 'bg-red-500/5' : ''}`}
                        onClick={() => handleRowClick(r.agency_id)}
                        role="link"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter') handleRowClick(r.agency_id); }}
                      >
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {r.name ?? <span className="font-data text-xs text-muted-foreground">{r.agency_id.slice(0, 8)}…</span>}
                          {r.ghl_api_enabled && (
                            <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 uppercase tracking-wider">
                              <Zap className="w-2.5 h-2.5 fill-green-400" />
                              GHL
                            </span>
                          )}
                          </div>
                          {r.slug && <div className="text-xs text-muted-foreground">{r.slug}</div>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground/80 font-data">
                          {r.active_policies.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-foreground/80 font-data">
                          {fmt$(r.active_premium)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={r.at_risk_count > 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>
                            {r.at_risk_count || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.eligible_90d > 0 ? r.eligible_90d.toLocaleString() : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className={`text-right ${retentionColor(r.retention_pct)}`}>
                          {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {retentionBadge(r.retention_pct)}
                        </TableCell>
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label={`View ${r.name ?? r.agency_id} details`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {paginated.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                          {rows.length === 0 ? 'No agency data yet — sync policy cache to populate.' : 'No agencies match your search.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Pagination controls */}
                {sorted.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-sm">
                    <span className="text-muted-foreground">
                      Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} agencies
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
