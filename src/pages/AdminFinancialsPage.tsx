import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { scopeToAgency } from '@/lib/query-helpers';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { DollarSign, ShieldAlert, TrendingDown, AlertTriangle, ChevronRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface CohortRow {
  product_type: string;
  cohort_month: string;
  cohort_size: number;
  drafted_first: number;
  retained: number;
  retention_pct: number;
  active_premium: number;
}

interface ConcentrationRow {
  agency_id: string;
  name: string | null;
  active_count: number;
  active_premium: number;
  at_risk_count: number;
  at_risk_premium: number;
  at_risk_pct: number;
  premium_concentration_pct: number;
}

interface AgencySummaryRow {
  agency_id: string;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}
function retentionBadgeClass(pct: number) {
  if (pct >= 90) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (pct >= 85) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-red-500/10 text-red-400 border-red-500/20';
}
function fmt$(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}
function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// ── Component ──────────────────────────────────────────────────────────────
export function AdminFinancialsPage() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [concentration, setConcentration] = useState<ConcentrationRow[]>([]);
  const [agencySummaries, setAgencySummaries] = useState<AgencySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    async function load() {
      // Agency names map
      const { data: agencyNames } = await scopeToAgency(
        (supabase as any)
          .from('agencies')
          .select('tracker_id, name'),
        isOrgWide,
        effectiveAgencyId,
        'tracker_id'
      );
      const nameMap = new Map<string, string>();
      if (agencyNames) {
        for (const a of agencyNames as any[]) {
          if (a.tracker_id) nameMap.set(a.tracker_id, a.name);
        }
      }

      // Agency retention summary (aggregate KPIs)
      const { data: summaryData } = await scopeToAgency(
        supabase!
          .from('agency_retention_summary')
          .select('agency_id, active_policies, active_premium, at_risk_count, retained_90d, eligible_90d, retention_pct'),
        isOrgWide,
        effectiveAgencyId
      );
      if (summaryData) {
        setAgencySummaries(
          (summaryData as any[]).map(r => ({
            agency_id: r.agency_id,
            active_policies: Number(r.active_policies) || 0,
            active_premium: Number(r.active_premium) || 0,
            at_risk_count: Number(r.at_risk_count) || 0,
            retained_90d: Number(r.retained_90d) || 0,
            eligible_90d: Number(r.eligible_90d) || 0,
            retention_pct: r.retention_pct !== null ? Number(r.retention_pct) : null,
          }))
        );
      }

      // Cohort retention view
      // Note: view does not have agency_id — org-wide only
      const { data: cohortData } = await supabase!
        .from('cohort_retention')
        .select('*')
        .order('cohort_month', { ascending: false })
        .limit(24);
      if (cohortData) setCohorts(cohortData as unknown as CohortRow[]);

      // Concentration view — enriched with names
      const { data: concData } = await scopeToAgency(
        supabase!
          .from('agency_concentration')
          .select('*')
          .order('active_premium', { ascending: false })
          .limit(20),
        isOrgWide,
        effectiveAgencyId
      );
      if (concData) {
        setConcentration(
          (concData as any[]).map(r => ({
            ...r,
            active_premium: Number(r.active_premium) || 0,
            at_risk_premium: Number(r.at_risk_premium) || 0,
            at_risk_pct: Number(r.at_risk_pct) || 0,
            premium_concentration_pct: Number(r.premium_concentration_pct) || 0,
            name: nameMap.get(r.agency_id) ?? null,
          }))
        );
      }

      setLoading(false);
    }
    load();
  }, [effectiveAgencyId, isOrgWide]);

  // ── Derived stats from pre-computed views ────────────────────────────────
  const stats = useMemo(() => {
    const totalPremium = agencySummaries.reduce((s, r) => s + r.active_premium, 0);
    const totalActive = agencySummaries.reduce((s, r) => s + r.active_policies, 0);
    const totalAtRisk = agencySummaries.reduce((s, r) => s + r.at_risk_count, 0);
    const totalAtRiskPremium = concentration.reduce((s, r) => s + r.at_risk_premium, 0);
    const totalRetained = agencySummaries.reduce((s, r) => s + r.retained_90d, 0);
    const totalEligible = agencySummaries.reduce((s, r) => s + r.eligible_90d, 0);
    const blendedRetention = totalEligible > 0 ? Math.round((totalRetained / totalEligible) * 1000) / 10 : null;
    const flaggedConcentration = concentration.filter(c => c.premium_concentration_pct >= 10);

    // Product-level stats from cohort_retention (latest cohorts)
    const latestByProduct: Record<string, { active: number; premium: number; atRisk: number; atRiskPremium: number; retention: number | null }> = {};
    // Aggregate across all cohorts per product
    const productAgg: Record<string, { drafted: number; retained: number; premium: number }> = {};
    for (const c of cohorts) {
      const pt = c.product_type;
      if (!productAgg[pt]) productAgg[pt] = { drafted: 0, retained: 0, premium: 0 };
      productAgg[pt].drafted += c.drafted_first;
      productAgg[pt].retained += c.retained;
      productAgg[pt].premium += Number(c.active_premium) || 0;
    }

    for (const [pt, agg] of Object.entries(productAgg)) {
      latestByProduct[pt] = {
        active: 0, premium: agg.premium,
        atRisk: 0, atRiskPremium: 0,
        retention: agg.drafted > 0 ? Math.round((agg.retained / agg.drafted) * 1000) / 10 : null,
      };
    }

    return { totalPremium, totalActive, totalAtRisk, totalAtRiskPremium, blendedRetention, flaggedConcentration, latestByProduct };
  }, [agencySummaries, concentration, cohorts]);

  // Chart data — last 12 cohort months
  const retentionChartData = useMemo(() => {
    const months = [...new Set(cohorts.map(c => c.cohort_month))].sort().slice(-12);
    return months.map(month => {
      const hi = cohorts.find(c => c.cohort_month === month && c.product_type === 'HI');
      const hhc = cohorts.find(c => c.cohort_month === month && c.product_type === 'HHC');
      return {
        month: fmtMonth(month),
        HI: hi?.retention_pct ?? null,
        HHC: hhc?.retention_pct ?? null,
        target: 90,
      };
    });
  }, [cohorts]);

  // Concentration chart with names
  const concChartData = useMemo(() => {
    return concentration.slice(0, 10).map(c => ({
      name: c.name ?? c.agency_id.slice(0, 10),
      agency_id: c.agency_id,
      active_premium: c.active_premium,
      at_risk_premium: c.at_risk_premium,
    }));
  }, [concentration]);

  if (loading) {
    return (
      <div>
        <Header title="Financials" />
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-lg shimmer" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Financials" />
      <div className="p-6 space-y-6">

        {/* KPI strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Active Premium',
              end: stats.totalPremium,
              fmt: (n: number) => fmt$(n) + '/mo',
              sub: `${stats.totalActive.toLocaleString()} policies`,
              icon: DollarSign, color: 'text-primary', bg: 'bg-cyan-500/10',
            },
            {
              title: 'At-Risk Premium',
              end: stats.totalAtRiskPremium,
              fmt: (n: number) => fmt$(n),
              sub: `${stats.totalAtRisk} policies flagged`,
              icon: ShieldAlert,
              color: stats.totalAtRisk > 0 ? 'text-red-400' : 'text-muted-foreground/70',
              bg: stats.totalAtRisk > 0 ? 'bg-red-500/10' : 'bg-secondary',
            },
            {
              title: 'Blended Retention',
              end: stats.blendedRetention ?? 0,
              fmt: (n: number) => stats.blendedRetention !== null ? `${n.toFixed(1)}%` : '—',
              sub: '90-day, all products',
              icon: TrendingDown,
              color: stats.blendedRetention !== null ? retentionColor(stats.blendedRetention) : 'text-muted-foreground/70',
              bg: stats.blendedRetention !== null && stats.blendedRetention >= 90 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
            },
            {
              title: 'Concentration Risk',
              end: stats.flaggedConcentration.length,
              sub: 'agencies >10% of premium',
              icon: AlertTriangle,
              color: stats.flaggedConcentration.length > 0 ? 'text-amber-400' : 'text-muted-foreground/70',
              bg: stats.flaggedConcentration.length > 0 ? 'bg-amber-500/10' : 'bg-secondary',
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt}
                        className="text-2xl font-bold text-foreground mt-1 block"
                      />
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
                    </div>
                    <div className={`p-2.5 rounded-lg ${card.bg}`}>
                      <card.icon size={20} className={card.color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Product breakdown cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(stats.latestByProduct)
            .filter(([pt]) => ['HI', 'HHC'].includes(pt))
            .sort(([, a], [, b]) => b.premium - a.premium)
            .map(([pt, data]) => (
              <Card key={pt} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-foreground">
                      {pt === 'HHC' ? 'Home Health Care' : 'Hospital Indemnity'}
                    </CardTitle>
                    {data.retention !== null && (
                      <Badge className={`text-xs border ${retentionBadgeClass(data.retention)}`}>
                        {data.retention}% retained
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Active premium</p>
                      <p className="font-semibold text-foreground">{fmt$(data.premium)}<span className="font-normal text-muted-foreground/70">/mo</span></p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Retention</p>
                      <p className={`font-semibold ${retentionColor(data.retention)}`}>
                        {data.retention !== null ? `${data.retention}%` : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Cohort retention trend */}
        {retentionChartData.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">90-Day Retention by Cohort</CardTitle>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Monthly cohorts · HI vs HHC · red dashed line = 90% target</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                    <XAxis dataKey="month" stroke="hsl(215 20% 55%)" fontSize={11} />
                    <YAxis domain={[70, 105]} stroke="hsl(215 20% 55%)" fontSize={11} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        v !== null ? `${v}%` : '—',
                        name === 'target' ? '90% Target' : name,
                      ]}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(217 33% 20%)', background: 'hsl(222 47% 9%)', color: 'hsl(210 40% 98%)', fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="HI" stroke="hsl(199 89% 48%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(199 89% 48%)' }} connectNulls />
                    <Line type="monotone" dataKey="HHC" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3, fill: '#0ea5e9' }} connectNulls />
                    <Line type="monotone" dataKey="target" stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cohort detail table */}
        {cohorts.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Cohort Detail</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data">
                  <span className="col-span-2">Cohort</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Drafted</span>
                  <span className="text-right">Retained</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Premium</span>
                </div>
                {cohorts.slice(0, 20).map((c, i) => (
                  <div key={i} className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm row-hover ${Number(c.retention_pct) < 90 ? 'bg-red-500/5' : ''}`}>
                    <span className="col-span-2 font-medium text-foreground">
                      {fmtMonth(c.cohort_month)}{' '}
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        c.product_type === 'HHC' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                      }`}>{c.product_type}</Badge>
                    </span>
                    <span className="text-right text-muted-foreground font-data">{c.cohort_size.toLocaleString()}</span>
                    <span className="text-right text-muted-foreground font-data">{c.drafted_first.toLocaleString()}</span>
                    <span className="text-right text-muted-foreground font-data">{c.retained.toLocaleString()}</span>
                    <span className={`text-right font-semibold font-data ${retentionColor(Number(c.retention_pct))}`}>{c.retention_pct}%</span>
                    <span className="text-right text-muted-foreground font-data">{fmt$(Number(c.active_premium))}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Premium concentration — with agency names + clickable */}
        {concentration.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Premium Concentration</CardTitle>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Top agencies by active premium — click to drill in</p>
                </div>
                <Badge className="bg-secondary text-muted-foreground border-border border">
                  Top {concentration.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={concChartData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                    <XAxis dataKey="name" stroke="hsl(215 20% 55%)" fontSize={10} angle={-35} textAnchor="end" interval={0} height={60} />
                    <YAxis stroke="hsl(215 20% 55%)" fontSize={11} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        fmt$(Math.round(v)),
                        name === 'active_premium' ? 'Active' : 'At-risk',
                      ]}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(217 33% 20%)', background: 'hsl(222 47% 9%)', color: 'hsl(210 40% 98%)', fontSize: 12 }}
                    />
                    <Bar dataKey="active_premium" fill="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} name="active_premium" />
                    <Bar dataKey="at_risk_premium" fill="hsl(0 84% 60%)" radius={[3, 3, 0, 0]} name="at_risk_premium" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Concentration table with links */}
              <div className="divide-y divide-border/30 border-t border-border/50">
                <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data">
                  <span className="col-span-2">Agency</span>
                  <span className="text-right">Active</span>
                  <span className="text-right">Premium</span>
                  <span className="text-right">At-Risk</span>
                  <span className="text-right">Concentration</span>
                  <span />
                </div>
                {concentration.map(c => (
                  <div key={c.agency_id} className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm items-center ${c.premium_concentration_pct >= 10 ? 'bg-amber-500/30' : ''}`}>
                    <span className="col-span-2 font-medium text-foreground truncate">
                      {c.name ?? <span className="font-data text-xs text-muted-foreground/70">{c.agency_id.slice(0, 12)}…</span>}
                    </span>
                    <span className="text-right text-muted-foreground font-data">{c.active_count}</span>
                    <span className="text-right text-foreground/80 font-medium font-data">{fmt$(c.active_premium)}</span>
                    <span className={`text-right font-medium font-data ${c.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/40'}`}>
                      {c.at_risk_count || '—'}
                    </span>
                    <span className={`text-right font-semibold font-data ${c.premium_concentration_pct >= 10 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {c.premium_concentration_pct}%
                    </span>
                    <span className="text-center">
                      <Link to={`/agencies/${c.agency_id}`}>
                        <ChevronRight size={14} className="text-muted-foreground/40 hover:text-primary transition-colors" />
                      </Link>
                    </span>
                  </div>
                ))}
              </div>

              {stats.flaggedConcentration.length > 0 && (
                <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                  ⚠ Concentration flag: {stats.flaggedConcentration.map(c => c.name ?? c.agency_id.slice(0, 10)).join(', ')} — each holds &gt;10% of total premium
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
