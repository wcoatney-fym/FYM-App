import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { DollarSign, ShieldAlert, TrendingDown, AlertTriangle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface FinancialSummary {
  product_type: string;
  active_count: number;
  active_premium: number;
  at_risk_count: number;
  at_risk_premium: number;
  drafted_first: number;
  drafted_third: number;
}

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
  active_count: number;
  active_premium: number;
  at_risk_count: number;
  at_risk_premium: number;
  at_risk_pct: number;
  premium_concentration_pct: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function retentionColor(pct: number) {
  if (pct >= 90) return 'text-emerald-700';
  if (pct >= 85) return 'text-amber-600';
  return 'text-red-600';
}
function retentionBadge(pct: number) {
  if (pct >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (pct >= 85) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}
function fmt$(n: number) {
  return '$' + n.toLocaleString();
}
function fmtMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Mock fallback ──────────────────────────────────────────────────────────
const MOCK_SUMMARY: FinancialSummary[] = [
  { product_type: 'HHC', active_count: 12397, active_premium: 899890, at_risk_count: 102, at_risk_premium: 8573, drafted_first: 9767, drafted_third: 2102 },
  { product_type: 'HI',  active_count: 11716, active_premium: 524322, at_risk_count: 55,  at_risk_premium: 2378, drafted_first: 11296, drafted_third: 4922 },
];

export function AdminFinancialsPage() {
  const [summary, setSummary] = useState<FinancialSummary[]>(MOCK_SUMMARY);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [concentration, setConcentration] = useState<ConcentrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function load() {
      // Financial summary — aggregate directly from policy_cache
      const { data: rawData } = await supabase!
        .from('policy_cache')
        .select('product_type, status, plan_premium, is_at_risk, paid_to_date, policy_effective_date');

      const raw = rawData as Array<{
        product_type: string | null;
        status: string | null;
        plan_premium: number | null;
        is_at_risk: boolean;
        paid_to_date: string | null;
        policy_effective_date: string | null;
      }> | null;

      if (raw && raw.length > 0) {
        const byProduct: Record<string, FinancialSummary> = {};
        for (const r of raw) {
          const pt = r.product_type ?? 'Other';
          if (!byProduct[pt]) byProduct[pt] = { product_type: pt, active_count: 0, active_premium: 0, at_risk_count: 0, at_risk_premium: 0, drafted_first: 0, drafted_third: 0 };
          const s = byProduct[pt];
          if (r.status === 'active') {
            s.active_count++;
            s.active_premium += r.plan_premium ?? 0;
          }
          if (r.is_at_risk && r.status === 'active') {
            s.at_risk_count++;
            s.at_risk_premium += r.plan_premium ?? 0;
          }
          if (r.paid_to_date && r.policy_effective_date) {
            const eff = new Date(r.policy_effective_date);
            const paid = new Date(r.paid_to_date);
            const months = (paid.getFullYear() - eff.getFullYear()) * 12 + (paid.getMonth() - eff.getMonth());
            if (months >= 1) s.drafted_first++;
            if (months >= 3) s.drafted_third++;
          }
        }
        setSummary(Object.values(byProduct).filter(p => ['HI','HHC'].includes(p.product_type)).sort((a,b) => b.active_premium - a.active_premium));
      }

      // Cohort retention view
      const { data: cohortData } = await supabase!
        .from('cohort_retention')
        .select('*')
        .order('cohort_month', { ascending: false })
        .limit(24);
      if (cohortData && cohortData.length > 0) setCohorts(cohortData);

      // Concentration view
      const { data: concData } = await supabase!
        .from('agency_concentration')
        .select('*')
        .order('active_premium', { ascending: false })
        .limit(20);
      if (concData && concData.length > 0) setConcentration(concData);

      setLoading(false);
    }
    load();
  }, []);

  const totalPremium = summary.reduce((s, r) => s + r.active_premium, 0);
  const totalAtRiskPremium = summary.reduce((s, r) => s + r.at_risk_premium, 0);
  const totalActive = summary.reduce((s, r) => s + r.active_count, 0);
  const totalAtRisk = summary.reduce((s, r) => s + r.at_risk_count, 0);
  const blendedRetention = summary.reduce((s, r) => s + r.drafted_third, 0) /
    Math.max(summary.reduce((s, r) => s + r.drafted_first, 0), 1) * 100;

  // Chart data — last 12 cohort months, HI + HHC side by side
  const chartMonths = [...new Set(cohorts.map(c => c.cohort_month))].slice(0, 12).reverse();
  const retentionChartData = chartMonths.map(month => {
    const hi  = cohorts.find(c => c.cohort_month === month && c.product_type === 'HI');
    const hhc = cohorts.find(c => c.cohort_month === month && c.product_type === 'HHC');
    return {
      month: fmtMonth(month),
      HI:  hi?.retention_pct  ?? null,
      HHC: hhc?.retention_pct ?? null,
    };
  });

  // Concentration: flag agencies with >10% of total premium
  const flaggedConcentration = concentration.filter(c => c.premium_concentration_pct >= 10);

  if (loading) {
    return (
      <div>
        <Header title="Admin Financials" />
        <div className="p-6 space-y-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Admin Financials" />
      <div className="p-6 space-y-6">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Active Premium</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{fmt$(Math.round(totalPremium))}</p>
                  <p className="text-xs text-slate-400 mt-0.5">/mo across {totalActive.toLocaleString()} policies</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50"><DollarSign size={20} className="text-[#1e3a5f]" /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">At-Risk Premium</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{fmt$(Math.round(totalAtRiskPremium))}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{totalAtRisk} policies flagged</p>
                </div>
                <div className="p-2.5 rounded-lg bg-red-50"><ShieldAlert size={20} className="text-red-600" /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Blended Retention</p>
                  <p className={`text-2xl font-bold mt-1 ${retentionColor(blendedRetention)}`}>{blendedRetention.toFixed(1)}%</p>
                  <p className="text-xs text-slate-400 mt-0.5">90-day, all products</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50"><TrendingDown size={20} className="text-emerald-700" /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Concentration Risk</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{flaggedConcentration.length}</p>
                  <p className="text-xs text-slate-400 mt-0.5">agencies &gt;10% of premium</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50"><AlertTriangle size={20} className="text-amber-600" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Premium by product ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary.map(s => {
            const retention = s.drafted_first > 0 ? (s.drafted_third / s.drafted_first * 100) : 0;
            return (
              <Card key={s.product_type} className="border-slate-200">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-slate-900">{s.product_type === 'HHC' ? 'Home Health Care' : 'Hospital Indemnity'}</CardTitle>
                    <Badge className={`text-xs border ${retentionBadge(retention)}`}>{retention.toFixed(1)}% retained</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs">Active premium</p>
                      <p className="font-semibold text-slate-900">{fmt$(Math.round(s.active_premium))}<span className="font-normal text-slate-400">/mo</span></p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">At-risk premium</p>
                      <p className="font-semibold text-red-700">{fmt$(Math.round(s.at_risk_premium))}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Active policies</p>
                      <p className="font-semibold text-slate-900">{s.active_count.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">At-risk policies</p>
                      <p className="font-semibold text-red-700">{s.at_risk_count}</p>
                    </div>
                  </div>
                  {/* at-risk premium bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>At-risk exposure</span>
                      <span>{s.active_premium > 0 ? ((s.at_risk_premium / s.active_premium) * 100).toFixed(1) : 0}% of premium</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.min((s.at_risk_premium / Math.max(s.active_premium, 1)) * 100, 100)}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Cohort retention chart ── */}
        {retentionChartData.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">90-Day Retention by Cohort Month</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">Billing-mode aware: non-monthly = 1st draft retained. Cohorts need ≥3 months to appear.</p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                    <YAxis domain={[70, 105]} stroke="#64748b" fontSize={11} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: number) => [`${v}%`, '']} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                    <Legend />
                    <Line type="monotone" dataKey="HI"  stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="HHC" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    {/* 90% target line */}
                    <Line type="monotone" dataKey={() => 90} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} dot={false} name="Target (90%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Cohort table (below-target flagged) ── */}
        {cohorts.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">Cohort Detail</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-6 gap-2 px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">
                  <span className="col-span-2">Cohort</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Drafted</span>
                  <span className="text-right">Retained</span>
                  <span className="text-right">Rate</span>
                </div>
                {cohorts.slice(0, 20).map((c, i) => (
                  <div key={i} className={`grid grid-cols-6 gap-2 px-4 py-2.5 text-sm ${c.retention_pct < 90 ? 'bg-red-50/40' : ''}`}>
                    <span className="col-span-2 font-medium text-slate-800">
                      {fmtMonth(c.cohort_month)} <span className="text-slate-400 font-normal">{c.product_type}</span>
                    </span>
                    <span className="text-right text-slate-600">{c.cohort_size.toLocaleString()}</span>
                    <span className="text-right text-slate-600">{c.drafted_first.toLocaleString()}</span>
                    <span className="text-right text-slate-600">{c.retained.toLocaleString()}</span>
                    <span className={`text-right font-semibold ${retentionColor(c.retention_pct)}`}>{c.retention_pct}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Concentration risk ── */}
        {concentration.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-slate-900">Premium Concentration by Agency</CardTitle>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">Top {concentration.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={concentration.slice(0, 10)} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="agency_id" stroke="#64748b" fontSize={10} angle={-30} textAnchor="end" interval={0} />
                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [fmt$(Math.round(v)), 'Active premium']} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="active_premium" fill="#1e3a5f" radius={[3,3,0,0]} name="Active premium" />
                    <Bar dataKey="at_risk_premium" fill="#ef4444" radius={[3,3,0,0]} name="At-risk premium" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {flaggedConcentration.length > 0 && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⚠ Concentration flag: {flaggedConcentration.map(c => `${c.agency_id} (${c.premium_concentration_pct}%)`).join(', ')} — each agency holds &gt;10% of total premium
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Recruiting funnel snapshot ── */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">Recruiting Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Agencies in DB', value: concentration.length, sub: 'writing at least 1 policy' },
                { label: 'Below 90% retention', value: cohorts.filter(c => c.retention_pct < 90).length > 0 ? [...new Set(cohorts.filter(c => c.retention_pct < 90).map(c => c.product_type))].length : 0, sub: 'product lines flagged' },
                { label: 'At-risk premium', value: fmt$(Math.round(totalAtRiskPremium)), sub: 'recoverable if actioned' },
              ].map(item => (
                <div key={item.label} className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-2xl font-bold text-slate-900">{item.value}</p>
                  <p className="text-xs font-medium text-slate-600 mt-1">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
