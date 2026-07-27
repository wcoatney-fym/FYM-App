import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem, FadeIn, CountUp, RadialGauge } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { Link, Navigate } from 'react-router-dom';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, AlertTriangle, Building2, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface ProductionSnap {
  policiesThisMonth: number;
  apThisMonth: number;
  policiesLastMonth: number;
  apLastMonth: number;
  trend: { month: string; policies: number; ap: number }[];
}

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
  const { effectiveRole } = useEffectiveAuth();
  const [stats, setStats] = useState<DashStats | null>(null);
  const [trend, setTrend] = useState<CohortPoint[]>([]);
  const [bottomAgencies, setBottomAgencies] = useState<AgencyRisk[]>([]);
  const [production, setProduction] = useState<ProductionSnap | null>(null);
  const [loading, setLoading] = useState(true);

  // Agents don't get the org/agency dashboard — send them to their personal book health view.
  if (effectiveRole === 'agent') {
    return <Navigate to="/my-health" replace />;
  }

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

      // ── 3. Production snapshot from monthly_production ──
      const { data: monthProd } = await supabase!
        .from('monthly_production')
        .select('month, policies, annual_premium');

      if (monthProd) {
        const byMonth = new Map<string, { policies: number; ap: number }>();
        for (const r of monthProd as any[]) {
          const existing = byMonth.get(r.month) || { policies: 0, ap: 0 };
          existing.policies += Number(r.policies);
          existing.ap += Number(r.annual_premium);
          byMonth.set(r.month, existing);
        }

        const now = new Date();
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

        const thisM = byMonth.get(thisMonthKey) || { policies: 0, ap: 0 };
        const lastM = byMonth.get(lastMonthKey) || { policies: 0, ap: 0 };

        const trendArr = Array.from(byMonth.entries())
          .map(([month, v]) => ({ month, ...v }))
          .sort((a, b) => a.month.localeCompare(b.month))
          .slice(-6);

        setProduction({
          policiesThisMonth: thisM.policies,
          apThisMonth: thisM.ap,
          policiesLastMonth: lastM.policies,
          apLastMonth: lastM.ap,
          trend: trendArr,
        });
      }

      setLoading(false);
    }

    load();
  }, []);

  const s = stats;

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* ── KPI strip with HUD frames + animations ── */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Policies */}
          <StaggerItem>
            <HudFrame>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Active Policies</p>
                        <CountUp
                          end={s?.active_policies ?? 0}
                          className="text-2xl font-bold text-foreground mt-1 block"
                        />
                        {s && <p className="text-xs text-muted-foreground/70 mt-0.5 font-data">{fmt$(s.active_premium)}/mo premium</p>}
                      </div>
                      <div className="p-2.5 rounded-lg bg-cyan-500/10">
                        <ShieldCheck size={20} className="text-primary" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* 90-Day Retention — radial gauge */}
          <StaggerItem>
            <HudFrame accentColor={
              s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90
                ? 'hsl(142 71% 45% / 0.5)'
                : 'hsl(38 92% 50% / 0.5)'
            }>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <RadialGauge
                        value={s?.retention_pct ?? 0}
                        label="90-day"
                        size={90}
                        strokeWidth={8}
                      />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">90-Day Retention</p>
                        <p className={`text-xs mt-1 ${s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90 ? 'On target ≥ 90%' : 'Below 90% target'}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* At-Risk Policies */}
          <StaggerItem>
            <HudFrame accentColor="hsl(0 84% 60% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">At-Risk Policies</p>
                        <CountUp
                          end={s?.at_risk_count ?? 0}
                          className="text-2xl font-bold text-foreground mt-1 block"
                        />
                        {s && s.at_risk_premium > 0 && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 font-data">{fmt$(s.at_risk_premium)}/mo exposed</p>
                        )}
                      </div>
                      <div className="p-2.5 rounded-lg bg-red-500/10">
                        <AlertTriangle size={20} className="text-red-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* Agencies Below 90% */}
          <StaggerItem>
            <HudFrame accentColor={
              s && s.agencies_below_target > 0
                ? 'hsl(0 84% 60% / 0.5)'
                : 'hsl(142 71% 45% / 0.5)'
            }>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Agencies Below 90%</p>
                        <CountUp
                          end={s?.agencies_below_target ?? 0}
                          className="text-2xl font-bold text-foreground mt-1 block"
                        />
                        {s && <p className="text-xs text-muted-foreground/70 mt-0.5">of {s.total_agencies} total</p>}
                      </div>
                      <div className={`p-2.5 rounded-lg ${s && s.agencies_below_target > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                        <Building2 size={20} className={s && s.agencies_below_target > 0 ? 'text-red-400' : 'text-emerald-400'} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Production Snapshot ── */}
        {production && (
          <FadeIn delay={0.35}>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">Production Snapshot</CardTitle>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">This month vs last month</p>
                  </div>
                  <Link
                    to="/production"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Full production view <ChevronRight size={12} />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Policies This Month</p>
                    <p className="text-2xl font-bold text-foreground font-data">{production.policiesThisMonth.toLocaleString()}</p>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${production.policiesThisMonth >= production.policiesLastMonth ? 'text-emerald-400' : 'text-red-400'}`}>
                      {production.policiesThisMonth >= production.policiesLastMonth ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {production.policiesLastMonth > 0 ? Math.abs(Math.round(((production.policiesThisMonth - production.policiesLastMonth) / production.policiesLastMonth) * 100)) : 100}% vs last month
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">AP This Month</p>
                    <p className="text-2xl font-bold text-foreground font-data">{fmt$(production.apThisMonth)}</p>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${production.apThisMonth >= production.apLastMonth ? 'text-emerald-400' : 'text-red-400'}`}>
                      {production.apThisMonth >= production.apLastMonth ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {production.apLastMonth > 0 ? Math.abs(Math.round(((production.apThisMonth - production.apLastMonth) / production.apLastMonth) * 100)) : 100}% vs last month
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Policies Last Month</p>
                    <p className="text-xl font-semibold text-muted-foreground font-data">{production.policiesLastMonth.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">AP Last Month</p>
                    <p className="text-xl font-semibold text-muted-foreground font-data">{fmt$(production.apLastMonth)}</p>
                  </div>
                </div>
                {/* Mini 6-month trend */}
                <div className="mt-4 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={production.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(m: string) => { const [,mo] = m.split('-'); const ms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return ms[parseInt(mo) - 1] || m; }}
                        stroke="hsl(215 20% 55%)"
                        fontSize={10}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(217 33% 20%)', background: 'hsl(222 47% 9%)', color: 'hsl(210 40% 98%)', fontSize: 11 }}
                        formatter={(v: number, name: string) => [name === 'policies' ? v.toLocaleString() : fmt$(v), name === 'policies' ? 'Policies' : 'AP']}
                      />
                      <Line type="monotone" dataKey="policies" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}

        {/* ── Retention trend chart ── */}
        <FadeIn delay={0.4}>
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
                <div className="h-72 rounded shimmer" />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                      <XAxis dataKey="month" stroke="hsl(215 20% 55%)" fontSize={12} />
                      <YAxis domain={[70, 105]} stroke="hsl(215 20% 55%)" fontSize={12} tickFormatter={v => `${v}%`} />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          v !== null ? `${v}%` : '—',
                          name === 'combined' ? 'Combined' : name === 'hi' ? 'HI' : 'HHC',
                        ]}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(217 33% 20%)',
                          background: 'hsl(222 47% 9%)',
                          color: 'hsl(210 40% 98%)',
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="combined" stroke="hsl(199 89% 48%)" strokeWidth={2.5}
                        dot={{ fill: 'hsl(199 89% 48%)', r: 4, stroke: 'hsl(199 89% 48%)', strokeWidth: 0 }}
                        activeDot={{ r: 6, stroke: 'hsl(199 89% 48%)', strokeWidth: 2, fill: 'hsl(222 47% 8%)' }}
                        connectNulls />
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
        </FadeIn>

        {/* ── Bottom agencies coaching panel ── */}
        {!loading && bottomAgencies.length > 0 && (
          <FadeIn delay={0.6}>
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
                <div className="divide-y divide-border/30">
                  <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data">
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
                      className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm items-center row-hover ${
                        a.retention_pct !== null && a.retention_pct < 90 ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <span className="col-span-2 font-medium text-foreground truncate">
                        {a.name ?? <span className="font-data text-xs text-muted-foreground/70">{a.agency_id.slice(0, 8)}…</span>}
                      </span>
                      <span className="text-right text-muted-foreground font-data">{a.active_policies.toLocaleString()}</span>
                      <span className="text-right text-muted-foreground font-data">{fmt$(a.active_premium)}</span>
                      <span className={`text-right font-medium font-data ${a.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                        {a.at_risk_count || '—'}
                      </span>
                      <span className={`text-right font-semibold font-data ${retentionColor(a.retention_pct)}`}>
                        {a.retention_pct !== null ? `${a.retention_pct}%` : '—'}
                      </span>
                      <span className="text-center">
                        <Link to={`/agencies/${a.agency_id}`}>
                          <ChevronRight size={14} className="text-muted-foreground/40 hover:text-primary transition-colors" />
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}
      </div>
    </div>
  );
}
