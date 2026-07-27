import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, FadeIn, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { Trophy, TrendingUp, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react';

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
}

type SortKey = 'rank' | 'retention' | 'policies' | 'premium' | 'at_risk';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
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

// ── Component ──────────────────────────────────────────────────────────────
export function LeaderboardPage() {
  const [rows, setRows] = useState<AgencyLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<'all' | 'above' | 'below'>('all');

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

      // Build ranked rows — rank by retention descending, then by active premium descending as tiebreak
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
    }

    load();
  }, []);

  // Stats
  const stats = useMemo(() => {
    const total = rows.length;
    const above = rows.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length;
    const below = total - above;
    const totalPolicies = rows.reduce((s, r) => s + r.active_policies, 0);
    const totalPremium = rows.reduce((s, r) => s + r.active_premium, 0);
    return { total, above, below, totalPolicies, totalPremium };
  }, [rows]);

  // Sort + filter
  const displayed = useMemo(() => {
    let filtered = [...rows];
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
        default: return 0;
      }
    });
    return filtered;
  }, [rows, sortKey, sortAsc, filter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'rank'); }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return <span className="ml-0.5 text-[10px]">{sortAsc ? '▲' : '▼'}</span>;
  }

  return (
    <div>
      <Header title="Agency Leaderboard" />
      <div className="p-6 space-y-6">

        {/* Stats strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Total Agencies', end: stats.total, icon: Trophy, color: 'text-primary', bg: 'bg-cyan-500/10' },
            { title: 'Above 90% Target', end: stats.above, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { title: 'Below 90% Target', end: stats.below, icon: AlertTriangle, color: stats.below > 0 ? 'text-red-400' : 'text-muted-foreground/70', bg: stats.below > 0 ? 'bg-red-500/10' : 'bg-secondary' },
            { title: 'Total Active Premium', end: stats.totalPremium, icon: TrendingUp, color: 'text-foreground/80', bg: 'bg-secondary', fmt: (n: number) => fmt$(n) + '/mo' },
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
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-background text-xs font-semibold text-muted-foreground border-b border-border/50">
                  <span
                    className="col-span-1 cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort('rank')}
                  >Rank <SortArrow k="rank" /></span>
                  <span className="col-span-3">Agency</span>
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
                      className={`grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-background/80 transition-colors ${
                        r.rank <= 3 ? 'bg-amber-500/10/20' : ''
                      }`}
                    >
                      <span className="col-span-1 text-center">{rankBadge(r.rank)}</span>
                      <span className="col-span-3 font-medium text-foreground truncate">
                        {r.name ?? <span className="font-data text-xs text-muted-foreground/70">{r.agency_id.slice(0, 12)}…</span>}
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
                      <span className={`col-span-1 text-center font-medium font-data ${r.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/40'}`}>
                        {r.at_risk_count || '—'}
                      </span>
                      <span className="col-span-1 text-center">
                        <Link to={`/agencies/${r.agency_id}`}>
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
