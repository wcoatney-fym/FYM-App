import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, Users, Target, TrendingUp, TrendingDown,
  Activity, BarChart3, Megaphone, Clock, UserCheck, UserPlus,
  FileCheck, Zap, ArrowRight, ArrowLeftRight,
} from 'lucide-react';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, RECRUITING_DEFAULT_PRESET, RECRUITING_DATE_PRESETS, getDateRange } from '@/lib/dateUtils';

import {
  fetchRecruitingKpis, fetchDailySpendData, fetchCampaigns,
  fetchRecruitingFunnel, fetchStageTimings,
} from '@/lib/recruiting';
import type {
  Campaign, CampaignStatus,
  RecruitingFunnel, StageTiming, RecruitingDateFilter,
} from '@/lib/recruiting';
import { RECRUITING_STAGES } from '@/lib/recruiting/types';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';

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

// ── CPA Toggle Card ────────────────────────────────────────────────────────
function CpaToggleCard({ rtsCpa, productionCpa, delta }: {
  rtsCpa: number;
  productionCpa: number;
  delta?: number;
}) {
  const [showProduction, setShowProduction] = useState(false);
  const label = showProduction ? 'Production CPA' : 'RTS CPA';
  const value = showProduction ? productionCpa : rtsCpa;
  const isPositive = delta !== undefined && delta >= 0;
  const DeltaIcon = isPositive ? TrendingUp : TrendingDown;
  // CPA is a cost metric — up is bad (red), down is good (green)
  const deltaColor = isPositive ? 'text-red-400' : 'text-emerald-400';

  return (
    <Card className="bg-card/60 border-border/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
              <button
                onClick={() => setShowProduction(p => !p)}
                className="p-0.5 rounded hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground"
                title={showProduction ? 'Switch to RTS CPA' : 'Switch to Production CPA'}
              >
                <ArrowLeftRight size={12} />
              </button>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              $<CountUp end={value} decimals={0} />
            </p>
          </div>
          <div className="p-2 rounded-lg bg-[hsl(199,89%,48%)]/10 border border-[hsl(199,89%,48%)]/20">
            <BarChart3 size={18} className="text-[hsl(199,89%,48%)]" />
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

// ── Pipeline Funnel ────────────────────────────────────────────────────────
function PipelineFunnel({ funnel }: { funnel: RecruitingFunnel }) {
  const stages = [
    { key: 'leads', label: 'Leads', value: funnel.leads, color: RECRUITING_STAGES[0].color },
    { key: 'attendees', label: 'Attendees', value: funnel.attendees, color: RECRUITING_STAGES[1].color },
    { key: 'hired', label: 'Hired', value: funnel.hired, color: RECRUITING_STAGES[2].color },
    { key: 'contracting', label: 'Contracting', value: funnel.contracting, color: RECRUITING_STAGES[3].color },
    { key: 'rts', label: 'RTS', value: funnel.rts, color: RECRUITING_STAGES[4].color },
    { key: 'producing', label: 'Producing', value: funnel.producing, color: RECRUITING_STAGES[5].color },
  ];

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const pct = funnel.leads > 0 ? (stage.value / funnel.leads * 100) : 0;
        const dropoff = i > 0 && stages[i - 1].value > 0
          ? Math.round((1 - stage.value / stages[i - 1].value) * 100)
          : 0;
        const progression = i > 0 && stages[i - 1].value > 0
          ? Math.round(stage.value / stages[i - 1].value * 100)
          : 100;
        return (
          <div key={stage.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{stage.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{stage.value}</span>
                <span className="text-xs text-muted-foreground">({pct.toFixed(1)}%)</span>
                {i > 0 && (
                  <span className={`text-xs ${dropoff > 50 ? 'text-red-400' : dropoff > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {progression}% →
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: stage.color }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between text-sm pt-1 border-t border-border/20">
        <span className="text-muted-foreground">Lost</span>
        <span className="font-mono text-red-400">{funnel.lost}</span>
      </div>
    </div>
  );
}

// ── Stage Timing Cards ─────────────────────────────────────────────────────
function StageTimingSection({ timings }: { timings: StageTiming[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Avg Time Per Stage</p>
      <div className="space-y-1.5">
        {timings.map(t => (
          <div key={t.stage} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock size={12} />
              {t.label}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono font-medium">{t.avgDays > 0 ? `${t.avgDays}d` : '—'}</span>
              <span className="text-xs text-muted-foreground">
                med {t.medianDays > 0 ? `${t.medianDays}d` : '—'}
              </span>
              <span className="text-xs text-muted-foreground">n={t.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
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
  const [datePreset, setDatePreset] = useState<DatePreset>(RECRUITING_DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(RECRUITING_DEFAULT_PRESET));

  const dateFilter: RecruitingDateFilter = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange]);

  const cacheKey = `recruiting-dash-${datePreset}-${dateRange.startDate.slice(0, 10)}`;

  const { data: multiData } = useCachedMultiFetch(cacheKey, {
    kpis: () => fetchRecruitingKpis(dateFilter),
    dailySpend: () => fetchDailySpendData(undefined, dateFilter),
    campaigns: () => fetchCampaigns(),
    funnel: () => fetchRecruitingFunnel(dateFilter),
    timings: () => fetchStageTimings(dateFilter),
  }, { deps: [datePreset, dateRange.startDate, dateRange.endDate] });

  const kpis = multiData?.kpis ?? {
    totalSpend: 0, totalLeads: 0, cpl: 0, cpa: 0, productionCpa: 0,
    contactRate: 0, closeRatio: 0, placedPolicies: 0, activeAdSets: 0,
    spendDelta: 0, leadsDelta: 0, cplDelta: 0, cpaDelta: 0,
    totalRecruits: 0, attendeeRate: 0, hireRate: 0, rtsRate: 0,
    avgDaysToRts: 0, avgDaysToFirstSale: 0,
  };
  const dailySpend = multiData?.dailySpend ?? [];
  const campaigns = multiData?.campaigns ?? [];
  const funnel = multiData?.funnel ?? { leads: 0, attendees: 0, hired: 0, contracting: 0, rts: 0, producing: 0, lost: 0 };
  const timings = multiData?.timings ?? [];

  const [sortKey, setSortKey] = useState<keyof Campaign>('totalSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return 0;
    });
  }, [campaigns, sortKey, sortDir]);

  function toggleSort(key: keyof Campaign) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const SortArrow = ({ col }: { col: keyof Campaign }) =>
    sortKey === col ? <span className="ml-1 text-[hsl(199,89%,48%)]">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  const chartData = useMemo(() =>
    dailySpend.map(d => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })), [dailySpend]);

  function handleDateChange(range: DateRange, preset: DatePreset) {
    setDateRange(range);
    setDatePreset(preset);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with date selector */}
      <div className="flex items-center justify-between">
        <div />
        <TimePeriodSelector preset={datePreset} dateRange={dateRange} onChange={handleDateChange} presets={RECRUITING_DATE_PRESETS} />
      </div>

      {/* Empty state */}
      {campaigns.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/10 border border-border/30 text-muted-foreground text-xs">
          <Activity size={14} />
          <span>No campaigns flagged for recruiting — toggle Feed Recruiting in CRM Ops → Ad Spend to select campaigns</span>
        </div>
      )}

      {/* Ad Spend KPIs */}
      <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StaggerItem><KpiCard label="Total Spend" value={kpis.totalSpend} prefix="$" icon={DollarSign} delta={kpis.spendDelta || undefined} /></StaggerItem>
        <StaggerItem><KpiCard label="Total Leads" value={kpis.totalLeads} icon={Users} delta={kpis.leadsDelta || undefined} /></StaggerItem>
        <StaggerItem><KpiCard label="CPL" value={kpis.cpl} prefix="$" icon={Target} delta={kpis.cplDelta || undefined} /></StaggerItem>
        <StaggerItem><CpaToggleCard rtsCpa={kpis.cpa} productionCpa={kpis.productionCpa} delta={kpis.cpaDelta || undefined} /></StaggerItem>
      </StaggerContainer>

      {/* Pipeline KPIs */}
      <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StaggerItem><KpiCard label="Pipeline Recruits" value={kpis.totalRecruits} icon={UserPlus} /></StaggerItem>
        <StaggerItem><KpiCard label="Attendee Rate" value={kpis.attendeeRate * 100} suffix="%" icon={Megaphone} /></StaggerItem>
        <StaggerItem><KpiCard label="Hire Rate" value={kpis.hireRate * 100} suffix="%" icon={UserCheck} /></StaggerItem>
        <StaggerItem><KpiCard label="RTS Rate" value={kpis.rtsRate * 100} suffix="%" icon={FileCheck} /></StaggerItem>
      </StaggerContainer>

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <StaggerItem><KpiCard label="Avg Days to RTS" value={kpis.avgDaysToRts} suffix="d" icon={Clock} /></StaggerItem>
        <StaggerItem><KpiCard label="Avg Days to First Sale" value={kpis.avgDaysToFirstSale} suffix="d" icon={Zap} /></StaggerItem>
      </StaggerContainer>

      {/* Funnel + Stage Timing side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HudFrame>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-4 flex items-center gap-1.5">
                <ArrowRight size={12} /> Recruiting Pipeline
              </p>
              <PipelineFunnel funnel={funnel} />
            </CardContent>
          </Card>
        </HudFrame>

        <HudFrame>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-5">
              <StageTimingSection timings={timings} />
            </CardContent>
          </Card>
        </HudFrame>
      </div>

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
                    formatter={(value: number, name: string) => {
                      const isSpend = name.toLowerCase() === 'spend';
                      return [isSpend ? `$${value.toFixed(2)}` : value, isSpend ? 'Spend' : 'Leads'];
                    }}
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
