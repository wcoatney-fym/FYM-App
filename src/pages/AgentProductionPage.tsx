/**
 * Agent Production Deep-Dive
 *
 * Per-agent view: KPI strip, monthly trend, policy list, retention gauge.
 * Reads from agent_production view + policy_cache + monthly_production.
 * Route: /production/:agencyId/agent/:agentId
 */
import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  ArrowLeft, FileText, DollarSign, TrendingUp, ShieldCheck,
  AlertTriangle, Search, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgentStats {
  agent_id: string;
  agent_name: string | null;
  writing_number: string | null;
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
  retained_policies: number;
  ever_drafted: number;
  retention_pct: number | null;
}

interface PolicyRow {
  policy_number: string;
  product_type: string;
  status: string;
  monthly_premium: number;
  annual_premium: number;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  draft_count: number;
  is_at_risk: boolean;
  flag_type: string | null;
  days_since_paid: number | null;
}

interface MonthlyPoint { month: string; policies: number; ap: number }
interface ProductMix { product_type: string; count: number }

type PolicySort = 'effective' | 'premium' | 'status' | 'drafts' | 'paid';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) { return n.toLocaleString(); }
function fmtMonth(iso: string) {
  const [y, m] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function statusBadge(status: string, isAtRisk: boolean) {
  if (isAtRisk) return { label: 'At Risk', cls: 'bg-red-500/15 text-red-400 border-red-500/20' };
  switch (status) {
    case 'active': return { label: 'Active', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
    case 'terminated': return { label: 'Terminated', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' };
    case 'pending': return { label: 'Pending', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' };
    default: return { label: status, cls: 'bg-secondary text-muted-foreground border-border' };
  }
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

const PIE_COLORS = ['hsl(199 89% 48%)', 'hsl(142 71% 45%)'];

// ── Component ──────────────────────────────────────────────────────────────
export function AgentProductionPage() {
  const { agencyId, agentId } = useParams<{ agencyId: string; agentId: string }>();
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [trend, setTrend] = useState<MonthlyPoint[]>([]);
  const [productMix, setProductMix] = useState<ProductMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'terminated' | 'pending' | 'at_risk'>('all');
  const [sortKey, setSortKey] = useState<PolicySort>('effective');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!agentId || !supabase) return;
    async function load() {
      setLoading(true);
      if (!supabase) { setLoading(false); return; }
      try {
        // Agent stats from view
        const { data: agentData } = await supabase
          .from('agent_production')
          .select('*')
          .eq('agent_id', agentId!)
          .single();
        if (agentData) setStats(agentData as unknown as AgentStats);

        // Policies — paginate
        const allPolicies: PolicyRow[] = [];
        const PAGE = 1000;
        let offset = 0;
        let done = false;
        while (!done) {
          const { data: policyData } = await supabase
            .from('book_of_business')
            .select('policy_number, product_type, status, monthly_premium, annual_premium, policy_effective_date, paid_to_date, draft_count, is_at_risk, flag_type, days_since_paid')
            .eq('agent_id', agentId!)
            .order('policy_effective_date', { ascending: false })
            .range(offset, offset + PAGE - 1);
          if (!policyData || policyData.length === 0) { done = true; break; }
          allPolicies.push(...(policyData as unknown as PolicyRow[]));
          if (policyData.length < PAGE) done = true;
          else offset += PAGE;
        }
        setPolicies(allPolicies);

        // Monthly trend — agent-level from policy_cache
        const { data: cacheRows } = await supabase
          .from('policy_cache')
          .select('policy_effective_date, plan_premium')
          .eq('agent_id', agentId!)
          .not('policy_effective_date', 'is', null);

        const byMonth = new Map<string, { policies: number; ap: number }>();
        (cacheRows || []).forEach((r: any) => {
          if (!r.policy_effective_date) return;
          const m = r.policy_effective_date.substring(0, 7);
          const existing = byMonth.get(m) || { policies: 0, ap: 0 };
          existing.policies += 1;
          existing.ap += (Number(r.plan_premium) || 0) * 12;
          byMonth.set(m, existing);
        });
        setTrend(
          Array.from(byMonth.entries())
            .map(([month, v]) => ({ month, ...v }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12)
        );

        // Product mix from active policies
        const mixMap = new Map<string, number>();
        allPolicies
          .filter(p => p.status === 'active')
          .forEach(p => {
            mixMap.set(p.product_type, (mixMap.get(p.product_type) || 0) + 1);
          });
        setProductMix(Array.from(mixMap.entries()).map(([product_type, count]) => ({ product_type, count })));

      } catch (err) {
        console.error('Agent production load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  // Filtered + sorted policies
  const displayed = useMemo(() => {
    let filtered = [...policies];

    if (statusFilter === 'at_risk') {
      filtered = filtered.filter(p => p.is_at_risk);
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.policy_number.toLowerCase().includes(q) ||
        p.product_type.toLowerCase().includes(q)
      );
    }

    const dir = sortAsc ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'effective':
          return dir * ((a.policy_effective_date || '').localeCompare(b.policy_effective_date || ''));
        case 'premium':
          return dir * (Number(a.annual_premium) - Number(b.annual_premium));
        case 'status':
          return dir * a.status.localeCompare(b.status);
        case 'drafts':
          return dir * (a.draft_count - b.draft_count);
        case 'paid':
          return dir * ((a.paid_to_date || '').localeCompare(b.paid_to_date || ''));
        default: return 0;
      }
    });

    return filtered;
  }, [policies, statusFilter, search, sortKey, sortAsc]);

  function toggleSort(key: PolicySort) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'effective' ? false : true); }
  }

  function SortArrow({ k }: { k: PolicySort }) {
    if (sortKey !== k) return null;
    return sortAsc
      ? <ChevronUp size={12} className="inline ml-0.5" />
      : <ChevronDown size={12} className="inline ml-0.5" />;
  }

  // CSV export
  function exportCSV() {
    const headers = ['Policy #', 'Product', 'Status', 'Monthly Premium', 'Annual Premium', 'Effective Date', 'Paid To Date', 'Drafts', 'At Risk', 'Flag', 'Days Since Paid'];
    const csvRows = [headers.join(',')];
    displayed.forEach(p => {
      csvRows.push([
        p.policy_number,
        p.product_type,
        p.status,
        p.monthly_premium,
        p.annual_premium,
        p.policy_effective_date || '',
        p.paid_to_date || '',
        p.draft_count,
        p.is_at_risk ? 'Yes' : 'No',
        p.flag_type || '',
        p.days_since_paid ?? '',
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${stats?.writing_number || agentId}-policies.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Guard: agency admins (non org-wide) cannot view another agency's agent production via URL manipulation.
  if (!isOrgWide && effectiveAgencyId && agencyId !== effectiveAgencyId) {
    return <Navigate to="/production" replace />;
  }

  if (loading) {
    return (
      <>
        <Header title="Agent Production" />
        <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-lg shimmer" />)}
        </div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <Header title="Agent Not Found" />
        <div className="p-6 text-center text-muted-foreground">
          <p>No production data found for this agent.</p>
          <Link to={agencyId ? `/production/${agencyId}` : '/production'} className="text-primary hover:underline mt-2 inline-block">
            ← Back
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title={stats.agent_name || 'Unknown Agent'} />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
        {/* Back nav + agent info */}
        <div className="flex items-center justify-between">
          <Link
            to={agencyId ? `/production/${agencyId}` : '/production'}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} /> Back to {stats.agency_name || 'Agency'}
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {stats.writing_number && (
              <span className="font-data text-xs bg-secondary px-2 py-1 rounded">
                WN: {stats.writing_number}
              </span>
            )}
            <span className="font-data text-xs bg-secondary px-2 py-1 rounded">
              {stats.agency_name || stats.agency_id}
            </span>
          </div>
        </div>

        {/* KPI Strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              title: 'Active Policies',
              end: stats.active_policies,
              fmt: fmtNum,
              sub: `${fmtNum(stats.total_policies)} total`,
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
              sub: stats.ap_this_month ? fmt$(Number(stats.ap_this_month)) + ' AP' : undefined,
              icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10',
            },
            {
              title: '90-Day Retention',
              end: stats.retention_pct !== null ? Number(stats.retention_pct) : 0,
              fmt: (n: number) => stats.retention_pct !== null ? `${n}%` : '—',
              sub: stats.ever_drafted > 0 ? `${stats.retained_policies}/${stats.ever_drafted} retained` : 'No drafts yet',
              icon: ShieldCheck,
              color: retentionColor(stats.retention_pct),
              bg: stats.retention_pct !== null && Number(stats.retention_pct) >= 90 ? 'bg-emerald-500/10' : stats.retention_pct !== null && Number(stats.retention_pct) >= 85 ? 'bg-amber-500/10' : 'bg-red-500/10',
            },
            {
              title: 'At Risk',
              end: stats.at_risk_policies,
              fmt: fmtNum,
              sub: `${stats.terminated_policies} terminated`,
              icon: AlertTriangle,
              color: stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground/70',
              bg: stats.at_risk_policies > 0 ? 'bg-red-500/10' : 'bg-secondary',
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border h-full">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt}
                        className={`text-xl font-bold mt-1 block font-data ${card.title === '90-Day Retention' ? card.color : 'text-foreground'}`}
                      />
                      {card.sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>}
                    </div>
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <card.icon size={18} className={card.color} />
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
              <CardTitle className="text-base text-foreground">Monthly Production</CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
              {trend.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No production history yet
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                      <XAxis dataKey="month" tickFormatter={fmtMonth} stroke="hsl(215 20% 55%)" fontSize={11} />
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
                        labelFormatter={fmtMonth}
                      />
                      <Bar yAxisId="ap" dataKey="ap" fill="hsl(199 89% 48%)" fillOpacity={0.3} stroke="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="policies" type="monotone" dataKey="policies" stroke="hsl(142 71% 45%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(142 71% 45%)' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Mix */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base text-foreground">Product Mix</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {productMix.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No active policies
                </div>
              ) : (
                <>
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
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Policy Table */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base text-foreground">
              Policies
              <Badge className="ml-2 bg-secondary text-muted-foreground border-border border">
                {displayed.length}{policies.length !== displayed.length ? ` / ${policies.length}` : ''}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter */}
              <div className="flex items-center gap-1">
                {([['all', 'All'], ['active', 'Active'], ['terminated', 'Term'], ['pending', 'Pend'], ['at_risk', 'At Risk']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      statusFilter === key
                        ? 'gradient-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative w-40">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-7 text-xs"
                />
              </div>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-secondary text-muted-foreground hover:bg-secondary/80 text-xs font-medium transition-colors"
                title="Export CSV"
              >
                <Download size={12} /> CSV
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {displayed.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                {policies.length === 0 ? 'No policies found for this agent.' : 'No policies match your filter.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="grid grid-cols-9 gap-2 px-4 py-2.5 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data border-b border-border/30">
                    <span className="col-span-2">Policy #</span>
                    <span>Product</span>
                    <span>Status</span>
                    <span
                      className="text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('premium')}
                    >Annual Premium <SortArrow k="premium" /></span>
                    <span
                      className="text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('effective')}
                    >Effective <SortArrow k="effective" /></span>
                    <span
                      className="text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('paid')}
                    >Paid To <SortArrow k="paid" /></span>
                    <span
                      className="text-center cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('drafts')}
                    >Drafts <SortArrow k="drafts" /></span>
                    <span className="text-center">Flag</span>
                  </div>
                  <div className="divide-y divide-border/20 max-h-[600px] overflow-y-auto">
                    {displayed.map(p => {
                      const sb = statusBadge(p.status, p.is_at_risk);
                      return (
                        <div
                          key={p.policy_number}
                          className="grid grid-cols-9 gap-2 px-4 py-2.5 text-sm items-center row-hover"
                        >
                          <span className="col-span-2 font-data text-xs text-foreground truncate">
                            {p.policy_number}
                          </span>
                          <span className="text-muted-foreground text-xs">{p.product_type}</span>
                          <span>
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${sb.cls}`}>
                              {sb.label}
                            </span>
                          </span>
                          <span className="text-right font-data text-foreground/80">
                            {fmt$(Number(p.annual_premium))}
                          </span>
                          <span className="text-right font-data text-xs text-muted-foreground">
                            {fmtDate(p.policy_effective_date)}
                          </span>
                          <span className={`text-right font-data text-xs ${
                            p.days_since_paid !== null && p.days_since_paid > 45
                              ? 'text-red-400'
                              : p.days_since_paid !== null && p.days_since_paid > 30
                              ? 'text-amber-400'
                              : 'text-muted-foreground'
                          }`}>
                            {fmtDate(p.paid_to_date)}
                            {p.days_since_paid !== null && p.days_since_paid > 30 && (
                              <span className="ml-1 text-[10px]">({p.days_since_paid}d)</span>
                            )}
                          </span>
                          <span className={`text-center font-data text-xs ${
                            p.draft_count >= 3 ? 'text-emerald-400' : p.draft_count > 0 ? 'text-foreground/70' : 'text-muted-foreground/40'
                          }`}>
                            {p.draft_count}
                          </span>
                          <span className="text-center">
                            {p.flag_type ? (
                              <span className="text-xs text-amber-400">{p.flag_type}</span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
