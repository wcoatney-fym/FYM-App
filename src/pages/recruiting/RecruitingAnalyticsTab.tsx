import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Activity, BarChart3, DollarSign, ArrowRight, Clock,
} from 'lucide-react';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend, Cell,
  BarChart,
} from 'recharts';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';
import {
  MOCK_CAMPAIGNS, MOCK_CAMPAIGN_PERFORMANCE,
  MOCK_ROI_BY_AGENCY, MOCK_ROI_BY_AGENT,
} from '@/lib/recruiting';
import {
  fetchCampaigns, fetchCampaignPerformance, fetchRecruitingFunnel,
  fetchStageTimings, fetchRoiByAgency, fetchRoiByAgent,
} from '@/lib/recruiting';
import type {
  RecruitingFunnel, StageTiming, RecruitingDateFilter,
  CampaignPerformance, RoiByAgency, RoiByAgent, Campaign,
} from '@/lib/recruiting';
import { RECRUITING_STAGES } from '@/lib/recruiting/types';
import { useCachedFetch, useCachedMultiFetch } from '@/hooks/useCachedFetch';

type AnalyticsView = 'performance' | 'roi';

// ── Recruiting Pipeline Funnel ─────────────────────────────────────────────
function RecruitingPipelineFunnel({ funnel }: { funnel: RecruitingFunnel }) {
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
              <span className="text-xs text-muted-foreground/60">n={t.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Performance View ───────────────────────────────────────────────────────
function PerformanceView({ dateFilter, campaigns }: { dateFilter: RecruitingDateFilter; campaigns: Campaign[] }) {
  const effectiveCampaigns = campaigns.length > 0 ? campaigns : MOCK_CAMPAIGNS;
  const [selectedCampaign, setSelectedCampaign] = useState(effectiveCampaigns[0]?.id ?? '');

  const cacheKey = `recruiting-perf-${selectedCampaign}-${dateFilter.startDate.slice(0, 10)}-${dateFilter.endDate.slice(0, 10)}`;

  const { data: multiData } = useCachedMultiFetch(cacheKey, {
    perf: () => fetchCampaignPerformance(selectedCampaign, dateFilter),
    funnel: () => fetchRecruitingFunnel(dateFilter),
    timings: () => fetchStageTimings(dateFilter),
  }, { deps: [selectedCampaign, dateFilter.startDate, dateFilter.endDate] });

  const perf = multiData?.perf ?? MOCK_CAMPAIGN_PERFORMANCE[0];
  const funnel = multiData?.funnel ?? { leads: 0, attendees: 0, hired: 0, contracting: 0, rts: 0, producing: 0, lost: 0 };
  const timings = multiData?.timings ?? [];

  const chartData = useMemo(() =>
    (perf?.dailyData ?? []).map(d => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })), [perf]);

  return (
    <div className="space-y-6">
      {/* Campaign selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Campaign:</span>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-64 bg-card/60 border-border/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {effectiveCampaigns.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Daily spend + leads chart */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={4} />
                  <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                  <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
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

      {/* Funnel + Stage Timing + Ad Sets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HudFrame>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-4 flex items-center gap-1.5">
                <ArrowRight size={12} /> Recruiting Pipeline
              </p>
              <RecruitingPipelineFunnel funnel={funnel} />
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

      {/* Ad Set Performance Table */}
      {perf && perf.adSets.length > 0 && (
        <HudFrame>
          <Card className="bg-card/60 border-border/30 overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Ad Set</th>
                    <th className="text-right px-3 py-3">Spend</th>
                    <th className="text-right px-3 py-3">Leads</th>
                    <th className="text-right px-3 py-3">CPL</th>
                    <th className="text-right px-4 py-3">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.adSets.map(as => (
                    <tr key={as.id} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                      <td className="px-4 py-3 text-foreground">{as.name}</td>
                      <td className="px-3 py-3 text-right font-mono">${as.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-3 py-3 text-right font-mono">{as.leads}</td>
                      <td className="px-3 py-3 text-right font-mono">${as.cpl.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{(as.ctr * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </HudFrame>
      )}
    </div>
  );
}

// ── ROI View ───────────────────────────────────────────────────────────────
function RoiView() {
  const { data: agencyData } = useCachedFetch('recruiting-roi-agency', fetchRoiByAgency);
  const { data: agentData } = useCachedFetch('recruiting-roi-agent', fetchRoiByAgent);

  const effectiveAgencyData = agencyData ?? MOCK_ROI_BY_AGENCY;
  const effectiveAgentData = agentData ?? MOCK_ROI_BY_AGENT;

  const agencyChartData = useMemo(() =>
    effectiveAgencyData.map(a => ({
      name: a.agencyName.length > 20 ? a.agencyName.slice(0, 18) + '…' : a.agencyName,
      cpa: a.cpa,
      placed: a.placed,
      convRate: a.conversionRate,
    })), [effectiveAgencyData]);

  return (
    <div className="space-y-6">
      {/* CPA by Agency chart */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agencyChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'CPA']}
                  />
                  <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                    {agencyChartData.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? 'hsl(142,71%,45%)' : i >= agencyChartData.length - 2 ? 'hsl(0,84%,60%)' : 'hsl(199,89%,48%)'} opacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </HudFrame>

      {/* Tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HudFrame>
          <Card className="bg-card/60 border-border/30 overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Agency</th>
                    <th className="text-right px-3 py-3">Spend</th>
                    <th className="text-right px-3 py-3">Leads</th>
                    <th className="text-right px-3 py-3">Placed</th>
                    <th className="text-right px-3 py-3">CPA</th>
                    <th className="text-right px-4 py-3">Conv%</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveAgencyData.map(a => (
                    <tr key={a.agencyId} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                      <td className="px-4 py-3 text-foreground text-xs">{a.agencyName}</td>
                      <td className="px-3 py-3 text-right font-mono">${a.spend.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-mono">{a.leads}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{a.placed}</td>
                      <td className="px-3 py-3 text-right font-mono">${a.cpa.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{a.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </HudFrame>

        <HudFrame>
          <Card className="bg-card/60 border-border/30 overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Agent</th>
                    <th className="text-left px-3 py-3">Agency</th>
                    <th className="text-right px-3 py-3">Leads</th>
                    <th className="text-right px-3 py-3">Placed</th>
                    <th className="text-right px-3 py-3">CPA</th>
                    <th className="text-right px-4 py-3">Conv%</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveAgentData.map(a => (
                    <tr key={a.agentId} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                      <td className="px-4 py-3 text-foreground">{a.agentName}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">{a.agencyName}</td>
                      <td className="px-3 py-3 text-right font-mono">{a.leads}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{a.placed}</td>
                      <td className="px-3 py-3 text-right font-mono">${a.cpa.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{a.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </HudFrame>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function RecruitingAnalyticsTab() {
  const [view, setView] = useState<AnalyticsView>('performance');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));

  const dateFilter: RecruitingDateFilter = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange]);

  const { data: campaigns } = useCachedFetch('recruiting-campaigns', fetchCampaigns);

  function handleDateChange(range: DateRange, preset: DatePreset) {
    setDateRange(range);
    setDatePreset(preset);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with date selector */}
      <div className="flex items-center justify-between">
        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-card/60 border border-border/30 rounded-lg w-fit">
          <button
            onClick={() => setView('performance')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'performance'
                ? 'bg-[hsl(199,89%,48%)]/15 text-[hsl(199,89%,48%)] border border-[hsl(199,89%,48%)]/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5"><BarChart3 size={14} /> Performance</span>
          </button>
          <button
            onClick={() => setView('roi')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'roi'
                ? 'bg-[hsl(199,89%,48%)]/15 text-[hsl(199,89%,48%)] border border-[hsl(199,89%,48%)]/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5"><DollarSign size={14} /> ROI</span>
          </button>
        </div>

        <TimePeriodSelector preset={datePreset} dateRange={dateRange} onChange={handleDateChange} />
      </div>

      {/* Mock data banner */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
        <Activity size={14} />
        <span>Displaying sample data — connect Meta Ads API to see live analytics</span>
      </div>

      {view === 'performance' ? <PerformanceView dateFilter={dateFilter} campaigns={campaigns ?? []} /> : <RoiView />}
    </div>
  );
}
