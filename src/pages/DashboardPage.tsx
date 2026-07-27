import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, TrendingUp, AlertTriangle, Building2, ChevronRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface DashStats {
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  at_risk_premium: number;
  retention_pct: number | null;
  agencies_below_target: number;
  total_agencies: number;
}

interface CohortPoint {
  month: string;
  hi: number | null;
  hhc: number | null;
  combined: number | null;
}

interface AgencyRisk {
  agency_id: string;
  name: string | null;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retention_pct: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

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

// ── Component ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [trend, setTrend] = useState<CohortPoint[]>([]);
  const [bottomAgencies, setBottomAgencies] = useState<AgencyRisk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    async function load() {
      // ── 1. Aggregate stats from agency_retention_summary ──
      const { data: agencyStats } = await supabase!
        .from('agency_retention_summary')
        .select('agency_id, active_policies, active_premium, at_risk_count, retained_90d, eligible_90d, retention_pct');

      let totalActive = 0, totalPremium = 0, totalAtRisk = 0, totalAtRiskPremium = 0;
      let totalRetained = 0, totalEligible = 0;
      let belowTarget = 0;
      const agencyRows: AgencyRisk[] = [];

      if (agencyStats) {
        for (const a of agencyStats as any[]) {
          totalActive += Number(a.active_policies) || 0;
          totalPremium += Number(a.active_premium) || 0;
          totalAtRisk += Number(a.at_risk_count) || 0;
          totalRetained += Number(a.retained_90d) || 0;
          totalEligible += Number(a.eligible_90d) || 0;
          if (a.retention_pct !== null && Number(a.retention_pct) < 90) belowTarget++;
          agencyRows.push({
            agency_id: a.agency_id,
            name: null,
            active_policies: Number(a.active_policies),
            active_premium: Number(a.active_premium),
            at_risk_count: Number(a.at_risk_count),
            retention_pct: a.retention_pct !== null ? Number(a.retention_pct) : null,
          });
        }
      }

      // Get at-risk premium from concentration view
      const { data: concData } = await supabase!
        .from('agency_concentration')
        .select('at_risk_premium');
      if (concData) {
        totalAtRiskPremium = (concData as any[]).reduce((s, r) => s + (Number(r.at_risk_premium) || 0), 0);
      }

      const overallRetention = totalEligible > 0
        ? Math.round((totalRetained / totalEligible) * 1000) / 10
        : null;

      setStats({
        active_policies: totalActive,
        active_premium: totalPremium,
        at_risk_count: totalAtRisk,
        at_risk_premium: totalAtRiskPremium,
        retention_pct: overallRetention,
        agencies_below_target: belowTarget,
        total_agencies: agencyRows.length,
      });

      // Enrich agency names
      const { data: agencyNames } = await (supabase as any)
        .from('agencies')
        .select('tracker_id, name');
      const nameMap = new Map<string, string>();
      if (agencyNames) {
        for (const a of agencyNames as any[]) {
          if (a.tracker_id) nameMap.set(a.tracker_id, a.name);
        }
      }

      // Bottom agencies by retention (coaching signals)
      const bottom = agencyRows
        .filter(a => a.retention_pct !== null)
        .map(a => ({ ...a, name: nameMap.get(a.agency_id) ?? null }))
        .sort((a, b) => (a.retention_pct ?? 100) - (b.retention_pct ?? 100))
        .slice(0, 8);
      setBottomAgencies(bottom);

      // ── 2. Cohort retention trend from cohort_retention view ──
      const { data: cohorts } = await supabase!
        .from('cohort_retention')
        .select('product_type, cohort_month, drafted_first, retained, retention_pct')
        .order('cohort_month', { ascending: true });

      if (cohorts) {
        const monthMap: Record<string, { hi: number | null; hhc: number | null; hiD: number; hiR: number; hhcD: number; hhcR: number }> = {};
        for (const c of cohorts as any[]) {
          const key = (c.cohort_month as string).slice(0, 7);
          if (!monthMap[key]) monthMap[key] = { hi: null, hhc: null, hiD: 0, hiR: 0, hhcD: 0, hhcR: 0 };
          const entry = monthMap[key];
          if (c.product_type === 'HI') {
            entry.hi = Number(c.retention_pct);
            entry.hiD += Number(c.drafted_first);
            entry.hiR += Number(c.retained);
          } else if (c.product_type === 'HHC') {
            entry.hhc = Number(c.retention_pct);
            entry.hhcD += Number(c.drafted_first);
            entry.hhcR += Number(c.retained);
          }
        }

        const trendPoints: CohortPoint[] = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-12)
          .map(([month, v]) => {
            const totalD = v.hiD + v.hhcD;
            const totalR = v.hiR + v.hhcR;
            const combined = totalD > 0 ? Math.round((totalR / totalD) * 1000) / 10 : null;
            return {
              month: fmtMonth(month + '-01'),
              hi: v.hi,
              hhc: v.hhc,
              combined,
            };
          });
        setTrend(trendPoints);
      }

      setLoading(false);
    }

    load();
  }, []);

  const s = stats;

  const kpiCards = [
    {
      title: 'Active Policies',
      value: s ? s.active_policies.toLocaleString() : '—',
      sub: s ? `${fmt$(s.active_premium)}/mo premium` : '',
      icon: ShieldCheck, color: 'text-primary', bg: 'bg-cyan-500/10',
    },
    {
      title: '90-Day Retention',
      value: s && s.retention_pct !== null ? `${s.retention_pct}%` : '—',
      sub: s && s.retention_pct !== null ? (s.retention_pct >= 90 ? 'On target ≥ 90%' : 'Below 90% target') : '',
      icon: TrendingUp,
      color: s && s.retention_pct !== null && s.retention_pct >= 90 ? 'text-emerald-400' : 'text-amber-400',
      bg: s && s.retention_pct !== null && s.retention_pct >= 90 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
    },
    {
      title: 'At-Risk Policies',
      value: s ? s.at_risk_count.toString() : '—',
      sub: s && s.at_risk_premium > 0 ? `${fmt$(s.at_risk_premium)}/mo exposed` : '',
      icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10',
    },
    {
      title: 'Agencies Below 90%',
      value: s ? `${s.agencies_below_target}` : '—',
      sub: s ? `of ${s.total_agencies} total` : '',
      icon: Building2,
      color: s && s.agencies_below_target > 0 ? 'text-red-400' : 'text-emerald-400',
      bg: s && s.agencies_below_target > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10',
    },
  ];

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* KPI strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card) => (
            <Card key={card.title} className="border-border">
              <CardContent className="p-5">
                {loading ? (
                  <div className="h-14 rounded bg-slate-100 animate-pulse" />
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                      {card.sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>}
                    </div>
                    <div className={`p-2.5 rounded-lg ${card.bg}`}>
                      <card.icon size={20} className={card.color} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Retention trend chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">90-Day Retention by Cohort</CardTitle>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Monthly cohorts · HI + HHC combined and by product
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-primary rounded" /> Combined
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-violet-500 rounded" /> HI
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-sky-500 rounded" /> HHC
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 rounded bg-slate-100 animate-pulse" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis domain={[70, 105]} stroke="#64748b" fontSize={12} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        v !== null ? `${v}%` : '—',
                        name === 'combined' ? 'Combined' : name === 'hi' ? 'HI' : 'HHC',
                      ]}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="combined" stroke="#1e3a5f" strokeWidth={2.5}
                      dot={{ fill: '#1e3a5f', r: 4 }} activeDot={{ r: 6 }} connectNulls />
                    <Line type="monotone" dataKey="hi" stroke="#8b5cf6" strokeWidth={1.5}
                      strokeDasharray="4 3" dot={false} connectNulls />
                    <Line type="monotone" dataKey="hhc" stroke="#0ea5e9" strokeWidth={1.5}
                      strokeDasharray="4 3" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom agencies coaching panel */}
        {!loading && bottomAgencies.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Agency Coaching Signals</CardTitle>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Lowest retention agencies — sorted worst first. Below 90% = coaching needed.
                  </p>
                </div>
                {stats && stats.agencies_below_target > 0 && (
                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border">
                    {stats.agencies_below_target} below target
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-background text-xs font-semibold text-muted-foreground">
                  <span className="col-span-2">Agency</span>
                  <span className="text-right">Active</span>
                  <span className="text-right">Premium/mo</span>
                  <span className="text-right">At-Risk</span>
                  <span className="text-right">Retention</span>
                  <span />
                </div>
                {bottomAgencies.map((a) => (
                  <div
                    key={a.agency_id}
                    className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm items-center ${
                      a.retention_pct !== null && a.retention_pct < 90 ? 'bg-red-500/10/30' : ''
                    }`}
                  >
                    <span className="col-span-2 font-medium text-foreground truncate">
                      {a.name ?? <span className="font-mono text-xs text-muted-foreground/70">{a.agency_id.slice(0, 8)}…</span>}
                    </span>
                    <span className="text-right text-muted-foreground">{a.active_policies.toLocaleString()}</span>
                    <span className="text-right text-muted-foreground">{fmt$(a.active_premium)}</span>
                    <span className={`text-right font-medium ${a.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                      {a.at_risk_count || '—'}
                    </span>
                    <span className={`text-right font-semibold ${retentionColor(a.retention_pct)}`}>
                      {a.retention_pct !== null ? `${a.retention_pct}%` : '—'}
                    </span>
                    <span className="text-center">
                      <Link to={`/agencies/${a.agency_id}`}>
                        <ChevronRight size={14} className="text-slate-300 hover:text-primary transition-colors" />
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
