import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, Users, Target, TrendingUp, TrendingDown,
  Activity, BarChart3, Megaphone,
} from 'lucide-react';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { MOCK_KPIS, MOCK_DAILY_SPEND, MOCK_CAMPAIGNS } from '@/lib/recruiting';
import { fetchRecruitingKpis, fetchDailySpendData, fetchCampaigns } from '@/lib/recruiting';
import type { Campaign, CampaignStatus, RecruitingKpis, DailySpend } from '@/lib/recruiting';
import { useCachedFetch } from '@/hooks/useCachedFetch';

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, prefix, suffix, delta, icon: Icon }: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta?: number;
  icon: React.ElementType;
}) {
  const isPositive = delta !== undefined && delta >= 0;
  const DeltaIcon = isPositive ? TrendingUp : TrendingDown;
  // For cost metrics (CPL, CPA), negative delta = good (green)
  const isCostMetric = label.includes('CPL') || label.includes('CPA');
  const deltaColor = isCostMetric
    ? (isPositive ? 'text-red-400' : 'text-emerald-400')
    : (isPositive ? 'text-emerald-400' : 'text-red-400');

  return (
    <Card className="bg-card/60 border-border/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold tracking-tight">
              {prefix}<CountUp end={value} decimals={suffix === '%' ? 1 : (prefix === '$' ? 0 : 0)} />
              {suffix}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-[hsl(199,89%,48%)]/10 border border-[hsl(199,89%,48%)]/20">
            <Icon size={18} className="text-[hsl(199,89%,48%)]" />
          </div>
        </div>
        {delta !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${deltaColor}`}>
            <DeltaIcon size={12} />
            <span>{Math.abs(delta)}% vs prior period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    paused: { label: 'Paused', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    completed: { label: 'Completed', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    draft: { label: 'Draft', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  };
  const { label, className } = map[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

// ── Component ──────────────────────────────────────────────────────────────
export function RecruitingDashboardTab() {
  const { data: kpis } = useCachedFetch<RecruitingKpis>('recruiting-kpis', fetchRecruitingKpis, { maxAge: 60 * 60 * 1000 });
  const { data: dailySpend } = useCachedFetch<DailySpend[]>('recruiting-daily-spend', fetchDailySpendData, { maxAge: 60 * 60 * 1000 });
  const { data: campaigns } = useCachedFetch<Campaign[]>('recruiting-campaigns', fetchCampaigns, { maxAge: 60 * 60 * 1000 });
  const [sortKey, setSortKey] = useState<keyof Campaign>('totalSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const effectiveKpis = kpis ?? MOCK_KPIS;
  const effectiveDailySpend = dailySpend ?? MOCK_DAILY_SPEND;
  const effectiveCampaigns = campaigns ?? MOCK_CAMPAIGNS;

  const sorted = useMemo(() => {
    return [...effectiveCampaigns].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return 0;
    });
  }, [effectiveCampaigns, sortKey, sortDir]);

  function toggleSort(key: keyof Campaign) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const SortArrow = ({ col }: { col: keyof Campaign }) =>
    sortKey === col ? <span className="ml-1 text-[hsl(199,89%,48%)]">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  // Chart formatting
  const chartData = useMemo(() =>
    effectiveDailySpend.map(d => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })), [effectiveDailySpend]);

  const isLive = Boolean(kpis && kpis.totalSpend > 0);

  return (
    <div className="p-6 space-y-6">
      {/* Data source banner */}
      {(!kpis || kpis.totalSpend === 0) && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <Activity size={14} />
          <span>No live data yet — run the Meta Ads sync to populate campaign metrics</span>
        </div>
      )}

      {/* KPI Strip */}
      <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StaggerItem><KpiCard label="Total Spend" value={effectiveKpis.totalSpend} prefix="$" icon={DollarSign} delta={isLive ? effectiveKpis.spendDelta : undefined} /></StaggerItem>
        <StaggerItem><KpiCard label="Total Leads" value={effectiveKpis.totalLeads} icon={Users} delta={isLive ? effectiveKpis.leadsDelta : undefined} /></StaggerItem>
        <StaggerItem><KpiCard label="CPL" value={effectiveKpis.cpl} prefix="$" icon={Target} delta={isLive ? effectiveKpis.cplDelta : undefined} /></StaggerItem>
        <StaggerItem><KpiCard label="CPA" value={effectiveKpis.cpa} prefix="$" icon={BarChart3} delta={isLive ? effectiveKpis.cpaDelta : undefined} /></StaggerItem>
      </StaggerContainer>

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StaggerItem><KpiCard label="Contact Rate" value={effectiveKpis.contactRate * 100} suffix="%" icon={Megaphone} /></StaggerItem>
        <StaggerItem><KpiCard label="Close Ratio" value={effectiveKpis.closeRatio * 100} suffix="%" icon={Target} /></StaggerItem>
        <StaggerItem><KpiCard label="Placed Policies" value={effectiveKpis.placedPolicies} icon={TrendingUp} /></StaggerItem>
        <StaggerItem><KpiCard label="Active Ad Sets" value={effectiveKpis.activeAdSets} icon={Activity} /></StaggerItem>
      </StaggerContainer>

      {/* Spend vs Leads trend */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={4} />
                  <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                  <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [name === 'spend' ? `$${value.toFixed(2)}` : value, name === 'spend' ? 'Spend' : 'Leads']}
                  />
                  <Legend />
                  <Bar yAxisId="leads" dataKey="leads" name="Leads" fill="hsl(199,89%,48%)" opacity={0.4} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="spend" dataKey="spend" name="Spend" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </HudFrame>

      {/* Campaign Table */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Campaign</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('totalSpend')}>
                      Spend<SortArrow col="totalSpend" />
                    </th>
                    <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('totalLeads')}>
                      Leads<SortArrow col="totalLeads" />
                    </th>
                    <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('cpl')}>
                      CPL<SortArrow col="cpl" />
                    </th>
                    <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('cpa')}>
                      CPA<SortArrow col="cpa" />
                    </th>
                    <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('contactRate')}>
                      Contact<SortArrow col="contactRate" />
                    </th>
                    <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('closeRatio')}>
                      Close<SortArrow col="closeRatio" />
                    </th>
                    <th className="text-right px-4 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('placedPolicies')}>
                      Placed<SortArrow col="placedPolicies" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(c => (
                    <tr key={c.id} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{c.platform}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-3 text-right font-mono">${c.totalSpend.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-mono">{c.totalLeads}</td>
                      <td className="px-3 py-3 text-right font-mono">${c.cpl.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-mono">${c.cpa.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-mono">{(c.contactRate * 100).toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right font-mono">{(c.closeRatio * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{c.placedPolicies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </HudFrame>
    </div>
  );
}
