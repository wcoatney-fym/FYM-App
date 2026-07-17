import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, TrendingUp, AlertTriangle, FileText } from 'lucide-react';

interface DashStats {
  active_policies: number;
  retention_90d: number;
  at_risk_count: number;
  new_this_week: number;
}

interface TrendPoint { month: string; retention: number; }

function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function load() {
      // Pull raw policy data — paginated to avoid 1K cap
      const allPolicies: any[] = [];
      let offset = 0;
      const PAGE = 500;
      while (true) {
        const { data, error } = await supabase!
          .from('policy_cache')
          .select('status, is_at_risk, plan_premium, paid_to_date, policy_effective_date, billing_mode, synced_at')
          .in('product_type', ['HI', 'HHC'])
          .range(offset, offset + PAGE - 1);
        if (error || !data) break;
        allPolicies.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      let active = 0, atRisk = 0, newThisWeek = 0;
      let drafted1 = 0, drafted3 = 0;

      // Cohort map: month → { d1, d3 } for trend chart
      const cohortMap: Record<string, { d1: number; d3: number }> = {};

      for (const p of allPolicies) {
        if (p.status === 'active') active++;
        if (p.is_at_risk && p.status === 'active') atRisk++;

        const syncedAt = p.synced_at ? new Date(p.synced_at) : null;
        if (syncedAt && syncedAt >= weekAgo) newThisWeek++;

        if (p.paid_to_date && p.policy_effective_date) {
          const eff = new Date(p.policy_effective_date);
          const paid = new Date(p.paid_to_date);
          const months = (paid.getFullYear() - eff.getFullYear()) * 12 + (paid.getMonth() - eff.getMonth());
          const mode = p.billing_mode ?? '1';
          const isMonthly = mode === '1';

          // Eligibility gates (same as canonical query B)
          const eligMonthly = eff <= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          const eligNonMonthly = eff <= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          if ((isMonthly && eligMonthly) || (!isMonthly && eligNonMonthly)) {
            if (months >= 1) {
              drafted1++;
              // Trend: cohort month key
              const key = eff.toISOString().slice(0, 7);
              if (!cohortMap[key]) cohortMap[key] = { d1: 0, d3: 0 };
              cohortMap[key].d1++;
            }
            const retained = isMonthly ? months >= 3 : months >= 1;
            if (retained) {
              drafted3++;
              const key = eff.toISOString().slice(0, 7);
              if (!cohortMap[key]) cohortMap[key] = { d1: 0, d3: 0 };
              cohortMap[key].d3++;
            }
          }
        }
      }

      const retention = drafted1 > 0 ? Math.round((drafted3 / drafted1) * 1000) / 10 : 0;

      setStats({ active_policies: active, retention_90d: retention, at_risk_count: atRisk, new_this_week: newThisWeek });

      // Build trend from last 12 eligible cohort months
      const trendPoints = Object.entries(cohortMap)
        .filter(([, v]) => v.d1 > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, v]) => ({
          month: fmtMonth(month + '-01'),
          retention: Math.round((v.d3 / v.d1) * 1000) / 10,
        }));
      setTrend(trendPoints);
      setLoading(false);
    }
    load();
  }, []);

  const s = stats;
  const cards = [
    { title: 'Active Policies',  value: s ? s.active_policies.toLocaleString() : '—', icon: ShieldCheck,   color: 'text-[#1e3a5f]',   bg: 'bg-blue-50' },
    { title: '90-Day Retention', value: s ? `${s.retention_90d}%` : '—',               icon: TrendingUp,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { title: 'At-Risk Policies', value: s ? s.at_risk_count.toString() : '—',          icon: AlertTriangle, color: 'text-amber-700',   bg: 'bg-amber-50' },
    { title: 'New This Week',    value: s ? s.new_this_week.toString() : '—',           icon: FileText,      color: 'text-slate-700',   bg: 'bg-slate-100', subtitle: 'policies synced' },
  ];

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Card key={card.title} className="border-slate-200">
              <CardContent className="p-5">
                {loading ? (
                  <div className="h-14 rounded bg-slate-100 animate-pulse" />
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">{card.title}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
                      {card.subtitle && <p className="text-xs text-slate-400 mt-0.5">{card.subtitle}</p>}
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

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">90-Day Retention by Cohort</CardTitle>
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
                    <YAxis domain={[75, 105]} stroke="#64748b" fontSize={12} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, 'Retention']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                    <Line type="monotone" dataKey="retention" stroke="#1e3a5f" strokeWidth={2.5}
                      dot={{ fill: '#1e3a5f', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
