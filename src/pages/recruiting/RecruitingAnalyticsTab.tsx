import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  Activity, DollarSign, ArrowRight, Clock,
  TrendingDown, AlertTriangle, Users, FileText,
} from 'lucide-react';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Cell,
} from 'recharts';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';

import {
  fetchStageDropoffs, fetchStalledRecruits, fetchStageTimings,
  fetchProducingAgents, fetchRecruitingRoiSummary,
  fetchRecruitingFunnel,
} from '@/lib/recruiting';
import type {
  RecruitingDateFilter, StageDropoff, StallEntry, StageTiming,
} from '@/lib/recruiting';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';

type AnalyticsView = 'conversion' | 'roi';

// ── Conversion Waterfall Chart ─────────────────────────────────────────────
const WATERFALL_COLORS = [
  'hsl(199,89%,48%)', // Lead→Attendee
  'hsl(38,92%,50%)',  // Attendee→Hired
  'hsl(262,83%,58%)', // Hired→Contracting
  'hsl(199,65%,55%)', // Contracting→RTS
  'hsl(142,71%,45%)', // RTS→Producing
];

function ConversionWaterfall({ dropoffs }: { dropoffs: StageDropoff[] }) {
  const chartData = dropoffs.map((d, i) => ({
    name: `${d.from} → ${d.to}`,
    convRate: d.convRate,
    dropped: 100 - d.convRate,
    fill: WATERFALL_COLORS[i] ?? WATERFALL_COLORS[0],
  }));

  return (
    <HudFrame>
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-4 flex items-center gap-1.5">
            <TrendingDown size={12} /> Stage Conversion Rates
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={v => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Conversion']}
                />
                <Bar dataKey="convRate" name="Conversion %" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} opacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </HudFrame>
  );
}

// ── Drop-off Detail Table ──────────────────────────────────────────────────
function DropoffTable({ dropoffs }: { dropoffs: StageDropoff[] }) {
  return (
    <HudFrame>
      <Card className="bg-card/60 border-border/30 overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Stage Transition</th>
                <th className="text-right px-3 py-3">Entered</th>
                <th className="text-right px-3 py-3">Converted</th>
                <th className="text-right px-3 py-3">Dropped</th>
                <th className="text-right px-3 py-3">Conv %</th>
                <th className="text-right px-3 py-3">Avg Days</th>
                <th className="text-right px-4 py-3">Med Days</th>
              </tr>
            </thead>
            <tbody>
              {dropoffs.map((d, i) => (
                <tr key={i} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-foreground">
                      {d.from} <ArrowRight size={12} className="text-muted-foreground" /> {d.to}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{d.entered}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-400">{d.converted}</td>
                  <td className="px-3 py-3 text-right font-mono text-red-400">{d.dropped}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-mono font-semibold ${d.convRate >= 70 ? 'text-emerald-400' : d.convRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                      {d.convRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                    {d.avgDays > 0 ? `${d.avgDays}d` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {d.medianDays > 0 ? `${d.medianDays}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </HudFrame>
  );
}

// ── Stage Velocity Cards ───────────────────────────────────────────────────
function StageVelocity({ timings }: { timings: StageTiming[] }) {
  return (
    <HudFrame>
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-4 flex items-center gap-1.5">
            <Clock size={12} /> Stage Velocity
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {timings.map(t => (
              <div key={t.stage} className="bg-muted/10 rounded-lg p-3 text-center border border-border/20">
                <p className="text-xs text-muted-foreground mb-1">{t.label}</p>
                <p className={`text-xl font-bold font-mono ${t.avgDays > 14 ? 'text-amber-400' : t.avgDays > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {t.avgDays > 0 ? `${t.avgDays}d` : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  med {t.medianDays > 0 ? `${t.medianDays}d` : '—'} · n={t.count}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </HudFrame>
  );
}

// ── Stalled Recruits Table ─────────────────────────────────────────────────
const STALL_STAGE_COLORS: Record<string, string> = {
  lead: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  attendee: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  hired: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  contracting: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  rts: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

function StalledTable({ stalled }: { stalled: StallEntry[] }) {
  if (stalled.length === 0) {
    return (
      <HudFrame>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground">No recruits stalled beyond 30 days</p>
          </CardContent>
        </Card>
      </HudFrame>
    );
  }

  return (
    <HudFrame>
      <Card className="bg-card/60 border-border/30 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border/30">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-400" />
              Stalled Recruits ({stalled.length}) — 30+ days in current stage
            </p>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-center px-3 py-2">Stage</th>
                  <th className="text-right px-3 py-2">Days Stuck</th>
                  <th className="text-right px-4 py-2">Since</th>
                </tr>
              </thead>
              <tbody>
                {stalled.map((s, i) => (
                  <tr key={i} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{s.name}</p>
                      {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className={STALL_STAGE_COLORS[s.stage] ?? ''}>
                        {s.stage.charAt(0).toUpperCase() + s.stage.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-mono font-semibold ${s.daysInStage > 60 ? 'text-red-400' : 'text-amber-400'}`}>
                        {s.daysInStage}d
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground text-xs">
                      {new Date(s.enteredStageAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </HudFrame>
  );
}

// ── Conversion View ────────────────────────────────────────────────────────
function ConversionView({ dateFilter }: { dateFilter: RecruitingDateFilter }) {
  const cacheKey = `recruiting-conversion-${dateFilter.startDate.slice(0, 10)}-${dateFilter.endDate.slice(0, 10)}`;

  const { data: multiData } = useCachedMultiFetch(cacheKey, {
    dropoffs: () => fetchStageDropoffs(dateFilter),
    stalled: () => fetchStalledRecruits(30, dateFilter),
    timings: () => fetchStageTimings(dateFilter),
    funnel: () => fetchRecruitingFunnel(dateFilter),
  }, { deps: [dateFilter.startDate, dateFilter.endDate] });

  const dropoffs = multiData?.dropoffs ?? [];
  const stalled = multiData?.stalled ?? [];
  const timings = multiData?.timings ?? [];
  const funnel = multiData?.funnel;

  // Compute overall conversion rate (Lead → RTS)
  const overallConv = funnel && funnel.leads > 0
    ? ((funnel.rts / funnel.leads) * 100).toFixed(1)
    : '—';

  // Find the worst bottleneck
  const worstDropoff = dropoffs.length > 0
    ? dropoffs.reduce((worst, d) => d.convRate < worst.convRate ? d : worst)
    : null;

  return (
    <div className="space-y-6">
      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Lead → RTS Rate</p>
            <p className="text-2xl font-bold font-mono mt-1">{overallConv}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Biggest Bottleneck</p>
            <p className="text-lg font-bold mt-1 text-red-400">
              {worstDropoff ? `${worstDropoff.from} → ${worstDropoff.to}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {worstDropoff ? `${worstDropoff.convRate.toFixed(1)}% conversion` : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Recruits Stalled</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${stalled.length > 0 ? 'text-amber-400' : 'text-foreground'}`}>
              {stalled.length}
            </p>
            <p className="text-xs text-muted-foreground">30+ days in stage</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Pipeline</p>
            <p className="text-2xl font-bold font-mono mt-1">{funnel?.leads ?? 0}</p>
            <p className="text-xs text-muted-foreground">all-time recruits</p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion waterfall chart */}
      <ConversionWaterfall dropoffs={dropoffs} />

      {/* Drop-off detail table */}
      <DropoffTable dropoffs={dropoffs} />

      {/* Stage velocity */}
      <StageVelocity timings={timings} />

      {/* Stalled recruits */}
      <StalledTable stalled={stalled} />
    </div>
  );
}

// ── ROI View ───────────────────────────────────────────────────────────────
function RoiView() {
  const { data: multiData } = useCachedMultiFetch('recruiting-roi-live', {
    agents: () => fetchProducingAgents(),
    summary: () => fetchRecruitingRoiSummary(),
  });

  const producingAgents = multiData?.agents ?? [];
  const summary = multiData?.summary ?? {
    totalSpend: 0, totalLeads: 0, totalHired: 0, totalProducing: 0,
    cpl: 0, cpa: 0, totalActivePolicies: 0, totalActiveAp: 0,
  };

  // Compute totals from producing agents data
  const totalActivePolicies = producingAgents.reduce((s, a) => s + a.activePolicies, 0);
  const totalActiveAp = producingAgents.reduce((s, a) => s + a.activeAp, 0);

  return (
    <div className="space-y-6">
      {/* ROI KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Ad Spend</p>
            <p className="text-xl font-bold font-mono mt-1">${summary.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">CPL</p>
            <p className="text-xl font-bold font-mono mt-1">${summary.cpl.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">cost per lead</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">CPA</p>
            <p className="text-xl font-bold font-mono mt-1">${summary.cpa.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">cost per hire</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Producing Agents</p>
            <p className="text-xl font-bold font-mono mt-1">{producingAgents.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Policies</p>
            <p className="text-xl font-bold font-mono mt-1">{totalActivePolicies.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Annual Premium</p>
            <p className="text-xl font-bold font-mono mt-1 text-emerald-400">
              ${totalActiveAp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Producing Agents Table */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Users size={12} /> Producing Agents — Matched to Production
              </p>
              <span className="text-xs text-muted-foreground">{producingAgents.length} agents</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Agent</th>
                    <th className="text-left px-3 py-3">NPN</th>
                    <th className="text-left px-3 py-3">Carriers</th>
                    <th className="text-right px-3 py-3">Policies</th>
                    <th className="text-right px-3 py-3">Annual Premium</th>
                    <th className="text-right px-3 py-3">First Issue</th>
                    <th className="text-right px-4 py-3">Latest Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {producingAgents.map((a, i) => (
                    <tr key={i} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground capitalize">{a.name.toLowerCase()}</p>
                        {a.writingNumber && <p className="text-xs text-muted-foreground font-mono">{a.writingNumber}</p>}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{a.npn ?? '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {a.carriers.map(c => {
                            const style = c === 'UNL'
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : c === 'GTL'
                                ? 'bg-violet-500/20 text-violet-400'
                                : 'bg-gray-500/20 text-gray-400';
                            return (
                              <span key={c} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${style}`}>
                                {c}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{a.activePolicies}</td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-400 font-semibold">
                        ${a.activeAp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground text-xs">
                        {a.firstIssueDate
                          ? new Date(a.firstIssueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                        {a.lastIssueDate
                          ? new Date(a.lastIssueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {producingAgents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <FileText size={20} />
                          <span>No producing agents matched yet — agents appear here when their name matches between the recruiting pipeline and Max's production DB</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </HudFrame>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function RecruitingAnalyticsTab() {
  const [view, setView] = useState<AnalyticsView>('conversion');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));

  const dateFilter: RecruitingDateFilter = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange]);

  function handleDateChange(range: DateRange, preset: DatePreset) {
    setDateRange(range);
    setDatePreset(preset);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with view toggle + date selector */}
      <div className="flex items-center justify-between">
        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-card/60 border border-border/30 rounded-lg w-fit">
          <button
            onClick={() => setView('conversion')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'conversion'
                ? 'bg-[hsl(199,89%,48%)]/15 text-[hsl(199,89%,48%)] border border-[hsl(199,89%,48%)]/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5"><Activity size={14} /> Conversion</span>
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

        {view === 'conversion' && (
          <TimePeriodSelector preset={datePreset} dateRange={dateRange} onChange={handleDateChange} />
        )}
      </div>

      {view === 'conversion' ? <ConversionView dateFilter={dateFilter} /> : <RoiView />}
    </div>
  );
}
