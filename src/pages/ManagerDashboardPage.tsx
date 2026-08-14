/**
 * ManagerDashboardPage — Team-focused command center for managers.
 *
 * Answers: "What do I need to act on today?"
 *
 * Sections:
 *   1. Team Health KPIs — policy count, retention, at-risk, active agents
 *   2. Agent Spotlight — top producers + agents needing attention
 *   3. At-Risk Summary — count + urgency breakdown with link to workboard
 *   4. Daily Pulse Preview — today's check-in response rate (if available)
 *
 * All data auto-scoped to the manager's agency via effectiveAgencyId.
 * Focus: policy count and quality of business, not financials.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem, CountUp, RadialGauge } from '@/components/ui/animated';
import { QualityCard } from '@/components/dashboard/QualityCard';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import {
  fetchAgentProduction,
  fetchAtRiskPolicies,
  type AgentProduction,
  type AtRiskPolicy,
} from '@/lib/prod-api';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';
import { fmtPct, retentionColor } from '@/lib/formatUtils';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  FileText,
  Activity,
  Award,
  Clock,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentSpotlight {
  agent_name: string | null;
  writing_number: string | null;
  policies_this_month: number;
  active_policies: number;
  at_risk_policies: number;
  retention_pct: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function urgencyLabel(flagType: string | null): string {
  switch (flagType) {
    case 'final_7d': return 'Final 7 Days';
    case 'future_term': return 'Future Term';
    case 'pended': return 'Pended';
    case 'suspended': return 'Suspended';
    default: return 'At Risk';
  }
}

function urgencyColor(flagType: string | null): string {
  switch (flagType) {
    case 'final_7d': return 'text-red-400 bg-red-500/10';
    case 'future_term': return 'text-amber-400 bg-amber-500/10';
    case 'pended': return 'text-purple-400 bg-purple-500/10';
    case 'suspended': return 'text-orange-400 bg-orange-500/10';
    default: return 'text-yellow-400 bg-yellow-500/10';
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function ManagerDashboardPage() {
  const {
    effectiveAgencyWritingNumber,
  } = useEffectiveAuth();
  const orgData = useOrgData();

  // ── Fetch agent production + at-risk for this agency ──
  const agencyWn = effectiveAgencyWritingNumber;
  const fetchers = useMemo(() => ({
    agents: () => fetchAgentProduction(agencyWn ? { agency_id: agencyWn } : {}),
    atRisk: () => fetchAtRiskPolicies(agencyWn ? { agency_id: agencyWn } : {}),
  }), [agencyWn]);

  const { data, loading: fetchLoading } = useCachedMultiFetch(
    `mgr-dash-${agencyWn || 'org'}`,
    fetchers,
    { deps: [agencyWn] }
  );

  const agents: AgentProduction[] = data?.agents ?? [];
  const atRiskData = data?.atRisk;
  const atRiskPolicies: AtRiskPolicy[] = atRiskData?.data?.policies ?? [];
  const loading = fetchLoading && agents.length === 0;

  // ── Derive agency-level retention from org cache ──
  const agencyRetention = useMemo(() => {
    if (!effectiveAgencyWritingNumber) return null;
    return orgData.retentionAgencies.find(
      (a) => a.agency_id === effectiveAgencyWritingNumber
    ) ?? null;
  }, [orgData.retentionAgencies, effectiveAgencyWritingNumber]);

  // ── KPI stats ──
  const kpis = useMemo(() => {
    const activeAgents = agents.filter(a => a.active_policies > 0 || a.policies_this_month > 0).length;
    const totalAgents = agents.length;
    const totalPoliciesMTD = agents.reduce((sum, a) => sum + a.policies_this_month, 0);
    const totalActivePolicies = agents.reduce((sum, a) => sum + a.active_policies, 0);
    const totalAtRisk = agents.reduce((sum, a) => sum + a.at_risk_policies, 0);
    const retPct = agencyRetention?.retention_pct ?? null;

    return {
      activeAgents,
      totalAgents,
      totalPoliciesMTD,
      totalActivePolicies,
      totalAtRisk,
      retentionPct: retPct,
    };
  }, [agents, agencyRetention]);

  // ── Top producers (by policies this month) ──
  const topProducers = useMemo((): AgentSpotlight[] => {
    return [...agents]
      .filter(a => a.policies_this_month > 0)
      .sort((a, b) => b.policies_this_month - a.policies_this_month)
      .slice(0, 5)
      .map(a => ({
        agent_name: a.agent_name,
        writing_number: a.writing_number,
        policies_this_month: a.policies_this_month,
        active_policies: a.active_policies,
        at_risk_policies: a.at_risk_policies,
        retention_pct: a.retention_pct,
      }));
  }, [agents]);

  // ── Agents needing attention (high at-risk or low retention) ──
  const needsAttention = useMemo((): AgentSpotlight[] => {
    return [...agents]
      .filter(a => a.active_policies >= 3) // only agents with enough policies to evaluate
      .filter(a =>
        (a.retention_pct !== null && a.retention_pct < 85) ||
        a.at_risk_policies >= 3
      )
      .sort((a, b) => {
        // Prioritize lowest retention, then highest at-risk count
        const retA = a.retention_pct ?? 100;
        const retB = b.retention_pct ?? 100;
        if (retA !== retB) return retA - retB;
        return b.at_risk_policies - a.at_risk_policies;
      })
      .slice(0, 5)
      .map(a => ({
        agent_name: a.agent_name,
        writing_number: a.writing_number,
        policies_this_month: a.policies_this_month,
        active_policies: a.active_policies,
        at_risk_policies: a.at_risk_policies,
        retention_pct: a.retention_pct,
      }));
  }, [agents]);

  // ── At-risk urgency breakdown ──
  const urgencyBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of atRiskPolicies) {
      const key = p.flag_type || 'at_risk';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [atRiskPolicies]);

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* ── Last updated ── */}
        {orgData.lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2">
            <Clock size={12} />
            Updated {formatLastUpdated(orgData.lastUpdated)}
          </div>
        )}

        {/* ── Team Health KPIs ── */}
        <StaggerContainer
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
          role="region"
          aria-label="Team health indicators"
        >
          {/* Active Agents */}
          <StaggerItem>
            <HudFrame>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Active Agents</p>
                        <CountUp
                          end={kpis.activeAgents}
                          className="text-3xl font-bold text-foreground mt-1 block"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          of {kpis.totalAgents} total
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-cyan-500/10">
                        <Users size={20} className="text-primary" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* Policies Written MTD */}
          <StaggerItem>
            <HudFrame accentColor="hsl(142 71% 45% / 0.4)">
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Policies MTD</p>
                        <CountUp
                          end={kpis.totalPoliciesMTD}
                          className="text-3xl font-bold text-foreground mt-1 block"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">written this month</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-emerald-500/10">
                        <FileText size={20} className="text-emerald-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* 90-Day Retention */}
          <StaggerItem>
            <HudFrame accentColor={
              kpis.retentionPct !== null && kpis.retentionPct >= 90
                ? 'hsl(142 71% 45% / 0.5)'
                : 'hsl(38 92% 50% / 0.5)'
            }>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <RadialGauge
                        value={kpis.retentionPct ?? 0}
                        label="90-day"
                        size={80}
                        strokeWidth={7}
                      />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">90-Day Retention</p>
                        <p className={`text-sm mt-1 ${
                          kpis.retentionPct !== null && kpis.retentionPct >= 90
                            ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {kpis.retentionPct !== null && kpis.retentionPct >= 90
                            ? '✓ On target'
                            : '⚠ Below 90%'}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* Active Book */}
          <StaggerItem>
            <HudFrame>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Active Book</p>
                        <CountUp
                          end={kpis.totalActivePolicies}
                          className="text-3xl font-bold text-foreground mt-1 block"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">active policies</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-blue-500/10">
                        <ShieldCheck size={20} className="text-blue-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* At-Risk */}
          <StaggerItem>
            <HudFrame accentColor="hsl(0 84% 60% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">At-Risk</p>
                        <CountUp
                          end={kpis.totalAtRisk}
                          className="text-3xl font-bold text-red-400 mt-1 block"
                        />
                        <Link
                          to="/workboard"
                          className="text-xs text-primary hover:underline mt-0.5 inline-flex items-center gap-0.5"
                        >
                          Open workboard <ChevronRight size={10} />
                        </Link>
                      </div>
                      <div className="p-2.5 rounded-lg bg-red-500/10">
                        <AlertTriangle size={20} className="text-red-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Quality Card (locked — always shown) ── */}
        <QualityCard
          filterAgencyId={effectiveAgencyWritingNumber}
          loading={loading}
        />

        {/* ── Two-column: Top Producers + Needs Attention ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top Producers */}
          <HudFrame accentColor="hsl(142 71% 45% / 0.3)">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <TrendingUp size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">Top Producers</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Policies written this month</p>
                    </div>
                  </div>
                  <Link
                    to="/my-team"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View team <ChevronRight size={12} />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 rounded shimmer" />)}
                  </div>
                ) : topProducers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No production this month yet
                  </p>
                ) : (
                  <div className="divide-y divide-border/30">
                    {topProducers.map((agent, i) => (
                      <div key={agent.writing_number || i} className="flex items-center justify-between py-2.5 first:pt-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {agent.agent_name || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {agent.active_policies} active · {fmtPct(agent.retention_pct)} retention
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="ml-2 flex-shrink-0 font-data">
                          {agent.policies_this_month} apps
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </HudFrame>

          {/* Agents Needing Attention */}
          <HudFrame accentColor="hsl(0 84% 60% / 0.3)">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <AlertTriangle size={18} className="text-red-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">Needs Coaching</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Low retention or high at-risk</p>
                    </div>
                  </div>
                  <Link
                    to="/workboard"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Workboard <ChevronRight size={12} />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 rounded shimmer" />)}
                  </div>
                ) : needsAttention.length === 0 ? (
                  <div className="py-4 text-center">
                    <Award size={24} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      All agents on track — no coaching flags
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {needsAttention.map((agent, i) => (
                      <div key={agent.writing_number || i} className="flex items-center justify-between py-2.5 first:pt-1">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {agent.agent_name || 'Unknown'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs font-data ${retentionColor(agent.retention_pct)}`}>
                              {fmtPct(agent.retention_pct)} retention
                            </span>
                            {agent.at_risk_policies > 0 && (
                              <span className="text-xs text-red-400">
                                {agent.at_risk_policies} at-risk
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`ml-2 flex-shrink-0 text-xs ${
                            agent.retention_pct !== null && agent.retention_pct < 85
                              ? 'border-red-500/30 text-red-400'
                              : 'border-amber-500/30 text-amber-400'
                          }`}
                        >
                          {agent.active_policies} policies
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </HudFrame>
        </div>

        {/* ── At-Risk Urgency Breakdown ── */}
        {urgencyBreakdown.length > 0 && (
          <HudFrame accentColor="hsl(38 92% 50% / 0.3)">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Activity size={18} className="text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">At-Risk Breakdown</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {atRiskPolicies.length} policies by urgency
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/workboard"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Open workboard <ChevronRight size={12} />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {urgencyBreakdown.map(({ type, count }) => (
                    <div
                      key={type}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg ${urgencyColor(type)}`}
                    >
                      <span className="text-lg font-bold font-data">{count}</span>
                      <span className="text-xs font-medium">{urgencyLabel(type)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </HudFrame>
        )}

      </div>
    </div>
  );
}

// ── Shared helper (same as DashboardPage) ──────────────────────────────────

function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}
