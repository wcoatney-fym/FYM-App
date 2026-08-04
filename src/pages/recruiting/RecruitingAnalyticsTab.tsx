import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Activity, BarChart3, DollarSign,
} from 'lucide-react';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend, Cell,
  BarChart,
} from 'recharts';
import {
  MOCK_CAMPAIGN_PERFORMANCE, MOCK_CAMPAIGNS,
  MOCK_ROI_BY_AGENCY, MOCK_ROI_BY_AGENT,
} from '@/lib/recruiting';
import {
  fetchCampaigns, fetchCampaignPerformance,
  fetchRoiByAgency, fetchRoiByAgent,
} from '@/lib/recruiting';
import type { Campaign, CampaignPerformance as CampaignPerfType, RoiByAgency, RoiByAgent } from '@/lib/recruiting';
import { useCachedFetch } from '@/hooks/useCachedFetch';

type AnalyticsView = 'performance' | 'roi';

// ── Funnel Chart (simple horizontal bars) ──────────────────────────────────
function ConversionFunnel({ funnel }: { funnel: { leads: number; contacted: number; quoted: number; placed: number; lost: number } }) {
  const stages = [
    { name: 'Leads', value: funnel.leads, fill: 'hsl(199,89%,48%)' },
    { name: 'Contacted', value: funnel.contacted, fill: 'hsl(38,92%,50%)' },
    { name: 'Quoted', value: funnel.quoted, fill: 'hsl(262,83%,58%)' },
    { name: 'Placed', value: funnel.placed, fill: 'hsl(142,71%,45%)' },
  ];

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const pct = funnel.leads > 0 ? (stage.value / funnel.leads * 100) : 0;
        const dropoff = i > 0 ? Math.round((1 - stage.value / stages[i - 1].value) * 100) : 0;
        return (
          <div key={stage.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{stage.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{stage.value}</span>
                <span className="text-xs text-muted-foreground">({pct.toFixed(1)}%)</span>
                {i > 0 && <span className="text-xs text-red-400/70">-{dropoff}%</span>}
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: stage.fill }}
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

// ── Performance View ───────────────────────────────────────────────────────
function PerformanceView() {
  const { data: liveCampaigns } = useCachedFetch<Campaign[]>('recruiting-campaigns-analytics', fetchCampaigns, { maxAge: 60 * 60 * 1000 });
  const campaigns = liveCampaigns ?? MOCK_CAMPAIGNS;
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');

  // Set default selected campaign when data loads
  const effectiveSelected = selectedCampaign || campaigns[0]?.id || '';

  const { data: livePerf } = useCachedFetch<CampaignPerfType | null>(
    `recruiting-perf-${effectiveSelected}`,
    () => effectiveSelected ? fetchCampaignPerformance(effectiveSelected) : Promise.resolve(null),
    { maxAge: 60 * 60 * 1000, deps: [effectiveSelected], skip: !effectiveSelected }
  );

  const perf = livePerf ?? MOCK_CAMPAIGN_PERFORMANCE.find(p => p.campaignId === effectiveSelected) ?? MOCK_CAMPAIGN_PERFORMANCE[0];

  const chartData = useMemo(() =>
    perf.dailyData.map(d => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })), [perf.dailyData]);

  return (
    <div className="space-y-6">
      {/* Campaign selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Campaign:</span>
        <Select value={effectiveSelected} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-64 bg-card/60 border-border/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map(c => (
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
                    formatter={(value: number, name: string) => [name === 'spend' ? `$${value.toFixed(2)}` : value, name === 'spend' ? 'Spend' : name === 'leads' ? 'Leads' : 'CPL']}
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

      {/* Funnel + Ad Sets side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HudFrame>
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-5">
              <ConversionFunnel funnel={perf.funnel} />
            </CardContent>
          </Card>
        </HudFrame>

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
      </div>
    </div>
  );
}

// ── ROI View ───────────────────────────────────────────────────────────────
function RoiView() {
  const { data: liveAgencyData } = useCachedFetch<RoiByAgency[]>('recruiting-roi-agency', fetchRoiByAgency, { maxAge: 60 * 60 * 1000 });
  const { data: liveAgentData } = useCachedFetch<RoiByAgent[]>('recruiting-roi-agent', fetchRoiByAgent, { maxAge: 60 * 60 * 1000 });
  const agencyData = liveAgencyData ?? MOCK_ROI_BY_AGENCY;
  const agentData = liveAgentData ?? MOCK_ROI_BY_AGENT;

  const agencyChartData = useMemo(() =>
    agencyData.map(a => ({
      name: a.agencyName.length > 20 ? a.agencyName.slice(0, 18) + '…' : a.agencyName,
      cpa: a.cpa,
      placed: a.placed,
      convRate: a.conversionRate,
    })), [agencyData]);

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
        {/* ROI by Agency */}
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
                  {agencyData.map(a => (
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

        {/* ROI by Agent */}
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
                  {agentData.map(a => (
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

  return (
    <div className="p-6 space-y-6">
      {/* Data source banner — ROI data still requires GHL integration */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
        <Activity size={14} />
        <span>Performance uses live Meta data • ROI by agency/agent requires GHL lead-to-placement mapping (coming soon)</span>
      </div>

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

      {view === 'performance' ? <PerformanceView /> : <RoiView />}
    </div>
  );
}
