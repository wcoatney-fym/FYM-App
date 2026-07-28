/**
 * Agency Leaderboard — Enhanced
 *
 * Period toggles: All Time, This Year, This Month, This Week, Today
 * Metric toggle: Policies ↔ Annual Premium
 * Sortable columns, retention filter, drill-down to agency production.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  Trophy, TrendingUp, ShieldCheck, AlertTriangle, ChevronRight,
  ChevronDown, ChevronUp, Calendar, DollarSign, FileText,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgencyLeaderRow {
  agency_id: string;
  name: string | null;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  rank: number;
  // Period-specific
  period_policies: number;
  period_ap: number;
}

type SortKey = 'rank' | 'retention' | 'policies' | 'premium' | 'at_risk' | 'period_policies' | 'period_ap';
type Period = 'all' | 'year' | 'month' | 'week' | 'today';
type Metric = 'policies' | 'premium';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function retentionBg(pct: number | null) {
  if (pct === null) return 'bg-secondary';
  if (pct >= 90) return 'bg-emerald-500/10';
  if (pct >= 85) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm font-bold text-muted-foreground/70 tabular-nums">#{rank}</span>;
}

function periodLabel(p: Period) {
  switch (p) {
    case 'all': return 'All Time';
    case 'year': return 'This Year';
    case 'month': return 'This Month';
    case 'week': return 'This Week';
    case 'today': return 'Today';
  }
}

function periodStart(p: Period): string | null {
  if (p === 'all') return null;
  const now = new Date();
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

  switch (p) {
    case 'year':
      return `${ct.getFullYear()}-01-01`;
    case 'month':
      return `${ct.getFullYear()}-${String(ct.getMonth() + 1).padStart(2, '0')}-01`;
    case 'week': {
      const day = ct.getDay();
      const diff = ct.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(ct);
      monday.setDate(diff);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }
    case 'today':
      return `${ct.getFullYear()}-${String(ct.getMonth() + 1).padStart(2, '0')}-${String(ct.getDate()).padStart(2, '0')}`;
  }
}

// ── Component ──────────────────────────────────────────────────────────────
export function LeaderboardPage() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [rows, setRows] = useState<AgencyLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<'all' | 'above' | 'below'>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [metric, setMetric] = useState<Metric>('policies');

  // Cache period data
  const [periodData, setPeriodData] = useState<Map<string, { policies: number; ap: number }>>(new Map());

  // Battle wins per agency (trophy count badge)
  const [agencyBattleWins, setAgencyBattleWins] = useState<Map<string, number>>(new Map());

  const loadPeriodData = useCallback(async (p: Period) => {
    if (!supabase) return;
    const start = periodStart(p);
    if (!start) {
      setPeriodData(new Map());
      return;
    }

    // Query policy_cache for the period
    const PAGE = 1000;
    let offset = 0;
    let done = false;
    const agMap = new Map<string, { policies: number; ap: number }>();

    while (!done) {
      const { data } = await supabase
        .from('policy_cache')
        .select('agency_id, plan_premium')
        .gte('policy_effective_date', start)
        .in('product_type', ['HI', 'HHC'])
        .range(offset, offset + PAGE - 1);

      if (!data || data.length === 0) { done = true; break; }

      data.forEach((r: any) => {
        const aid = r.agency_id || 'unknown';
        const existing = agMap.get(aid) || { policies: 0, ap: 0 };
        existing.policies += 1;
        existing.ap += (Number(r.plan_premium) || 0) * 12;
        agMap.set(aid, existing);
      });

      if (data.length < PAGE) done = true;
      else offset += PAGE;
    }

    setPeriodData(agMap);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    async function load() {
      // Retention summary
      const { data: summaryData } = await supabase!
        .from('agency_retention_summary')
        .select('agency_id, active_policies, active_premium, at_risk_count, retained_90d, eligible_90d, retention_pct');

      if (!summaryData || summaryData.length === 0) { setLoading(false); return; }

      // Agency names
      const { data: agencyNames } = await (supabase as any)
        .from('agencies')
        .select('tracker_id, name');
      const nameMap = new Map<string, string>();
      if (agencyNames) {
        for (const a of agencyNames as any[]) {
          if (a.tracker_id) nameMap.set(a.tracker_id, a.name);
        }
      }

      // Build ranked rows
      const ranked = (summaryData as any[])
        .map(r => ({
          agency_id: r.agency_id as string,
          name: nameMap.get(r.agency_id) ?? null,
          active_policies: Number(r.active_policies) || 0,
          active_premium: Number(r.active_premium) || 0,
          at_risk_count: Number(r.at_risk_count) || 0,
          retained_90d: Number(r.retained_90d) || 0,
          eligible_90d: Number(r.eligible_90d) || 0,
          retention_pct: r.retention_pct !== null ? Number(r.retention_pct) : null,
          rank: 0,
          period_policies: 0,
          period_ap: 0,
        }))
        .sort((a, b) => {
          const retA = a.retention_pct ?? -1;
          const retB = b.retention_pct ?? -1;
          if (retB !== retA) return retB - retA;
          return b.active_premium - a.active_premium;
        });

      ranked.forEach((r, i) => { r.rank = i + 1; });
      setRows(ranked);
      setLoading(false);

      // Battle wins per agency — light-touch trophy badge
      const PAGE = 100;
      let offset = 0;
      let done = false;
      const winMap = new Map<string, number>();
      while (!done) {
        const { data: winData } = await (supabase as any)
          .from('battle_participants')
          .select('agency_id')
          .eq('is_winner', true)
          .not('agency_id', 'is', null)
          .range(offset, offset + PAGE - 1);
        if (!winData || winData.length === 0) { done = true; break; }
        for (const w of winData as any[]) {
          if (!w.agency_id) continue;
          winMap.set(w.agency_id, (winMap.get(w.agency_id) || 0) + 1);
        }
        if (winData.length < PAGE) done = true;
        else offset += PAGE;
      }
      setAgencyBattleWins(winMap);
    }

    load();
  }, []);

  // Load period data when period changes
  useEffect(() => {
    loadPeriodData(period);
  }, [period, loadPeriodData]);

  // Merge period data into rows
  const enrichedRows = useMemo(() => {
    if (period === 'all') return rows;
    return rows.map(r => ({
      ...r,
      period_policies: periodData.get(r.agency_id)?.policies || 0,
      period_ap: periodData.get(r.agency_id)?.ap || 0,
    }));
  }, [rows, period, periodData]);

  // Stats
  const stats = useMemo(() => {
    const total = enrichedRows.length;
    const above = enrichedRows.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length;
    const below = total - above;
    const totalPolicies = period === 'all'
      ? enrichedRows.reduce((s, r) => s + r.active_policies, 0)
      : enrichedRows.reduce((s, r) => s + r.period_policies, 0);
    const totalPremium = period === 'all'
      ? enrichedRows.reduce((s, r) => s + r.active_premium, 0)
      : enrichedRows.reduce((s, r) => s + r.period_ap, 0);
    return { total, above, below, totalPolicies, totalPremium };
  }, [enrichedRows, period]);

  // Sort + filter
  const displayed = useMemo(() => {
    let filtered = [...enrichedRows];
    if (filter === 'above') filtered = filtered.filter(r => r.retention_pct !== null && r.retention_pct >= 90);
    if (filter === 'below') filtered = filtered.filter(r => r.retention_pct === null || r.retention_pct < 90);

    const dir = sortAsc ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'rank': return dir * (a.rank - b.rank);
        case 'retention': return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        case 'policies': return dir * (a.active_policies - b.active_policies);
        case 'premium': return dir * (a.active_premium - b.active_premium);
        case 'at_risk': return dir * (a.at_risk_count - b.at_risk_count);
        case 'period_policies': return dir * (a.period_policies - b.period_policies);
        case 'period_ap': return dir * (a.period_ap - b.period_ap);
        default: return 0;
      }
    });
    return filtered;
  }, [enrichedRows, sortKey, sortAsc, filter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'rank'); }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc
      ? <ChevronUp size={10} className="inline ml-0.5" />
      : <ChevronDown size={10} className="inline ml-0.5" />;
  }

  return (
    <div>
      <Header title="Agency Leaderboard" />
      <div className="p-6 space-y-6">

        {/* Period + Metric Toggles */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Period */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
            {(['all', 'year', 'month', 'week', 'today'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p
                    ? 'gradient-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>

          {/* Metric toggle — only shows for period views */}
          {period !== 'all' && (
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
              <button
                onClick={() => setMetric('policies')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  metric === 'policies'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText size={12} /> Policies
              </button>
              <button
                onClick={() => setMetric('premium')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  metric === 'premium'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <DollarSign size={12} /> Premium
              </button>
            </div>
          )}

          {period !== 'all' && (
            <span className="text-xs text-muted-foreground/60 ml-auto">
              <Calendar size={12} className="inline mr-1" />
              {periodLabel(period)} — new business effective dates
            </span>
          )}
        </div>

        {/* Stats strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Total Agencies', end: stats.total, icon: Trophy, color: 'text-primary', bg: 'bg-cyan-500/10' },
            { title: 'Above 90% Target', end: stats.above, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { title: 'Below 90% Target', end: stats.below, icon: AlertTriangle, color: stats.below > 0 ? 'text-red-400' : 'text-muted-foreground/70', bg: stats.below > 0 ? 'bg-red-500/10' : 'bg-secondary' },
            {
              title: period === 'all' ? 'Total Active Premium' : `${periodLabel(period)} Production`,
              end: metric === 'premium' || period === 'all' ? stats.totalPremium : stats.totalPolicies,
              icon: TrendingUp,
              color: 'text-foreground/80',
              bg: 'bg-secondary',
              fmt: metric === 'premium' || period === 'all'
                ? (n: number) => fmt$(n) + (period === 'all' ? '/mo' : '')
                : (n: number) => `${n.toLocaleString()} policies`,
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border">
                <CardContent className="p-4">
                  {loading ? (
                    <div className="h-12 rounded shimmer" />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                        <CountUp
                          end={card.end}
                          format={card.fmt}
                          className="text-xl font-bold text-foreground mt-0.5 block"
                        />
                      </div>
                      <div className={`p-2 rounded-lg ${card.bg}`}>
                        <card.icon size={18} className={card.color} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {([['all', 'All'], ['above', '≥ 90%'], ['below', '< 90%']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === key
                  ? 'gradient-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground/70">
            {displayed.length} {displayed.length === 1 ? 'agency' : 'agencies'}
          </span>
        </div>

        {/* Leaderboard table */}
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded shimmer" />)}
              </div>
            ) : displayed.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground/70">
                No agencies match the current filter.
              </div>
            ) : (
              <>
                <div className={`grid gap-2 px-4 py-2.5 bg-background text-xs font-semibold text-muted-foreground border-b border-border/50 ${
                  period !== 'all' ? 'grid-cols-13' : 'grid-cols-12'
                }`}>
                  <span
                    className="col-span-1 cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('rank')}
                  >Rank <SortArrow k="rank" /></span>
                  <span className={period !== 'all' ? 'col-span-2' : 'col-span-3'}>Agency</span>
                  <span
                    className="col-span-2 text-center cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('retention')}
                  >90-Day Retention <SortArrow k="retention" /></span>
                  <span
                    className="col-span-2 text-right cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('policies')}
                  >Active <SortArrow k="policies" /></span>
                  <span
                    className="col-span-2 text-right cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('premium')}
                  >Premium/mo <SortArrow k="premium" /></span>
                  {period !== 'all' && (
                    <span
                      className="col-span-2 text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort(metric === 'policies' ? 'period_policies' : 'period_ap')}
                    >
                      {periodLabel(period)} {metric === 'policies' ? 'Policies' : 'AP'}
                      <SortArrow k={metric === 'policies' ? 'period_policies' : 'period_ap'} />
                    </span>
                  )}
                  <span
                    className="col-span-1 text-center cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('at_risk')}
                  >At-Risk <SortArrow k="at_risk" /></span>
                  <span className="col-span-1" />
                </div>
                <div className="divide-y divide-border/30">
                  {displayed.map((r) => (
                    <div
                      key={r.agency_id}
                      className={`grid gap-2 px-4 py-3 items-center text-sm hover:bg-background/80 transition-colors ${
                        period !== 'all' ? 'grid-cols-13' : 'grid-cols-12'
                      } ${r.rank <= 3 ? 'bg-amber-500/10' : ''} ${
                        !isOrgWide && effectiveAgencyId === r.agency_id ? 'ring-1 ring-primary/40 bg-primary/5' : ''
                      }`}
                    >
                      <span className="col-span-1 text-center">{rankBadge(r.rank)}</span>
                      <span className={`font-medium text-foreground truncate flex items-center gap-1.5 ${period !== 'all' ? 'col-span-2' : 'col-span-3'}`}>
                        <span className="truncate">
                          {r.name ?? <span className="font-data text-xs text-muted-foreground/70">{r.agency_id.slice(0, 12)}…</span>}
                          {!isOrgWide && effectiveAgencyId === r.agency_id && (
                            <span className="ml-1.5 text-[10px] text-primary font-semibold">YOU</span>
                          )}
                        </span>
                        {(agencyBattleWins.get(r.agency_id) || 0) > 0 && (
                          <span className="text-[10px] font-data text-amber-400 whitespace-nowrap" title="Battle wins">
                            🏆 x{agencyBattleWins.get(r.agency_id)}
                          </span>
                        )}
                      </span>
                      <span className="col-span-2 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${retentionBg(r.retention_pct)} ${retentionColor(r.retention_pct)}`}>
                          {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                        </span>
                      </span>
                      <span className="col-span-2 text-right text-foreground/80 font-data">
                        {r.active_policies.toLocaleString()}
                      </span>
                      <span className="col-span-2 text-right text-foreground/80 font-data">
                        {fmt$(r.active_premium)}
                      </span>
                      {period !== 'all' && (
                        <span className={`col-span-2 text-right font-data font-medium ${
                          (metric === 'policies' ? r.period_policies : r.period_ap) > 0
                            ? 'text-primary'
                            : 'text-muted-foreground/40'
                        }`}>
                          {metric === 'policies'
                            ? (r.period_policies > 0 ? r.period_policies.toLocaleString() : '—')
                            : (r.period_ap > 0 ? fmt$(r.period_ap) : '—')
                          }
                        </span>
                      )}
                      <span className={`col-span-1 text-center font-medium font-data ${r.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/40'}`}>
                        {r.at_risk_count || '—'}
                      </span>
                      <span className="col-span-1 text-center">
                        <Link to={`/production/${r.agency_id}`}>
                          <ChevronRight size={16} className="text-muted-foreground/40 hover:text-primary transition-colors" />
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
