import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Loader2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase, supabaseConfigured as rcbzagConfigured } from '@/lib/supabase';

interface RetentionTrendPoint {
  month: string;
  HI: number | null;
  HHC: number | null;
}

interface ProductionPoint {
  month: string;
  policies: number;
  premium: number;
}

interface ProductMixPoint {
  month: string;
  HI: number;
  HHC: number;
}

export function CcAnalyticsTab() {
  const [retentionTrend, setRetentionTrend] = useState<RetentionTrendPoint[] | null>(null);
  const [production, setProduction] = useState<ProductionPoint[] | null>(null);
  const [productMix, setProductMix] = useState<ProductMixPoint[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const monthKey = twelveMonthsAgo.toISOString().slice(0, 7);

      const { data } = await (supabase as any)
        .from('cohort_retention')
        .select('product_type, cohort_month, retention_pct')
        .gte('cohort_month', monthKey)
        .order('cohort_month', { ascending: true });

      const byMonth = new Map<string, RetentionTrendPoint>();
      (data || []).forEach((r: any) => {
        const existing = byMonth.get(r.cohort_month) || { month: r.cohort_month, HI: null, HHC: null };
        if (r.product_type === 'HI') existing.HI = r.retention_pct !== null ? Number(r.retention_pct) : null;
        if (r.product_type === 'HHC') existing.HHC = r.retention_pct !== null ? Number(r.retention_pct) : null;
        byMonth.set(r.cohort_month, existing);
      });
      setRetentionTrend(Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)));
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const monthKey = twelveMonthsAgo.toISOString().slice(0, 7);

      const { data } = await (supabase as any)
        .from('monthly_production')
        .select('month, policies, annual_premium, product_type')
        .gte('month', monthKey);

      const byMonth = new Map<string, ProductionPoint>();
      const mixByMonth = new Map<string, ProductMixPoint>();
      (data || []).forEach((r: any) => {
        const existing = byMonth.get(r.month) || { month: r.month, policies: 0, premium: 0 };
        existing.policies += Number(r.policies) || 0;
        existing.premium += Number(r.annual_premium) || 0;
        byMonth.set(r.month, existing);

        const mixExisting = mixByMonth.get(r.month) || { month: r.month, HI: 0, HHC: 0 };
        if (r.product_type === 'HI') mixExisting.HI += Number(r.policies) || 0;
        if (r.product_type === 'HHC') mixExisting.HHC += Number(r.policies) || 0;
        mixByMonth.set(r.month, mixExisting);
      });
      setProduction(Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)));
      setProductMix(Array.from(mixByMonth.values()).sort((a, b) => a.month.localeCompare(b.month)));
    })();
  }, []);

  if (!rcbzagConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Analytics & KPIs</h2>
        <p className="text-sm text-muted-foreground">FYM App database not configured — charts unavailable.</p>
      </div>
    );
  }

  const loading = retentionTrend === null || production === null || productMix === null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics & KPIs</h1>
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
          <p className="text-xs text-muted-foreground">Loading live analytics…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Retention Trend by Product</h3>
              <span className="text-[10px] text-muted-foreground">Last 12 months</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={retentionTrend!}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }} labelStyle={{ color: 'hsl(210 40% 98%)' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="HI" stroke="hsl(199 89% 48%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(199 89% 48%)' }} connectNulls />
                <Line type="monotone" dataKey="HHC" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(142 71% 45%)' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Production by Month</h3>
              <span className="text-[10px] text-muted-foreground">Last 12 months</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={production!}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="policies" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Product Mix Over Time</h3>
              <span className="text-[10px] text-muted-foreground">HI vs HHC policies, last 12 months</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={productMix!}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="HI" stackId="1" stroke="hsl(199 89% 48%)" fill="hsl(199 89% 48%)" fillOpacity={0.3} strokeWidth={2} />
                <Area type="monotone" dataKey="HHC" stackId="1" stroke="hsl(142 71% 45%)" fill="hsl(142 71% 45%)" fillOpacity={0.3} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}
    </div>
  );
}
