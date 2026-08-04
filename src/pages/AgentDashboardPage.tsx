/**
 * Agent Dashboard — Personal production view for agents
 *
 * Shows the logged-in agent's own production data:
 * - MTD AP hero card with goal progress
 * - KPI tiles (app count, active policies, at-risk, retention)
 * - Needs Attention summary (top 3, link to full list)
 * - Quality card (reuses existing QualityCard)
 * - Monthly production trend chart
 *
 * Data: prod-data edge fn with agent_id = effectiveWritingNumber
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  fetchAgentProduction,
  fetchMonthlyProduction,
  fetchAtRiskPolicies,
  type AgentProduction,
  type AtRiskPolicy,
} from '@/lib/prod-api';
import { QualityCard } from '@/components/dashboard/QualityCard';
import { getGoal, type AgentGoal } from '@/lib/goals-api';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Activity,
  ChevronRight,
  Zap,
  PauseCircle,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n)}%`;
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
}

function urgencyLabel(flag: string | null, daysIdle: number | null): { label: string; severity: 'danger' | 'warning' } {
  const days = daysIdle ?? 0;
  if (days >= 38) return { label: `Final 7 days · Day ${days}/45`, severity: 'danger' };
  if (days >= 30) return { label: `Critical · Day ${days}/45`, severity: 'danger' };
  const ft = (flag || '').toLowerCase();
  if (ft === 'future_term' || ft === 'future term') return { label: `Future Term · Day ${days}/45`, severity: 'danger' };
  if (ft === 'pended') return { label: `Pended · ${days} days`, severity: 'warning' };
  if (ft === 'suspended') return { label: `Suspended · ${days} days`, severity: 'warning' };
  return { label: `At Risk · ${days} days`, severity: 'warning' };
}

// ── Component ──────────────────────────────────────────────────────────

export function AgentDashboardPage() {
  const { user, effectiveWritingNumber, profile, effectiveAgencyWritingNumber } = useEffectiveAuth();
  const [currentGoal, setCurrentGoal] = useState<AgentGoal | null>(null);

  const agentName = profile?.full_name || 'Agent';
  const firstName = agentName.split(' ')[0];

  // Cached multi-fetch: instant render from localStorage, background refresh
  const cacheKey = `agent-dashboard-${effectiveWritingNumber || 'none'}`;
  const { data: cached, loading, error: fetchError, refresh: loadData } = useCachedMultiFetch(
    cacheKey,
    {
      agentData: () => fetchAgentProduction({ agent_id: effectiveWritingNumber! }),
      monthly: () => fetchMonthlyProduction({ agent_id: effectiveWritingNumber! }),
      atRisk: () => fetchAtRiskPolicies(
        effectiveAgencyWritingNumber
          ? { agency_id: effectiveAgencyWritingNumber }
          : undefined
      ),
    },
    { skip: !effectiveWritingNumber, deps: [effectiveWritingNumber, effectiveAgencyWritingNumber] }
  );

  // Load goal separately (from local Supabase, not Max's DB)
  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    getGoal(user.id, now.getMonth() + 1, now.getFullYear()).then(setCurrentGoal).catch(() => {});
  }, [user?.id]);

  // Derive stats from cached data
  const stats = useMemo((): AgentProduction | null => {
    if (!cached?.agentData) return null;
    return cached.agentData.find(a => a.writing_number === effectiveWritingNumber || a.agent_id === effectiveWritingNumber) || null;
  }, [cached?.agentData, effectiveWritingNumber]);

  const monthlyData = cached?.monthly || [];
  const atRiskPolicies = useMemo((): AtRiskPolicy[] => {
    if (!cached?.atRisk?.data?.policies) return [];
    return cached.atRisk.data.policies.filter(
      (p: AtRiskPolicy) => p.agent_writing_number === effectiveWritingNumber
    );
  }, [cached?.atRisk, effectiveWritingNumber]);

  const error = fetchError ? 'Failed to load your production data. Please try again.' : null;

  // Sort at-risk by urgency (highest days_idle first)
  const sortedAtRisk = useMemo(() =>
    [...atRiskPolicies].sort((a, b) => (b.days_idle ?? 0) - (a.days_idle ?? 0)),
    [atRiskPolicies]
  );

  // Monthly chart data — last 6 months
  const chartData = useMemo(() => {
    if (!monthlyData.length) return [];
    const sorted = [...monthlyData].sort((a, b) => a.month.localeCompare(b.month));
    return sorted.slice(-6).map(m => ({
      month: fmtMonth(m.month),
      ap: m.annual_premium,
      policies: m.policies,
    }));
  }, [monthlyData]);

  // ── Loading state ──
  if (loading) {
    return (
      <>
        <Header title="My Dashboard" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Activity className="w-8 h-8 text-primary/40 animate-pulse mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading your production data…</p>
          </div>
        </div>
      </>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <>
        <Header title="My Dashboard" />
        <div className="p-6">
          <Card className="border-red-500/30">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={loadData}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // ── No data state ──
  if (!stats) {
    return (
      <>
        <Header title="My Dashboard" />
        <div className="p-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No production data found for your writing number.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Writing number: {effectiveWritingNumber || 'not set'}
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const retPct = stats.retention_pct;
  const retColor = retPct == null ? 'text-muted-foreground' :
    retPct >= 90 ? 'text-emerald-400' :
    retPct >= 80 ? 'text-cyan-400' :
    retPct >= 70 ? 'text-amber-400' : 'text-red-400';

  return (
    <>
      <Header title="My Dashboard" />
      <div className="p-6 space-y-5">
        <StaggerContainer>

          {/* ── Welcome + MTD Hero ── */}
          <StaggerItem>
            <div className="mb-1">
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                Welcome back, {firstName}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {effectiveWritingNumber} · Personal production overview
              </p>
            </div>
          </StaggerItem>

          {/* ── MTD AP Hero Card ── */}
          <StaggerItem>
            <Card className="bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.8)] border-primary/30 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
              <CardContent className="pt-5 pb-5 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    My MTD Production
                  </span>
                  {stats.policies_this_month > 0 && (
                    <Badge variant="outline" className="border-emerald-400/40 text-emerald-300 text-[10px] bg-emerald-500/10">
                      <TrendingUp className="w-2.5 h-2.5 mr-1" />
                      {stats.policies_this_month} apps this month
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
                    {fmtCurrency(stats.ap_this_month)}
                  </span>
                  {currentGoal && (
                    <span className="text-sm text-white/60">
                      of {fmtCurrency(currentGoal.target_ap)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 mt-1">
                  {stats.policies_this_month} policies written · Avg {fmtCurrency(stats.policies_this_month > 0 ? stats.ap_this_month / stats.policies_this_month : 0)}/app
                </p>
                {currentGoal && (() => {
                  const pct = Math.min(100, (stats.ap_this_month / currentGoal.target_ap) * 100);
                  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                        <span><strong className="text-white font-bold">{Math.round(pct)}%</strong> of goal</span>
                        <Link to="/my-goal" className="text-white/60 hover:text-white/90 flex items-center gap-0.5 text-[10px]">
                          View goal <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/15 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 80 ? 'linear-gradient(90deg, #86EFAC, #4ADE80)'
                              : pct >= 50 ? 'linear-gradient(90deg, #FDE68A, #F59E0B)'
                              : 'linear-gradient(90deg, #FCA5A5, #EF4444)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </StaggerItem>

          {/* ── KPI Tiles ── */}
          <StaggerItem>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Active Policies */}
              <Card className="group hover:border-primary/30 transition-colors">
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Policies
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-foreground mt-1">
                    <CountUp end={stats.active_policies} />
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {fmtCurrency(stats.active_annual_premium)} annual premium
                  </p>
                </CardContent>
              </Card>

              {/* Total Written */}
              <Card className="group hover:border-primary/30 transition-colors">
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Written
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-foreground mt-1">
                    <CountUp end={stats.total_policies} />
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {stats.pending_policies} pending · {stats.terminated_policies} terminated
                  </p>
                </CardContent>
              </Card>

              {/* At-Risk */}
              <Link to="/at-risk" className="block">
                <Card className={`group hover:border-primary/30 transition-colors h-full ${stats.at_risk_policies > 0 ? 'border-red-500/20' : ''}`}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Needs Attention
                    </p>
                    <p className={`text-2xl font-bold tabular-nums mt-1 ${stats.at_risk_policies > 0 ? 'text-red-400' : 'text-foreground'}`}>
                      <CountUp end={stats.at_risk_policies} />
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                      {stats.at_risk_policies > 0 ? (
                        <><AlertTriangle className="w-2.5 h-2.5 text-red-400" /> Policies needing action</>
                      ) : (
                        '✓ No policies flagged'
                      )}
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Retention */}
              <Card className="group hover:border-primary/30 transition-colors">
                <CardContent className="pt-4 pb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Retention
                  </p>
                  <p className={`text-2xl font-bold tabular-nums mt-1 ${retColor}`}>
                    {fmtPct(retPct)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {stats.retained_policies} of {stats.ever_drafted} retained
                  </p>
                </CardContent>
              </Card>
            </div>
          </StaggerItem>

          {/* ── Needs Attention Summary + Quality ── */}
          <StaggerItem>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Needs Attention — top 3 */}
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">Needs Attention</CardTitle>
                        {sortedAtRisk.length > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {sortedAtRisk.length}
                          </Badge>
                        )}
                      </div>
                      {sortedAtRisk.length > 0 && (
                        <Link to="/at-risk" className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5">
                          View all <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {sortedAtRisk.length === 0 ? (
                      <div className="text-center py-6">
                        <ShieldCheck className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No policies need attention right now.</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">Keep up the great work! 🎯</p>
                      </div>
                    ) : (
                      sortedAtRisk.slice(0, 3).map(policy => {
                        const urg = urgencyLabel(policy.flag_type, policy.days_idle);
                        return (
                          <div
                            key={policy.policy_number}
                            className={`rounded-lg border p-3 flex items-center gap-3 ${
                              urg.severity === 'danger'
                                ? 'border-l-2 border-l-red-500 border-red-500/20'
                                : 'border-l-2 border-l-amber-500 border-amber-500/20'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {urg.severity === 'danger' ? (
                                <Zap className="w-4 h-4 text-red-400" />
                              ) : (
                                <PauseCircle className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {policy.client_name || policy.policy_number}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {policy.product_type} · {policy.status} · {urg.label}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold tabular-nums text-foreground">
                                {fmtCurrency(policy.plan_premium || 0)}
                              </p>
                              <p className="text-[10px] text-muted-foreground/60">annual</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quality Card */}
              <div className="lg:col-span-2">
                <QualityCard filterAgencyId={effectiveAgencyWritingNumber} loading={false} />
              </div>
            </div>
          </StaggerItem>

          {/* ── Monthly AP Trend ── */}
          {chartData.length > 1 && (
            <StaggerItem>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Monthly AP Trend</CardTitle>
                  <p className="text-[10px] text-muted-foreground">Last {chartData.length} months</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barSize={32}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => fmtCurrency(v)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          formatter={(value: number) => [fmtCurrency(value), 'AP']}
                        />
                        <Bar
                          dataKey="ap"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Policy count sub-labels */}
                  <div className="flex justify-between px-2 mt-1">
                    {chartData.map((d, i) => (
                      <span key={i} className="text-[9px] text-muted-foreground/50 tabular-nums">
                        {d.policies} apps
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          )}

        </StaggerContainer>
      </div>
    </>
  );
}
