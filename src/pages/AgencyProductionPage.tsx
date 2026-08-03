import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import {
  fetchAgencyProduction,
  fetchAgentProduction,
  fetchDailyProduction,
  fetchMonthlyProduction,
  fetchProductMix,
} from '@/lib/prod-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  ArrowLeft, FileText, DollarSign, TrendingUp, Users,
  ChevronRight, Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, type DailyRow, type TrendPoint, DEFAULT_PRESET, getDateRange, getGranularity, aggregateTrend, fmtMonth } from '@/lib/dateUtils';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgencyStats {
  agency_id: string;
  agency_name: string | null;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  pending_policies: number;
  at_risk_policies: number;
  active_monthly_premium: number;
  active_annual_premium: number;
  avg_annual_premium: number;
  policies_this_month: number;
  ap_this_month: number;
  policies_last_month: number;
  ap_last_month: number;
}

interface AgentRow {
  agency_id: string;
  agent_id: string | null;
  agent_name: string | null;
  writing_number: string | null;
  active_policies: number;
  active_annual_premium: number;
  avg_annual_premium: number;
  policies_this_month: number;
  ap_this_month: number;
  at_risk_policies: number;
  retention_pct: number | null;
}

interface ProductMix { product_type: string; count: number }

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) { return n.toLocaleString(); }


const PIE_COLORS = ['hsl(199 89% 48%)', 'hsl(142 71% 45%)'];

// ── Component ──────────────────────────────────────────────────────────────
export function AgencyProductionPage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [stats, setStats] = useState<AgencyStats | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [productMix, setProductMix] = useState<ProductMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));

  useEffect(() => {
    if (!agencyId || !supabase) return;
    async function load() {
      setLoading(true);
        if (!supabase) { setLoading(false); return; }
      try {
        const startDate = dateRange.startDate.split('T')[0];
        const endDate = dateRange.endDate.split('T')[0];
        const useRpc = datePreset !== 'allTime';

        // Agency stats from prod DB edge function
        const dateParams = useRpc
          ? { agency_id: agencyId!, start_date: startDate, end_date: endDate }
          : { agency_id: agencyId! };

        const agencyData = await fetchAgencyProduction(dateParams);
        const match = agencyData.find(r => r.agency_id === agencyId);
        if (match) {
          setStats({
            agency_id: match.agency_id,
            agency_name: null,
            total_policies: match.total_policies,
            active_policies: match.active_policies,
            terminated_policies: match.terminated_policies,
            pending_policies: match.pending_policies,
            at_risk_policies: match.at_risk_policies,
            active_monthly_premium: match.active_monthly_premium,
            active_annual_premium: match.active_annual_premium,
            avg_annual_premium: match.avg_annual_premium,
            policies_this_month: match.policies_this_month,
            ap_this_month: match.ap_this_month,
            policies_last_month: match.policies_last_month,
            ap_last_month: match.ap_last_month,
          });
        } else {
          setStats(null);
        }

        // Agent breakdown from prod DB edge function
        const agentData = await fetchAgentProduction(dateParams);
        setAgents(agentData.map(a => ({
          agency_id: a.agency_id,
          agent_id: a.agent_id,
          agent_name: a.agent_name,
          writing_number: a.writing_number,
          active_policies: a.active_policies,
          active_annual_premium: a.active_annual_premium,
          avg_annual_premium: a.avg_annual_premium,
          policies_this_month: a.policies_this_month,
          ap_this_month: a.ap_this_month,
          at_risk_policies: a.at_risk_policies,
          retention_pct: a.retention_pct,
        })));

        // Trend data from prod DB edge function
        const gran = getGranularity(dateRange);
        if (useRpc) {
          const dailyData = await fetchDailyProduction(dateParams);
          const rows: DailyRow[] = dailyData.map(d => ({
            agency_id: d.agency_id,
            agent_id: null,
            writing_number: null,
            product_type: '',
            day: d.day,
            policies: d.policies,
            annual_premium: d.annual_premium,
          }));
          setTrend(aggregateTrend(rows, gran));
        } else {
          const monthlyData = await fetchMonthlyProduction({ agency_id: agencyId! });
          const byMonth = new Map<string, { policies: number; ap: number }>();
          monthlyData.forEach(r => {
            const existing = byMonth.get(r.month) || { policies: 0, ap: 0 };
            existing.policies += r.policies;
            existing.ap += r.annual_premium;
            byMonth.set(r.month, existing);
          });
          setTrend(
            Array.from(byMonth.entries())
              .map(([month, v]) => ({ bucket: month, label: fmtMonth(month), policies: v.policies, ap: v.ap }))
              .sort((a, b) => a.bucket.localeCompare(b.bucket))
              .slice(-12)
          );
        }

        // Product mix from prod DB edge function
        const mixData = await fetchProductMix({ agency_id: agencyId! });
        setProductMix(mixData.map(m => ({ product_type: m.product_type, count: m.count })));

      } catch (err) {
        console.error('Agency production load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agencyId, dateRange, datePreset]);

  const filteredAgents = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(a =>
      (a.agent_name || '').toLowerCase().includes(q) ||
      (a.writing_number || '').toLowerCase().includes(q)
    );
  }, [agents, search]);

  // Guard: agency admins (non org-wide) cannot view another agency's production via URL manipulation.
  if (!isOrgWide && effectiveAgencyId && agencyId !== effectiveAgencyId) {
    return <Navigate to="/production" replace />;
  }

  if (loading) {
    return (
      <>
        <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-lg shimmer" />)}
        </div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <Header title="Agency Not Found" />
        <div className="p-6 text-center text-muted-foreground">
          <p>No production data found for this agency.</p>
          <Link to="/production" className="text-primary hover:underline mt-2 inline-block">
            ← Back to Production
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
       <Header
        title={stats.agency_name || 'Unknown Agency'}
      />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
        {/* Back nav + time filter */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link
            to="/production"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} /> Back to Production
          </Link>
          <TimePeriodSelector
            preset={datePreset}
            dateRange={dateRange}
            onChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
          />
        </div>

        {/* KPI Strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Active Policies',
              end: stats.active_policies,
              fmt: fmtNum,
              sub: `${fmtNum(stats.pending_policies)} pending`,
              icon: FileText, color: 'text-primary', bg: 'bg-cyan-500/10',
            },
            {
              title: 'Annual Premium',
              end: Number(stats.active_annual_premium),
              fmt: fmt$,
              sub: `Avg ${fmt$(Number(stats.avg_annual_premium))}/policy`,
              icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10',
            },
            {
              title: 'This Month',
              end: stats.policies_this_month,
              fmt: (n: number) => `${fmtNum(n)} policies`,
              icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10',
            },
            {
              title: 'At Risk',
              end: stats.at_risk_policies,
              fmt: fmtNum,
              sub: agents.length > 0 ? `${agents.length} agents` : 'No linked agents',
              icon: Users,
              color: stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground/70',
              bg: stats.at_risk_policies > 0 ? 'bg-red-500/10' : 'bg-secondary',
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt}
                        className="text-2xl font-bold text-foreground mt-1 block font-data"
                      />
                      {card.sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>}
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

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Monthly Trend */}
          <Card className="border-border lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base text-foreground">
                Production — {dateRange.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(215 20% 55%)"
                      fontSize={11}
                      interval={trend.length > 15 ? Math.floor(trend.length / 10) : 0}
                      angle={trend.length > 12 ? -45 : 0}
                      textAnchor={trend.length > 12 ? 'end' : 'middle'}
                      height={trend.length > 12 ? 50 : 30}
                    />
                    <YAxis yAxisId="ap" orientation="left" stroke="hsl(215 20% 55%)" fontSize={11} tickFormatter={v => fmt$(v)} />
                    <YAxis yAxisId="policies" orientation="right" stroke="hsl(215 20% 55%)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(217 33% 20%)',
                        background: 'hsl(222 47% 9%)',
                        color: 'hsl(210 40% 98%)',
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'ap' ? fmt$(value) : fmtNum(value),
                        name === 'ap' ? 'Annual Premium' : 'Policies',
                      ]}
                      labelFormatter={(label: string) => label}
                    />
                    <Bar yAxisId="ap" dataKey="ap" fill="hsl(199 89% 48%)" fillOpacity={0.3} stroke="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="policies" type="monotone" dataKey="policies" stroke="hsl(142 71% 45%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(142 71% 45%)' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Product Mix */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base text-foreground">Product Mix</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={productMix}
                      dataKey="count"
                      nameKey="product_type"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      label={({ product_type, percent }) => `${product_type} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {productMix.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(217 33% 20%)',
                        background: 'hsl(222 47% 9%)',
                        color: 'hsl(210 40% 98%)',
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2">
                {productMix.map((p, i) => (
                  <div key={p.product_type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {p.product_type}: {fmtNum(p.count)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Breakdown */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-foreground">
              Agent Breakdown
              {agents.length > 0 && (
                <Badge className="ml-2 bg-secondary text-muted-foreground border-border border">
                  {agents.length}
                </Badge>
              )}
            </CardTitle>
            <div className="relative w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search agents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredAgents.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                {agents.length === 0
                  ? 'No agents linked to profiles yet. Agent data will appear once writing numbers are mapped.'
                  : 'No agents match your search.'}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                <div className="grid grid-cols-8 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data">
                  <span className="col-span-2">Agent</span>
                  <span className="text-right">Active</span>
                  <span className="text-right">Annual Premium</span>
                  <span className="text-right">This Month</span>
                  <span className="text-right">Retention</span>
                  <span className="text-right">At Risk</span>
                  <span />
                </div>
                {filteredAgents.map(agent => (
                  <div
                    key={agent.agent_id || agent.writing_number || Math.random()}
                    className="grid grid-cols-8 gap-2 px-4 py-3 text-sm row-hover"
                  >
                    <div className="col-span-2 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {agent.agent_name || 'Unknown Agent'}
                      </p>
                      {agent.writing_number && (
                        <p className="text-xs text-muted-foreground/60 font-data">WN: {agent.writing_number}</p>
                      )}
                    </div>
                    <span className="text-right text-muted-foreground font-data self-center">
                      {fmtNum(agent.active_policies)}
                    </span>
                    <span className="text-right text-foreground/80 font-medium font-data self-center">
                      {fmt$(Number(agent.active_annual_premium))}
                    </span>
                    <span className="text-right text-foreground font-data font-medium self-center">
                      {fmtNum(agent.policies_this_month)}
                    </span>
                    <span className={`text-right font-medium font-data self-center ${
                      agent.retention_pct === null ? 'text-muted-foreground/40'
                        : Number(agent.retention_pct) >= 90 ? 'text-emerald-400'
                        : Number(agent.retention_pct) >= 85 ? 'text-amber-400'
                        : 'text-red-400'
                    }`}>
                      {agent.retention_pct !== null ? `${agent.retention_pct}%` : '—'}
                    </span>
                    <span className={`text-right font-data self-center ${
                      agent.at_risk_policies > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground/40'
                    }`}>
                      {agent.at_risk_policies || '—'}
                    </span>
                    <span className="text-center self-center">
                      {agent.agent_id ? (
                        <Link to={`/production/${agencyId}/agent/${agent.agent_id}`} state={{ from: `/production/${agencyId}` }}>
                          <ChevronRight size={14} className="text-muted-foreground/40 hover:text-primary transition-colors" />
                        </Link>
                      ) : (
                        <ChevronRight size={14} className="text-muted-foreground/20" />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
