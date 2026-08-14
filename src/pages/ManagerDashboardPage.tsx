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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem, CountUp, RadialGauge } from '@/components/ui/animated';
import { QualityCard } from '@/components/dashboard/QualityCard';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import { supabase } from '@/lib/supabase';
import { portalSupabase } from '@/lib/portal-supabase';
import {
  fetchAgentProduction,
  fetchAtRiskPolicies,
  fetchCoachingFlags,
  type AgentProduction,
  type AtRiskPolicy,
} from '@/lib/prod-api';
import type { AgentCoachingFlag } from '@/components/coaching/AgentCoachingTable';
import type { PortalPipelineRecord } from '@/lib/contracting/types';
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
  MessageSquare,
  Target,
  CheckCircle,
  XCircle,
  UserPlus,
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
    effectiveAgencyId,
    effectiveAgencyWritingNumber,
  } = useEffectiveAuth();
  const orgData = useOrgData();

  // ── Fetch agent production + at-risk + coaching flags for this agency ──
  const agencyWn = effectiveAgencyWritingNumber;
  const fetchers = useMemo(() => ({
    agents: () => fetchAgentProduction(agencyWn ? { agency_id: agencyWn } : {}),
    atRisk: () => fetchAtRiskPolicies(agencyWn ? { agency_id: agencyWn } : {}),
    coaching: () => fetchCoachingFlags(agencyWn ? { agency_id: agencyWn } : {}),
  }), [agencyWn]);

  const { data, loading: fetchLoading } = useCachedMultiFetch(
    `mgr-dash-${agencyWn || 'org'}`,
    fetchers,
    { deps: [agencyWn] }
  );

  const agents: AgentProduction[] = data?.agents ?? [];
  const atRiskData = data?.atRisk;
  const atRiskPolicies: AtRiskPolicy[] = atRiskData?.data?.policies ?? [];
  const coachingAgents: AgentCoachingFlag[] = (data?.coaching as any)?.agents ?? [];
  const loading = fetchLoading && agents.length === 0;

  // ── Contracting pipeline for this agency ──
  const [pipelineRecords, setPipelineRecords] = useState<PortalPipelineRecord[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [agencyDisplayName, setAgencyDisplayName] = useState<string | null>(null);

  // Resolve agency UUID → display name for portal pipeline matching
  useEffect(() => {
    if (!effectiveAgencyId || !supabase) return;
    (supabase as any)
      .from('agencies')
      .select('name')
      .eq('id', effectiveAgencyId)
      .maybeSingle()
      .then(({ data }: { data: { name: string } | null }) => {
        setAgencyDisplayName(data?.name ?? null);
      });
  }, [effectiveAgencyId]);

  // Fetch pipeline records from Portal DB, filtered by agency name
  const fetchPipeline = useCallback(async () => {
    if (!portalSupabase) { setPipelineLoading(false); return; }
    setPipelineLoading(true);
    let query = portalSupabase
      .from('agent_pipeline')
      .select('*')
      .order('stage_entered_at', { ascending: false });
    if (agencyDisplayName) {
      query = query.eq('agency', agencyDisplayName);
    }
    const { data: rows } = await query;
    if (rows) {
      setPipelineRecords(rows as PortalPipelineRecord[]);
    }
    setPipelineLoading(false);
  }, [agencyDisplayName]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  // ── Daily Pulse: today's check-in responses ──
  const [pulseResponses, setPulseResponses] = useState<PulseResponse[]>([]);
  const [pulseLoading, setPulseLoading] = useState(true);

  const fetchPulse = useCallback(async () => {
    if (!supabase) { setPulseLoading(false); return; }
    setPulseLoading(true);
    const today = getTodayCT();
    const { data: rows } = await (supabase as any)
      .from('checkin_responses')
      .select('id, conversation_state, is_working, has_four_plus_hours, app_goal, nudge_sent, checkin_recipients!inner(first_name, last_name)')
      .eq('check_in_date', today)
      .order('conversation_state', { ascending: true });
    if (rows) {
      setPulseResponses(rows.map((r: any) => ({
        id: r.id,
        name: `${r.checkin_recipients.first_name} ${r.checkin_recipients.last_name}`,
        state: r.conversation_state,
        isWorking: r.is_working,
        hasFourPlusHrs: r.has_four_plus_hours,
        appGoal: r.app_goal,
        nudgeSent: r.nudge_sent,
      })));
    }
    setPulseLoading(false);
  }, []);

  useEffect(() => { fetchPulse(); }, [fetchPulse]);

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

        {/* ── Two-column: Coaching Flags + Daily Pulse ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Coaching Flags */}
          <CoachingFlagsCard agents={coachingAgents} loading={loading} />

          {/* Daily Pulse Summary */}
          <DailyPulseCard responses={pulseResponses} loading={pulseLoading} />

        </div>

        {/* ── Contracting Pipeline ── */}
        <ContractingPipelineCard records={pipelineRecords} loading={pipelineLoading} />

      </div>
    </div>
  );
}

// ── Types for Daily Pulse ──────────────────────────────────────────────────

interface PulseResponse {
  id: string;
  name: string;
  state: string;
  isWorking: boolean | null;
  hasFourPlusHrs: boolean | null;
  appGoal: number | null;
  nudgeSent: boolean;
}

function getTodayCT(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

// ── Coaching Flags Card ────────────────────────────────────────────────────

function CoachingFlagsCard({ agents, loading }: { agents: AgentCoachingFlag[]; loading: boolean }) {
  const flagged = useMemo(() => agents.filter(a => a.needs_coaching), [agents]);

  return (
    <HudFrame accentColor={flagged.length > 0 ? 'hsl(38 92% 50% / 0.3)' : 'hsl(142 71% 45% / 0.3)'}>
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${flagged.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                <Target size={18} className={flagged.length > 0 ? 'text-amber-400' : 'text-emerald-400'} />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Coaching Flags</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {flagged.length > 0
                    ? `${flagged.length} agent${flagged.length > 1 ? 's' : ''} below thresholds`
                    : 'All agents on target'}
                </p>
              </div>
            </div>
            <Link
              to="/quality/coaching"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Full view <ChevronRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 rounded shimmer" />)}
            </div>
          ) : flagged.length === 0 ? (
            <div className="py-4 text-center">
              <CheckCircle size={24} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No coaching flags — team is performing well</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {flagged.slice(0, 5).map((agent) => (
                <div key={agent.writing_number} className="flex items-center justify-between py-2.5 first:pt-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {agent.agent_name || 'Unknown'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {agent.flag_retention && (
                        <span className="text-xs text-red-400">↓ Retention {fmtPct(agent.retention_pct)}</span>
                      )}
                      {agent.flag_at_risk && (
                        <span className="text-xs text-amber-400">⚠ {agent.at_risk_count} at-risk</span>
                      )}
                      {agent.flag_terminated && (
                        <span className="text-xs text-purple-400">✕ High term rate</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-2 flex-shrink-0 text-xs border-amber-500/30 text-amber-400">
                    {agent.flag_count} flag{agent.flag_count > 1 ? 's' : ''}
                  </Badge>
                </div>
              ))}
              {flagged.length > 5 && (
                <div className="pt-2 text-center">
                  <Link to="/quality/coaching" className="text-xs text-primary hover:underline">
                    +{flagged.length - 5} more →
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </HudFrame>
  );
}

// ── Daily Pulse Summary Card ───────────────────────────────────────────────

function DailyPulseCard({ responses, loading }: { responses: PulseResponse[]; loading: boolean }) {
  const stats = useMemo(() => {
    const total = responses.length;
    const responded = responses.filter(r => r.state === 'complete' || r.state === 'declined').length;
    const working = responses.filter(r => r.isWorking === true).length;
    const noResponse = responses.filter(r => !['complete', 'declined'].includes(r.state)).length;
    const totalApps = responses.reduce((sum, r) => sum + (r.appGoal || 0), 0);
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
    return { total, responded, working, noResponse, totalApps, responseRate };
  }, [responses]);

  // Show agents who haven't responded
  const silent = useMemo(() =>
    responses.filter(r => !['complete', 'declined'].includes(r.state)).slice(0, 5),
    [responses]
  );

  return (
    <HudFrame accentColor="hsl(200 80% 50% / 0.3)">
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-sky-500/10">
                <MessageSquare size={18} className="text-sky-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Daily Pulse</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Today's check-in</p>
              </div>
            </div>
            <Link
              to="/daily-pulse"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Full view <ChevronRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <div className="h-16 rounded shimmer" />
              <div className="h-10 rounded shimmer" />
            </div>
          ) : stats.total === 0 ? (
            <div className="py-4 text-center">
              <MessageSquare size={24} className="text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No check-ins sent today</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className={`text-2xl font-bold font-data ${
                    stats.responseRate >= 80 ? 'text-emerald-400' : stats.responseRate >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>{stats.responseRate}%</p>
                  <p className="text-xs text-muted-foreground">Response Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold font-data text-sky-400">{stats.working}</p>
                  <p className="text-xs text-muted-foreground">Working</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold font-data text-emerald-400">{stats.totalApps}</p>
                  <p className="text-xs text-muted-foreground">Apps Committed</p>
                </div>
              </div>

              {/* Silent agents */}
              {silent.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                    <XCircle size={12} /> {stats.noResponse} agent{stats.noResponse > 1 ? 's' : ''} haven't responded
                  </p>
                  <div className="space-y-1">
                    {silent.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-red-500/5">
                        <span className="text-foreground">{r.name}</span>
                        <span className="text-red-400">{r.nudgeSent ? 'Nudged' : 'No response'}</span>
                      </div>
                    ))}
                    {stats.noResponse > 5 && (
                      <Link to="/daily-pulse" className="text-xs text-primary hover:underline block text-center pt-1">
                        +{stats.noResponse - 5} more →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </HudFrame>
  );
}

// ── Contracting Pipeline Card ───────────────────────────────────────────────

const PIPELINE_STAGE_META: Record<string, { label: string; color: string }> = {
  hip_broker: { label: 'HIP Broker', color: 'bg-cyan-500/20 text-cyan-400' },
  hip_career: { label: 'HIP Career', color: 'bg-indigo-500/20 text-indigo-400' },
  iaa: { label: 'IAA', color: 'bg-violet-500/20 text-violet-400' },
  signed_iaa: { label: 'Signed IAA', color: 'bg-purple-500/20 text-purple-400' },
  bill_com: { label: 'Bill.com', color: 'bg-fuchsia-500/20 text-fuchsia-400' },
  in_contracting: { label: 'In Contracting', color: 'bg-teal-500/20 text-teal-400' },
  rts: { label: 'RTS', color: 'bg-emerald-500/20 text-emerald-400' },
  crm: { label: 'CRM Onboarding', color: 'bg-cyan-500/20 text-cyan-400' },
  hip_broker_ready: { label: 'HIP Broker READY', color: 'bg-emerald-500/20 text-emerald-400' },
  hip_career_ready: { label: 'HIP Career READY', color: 'bg-lime-500/20 text-lime-400' },
  actively_selling: { label: 'Actively Selling', color: 'bg-amber-500/20 text-amber-400' },
  terminated: { label: 'Terminated', color: 'bg-red-500/20 text-red-400' },
};

function ContractingPipelineCard({ records, loading }: { records: PortalPipelineRecord[]; loading: boolean }) {
  // Group by stage, exclude terminal stages from the summary
  const stageCounts = useMemo(() => {
    const counts: Record<string, { count: number; agents: string[] }> = {};
    for (const r of records) {
      if (r.stage === 'terminated' || r.stage === 'actively_selling') continue;
      if (!counts[r.stage]) counts[r.stage] = { count: 0, agents: [] };
      counts[r.stage].count++;
      if (counts[r.stage].agents.length < 3) {
        counts[r.stage].agents.push(r.agent_name || 'Unknown');
      }
    }
    return Object.entries(counts)
      .map(([stage, { count, agents }]) => ({ stage, count, agents }))
      .sort((a, b) => b.count - a.count);
  }, [records]);

  const activeCount = records.filter(r => r.stage !== 'terminated' && r.stage !== 'actively_selling').length;
  const rtsCount = records.filter(r => r.stage === 'rts').length;

  return (
    <HudFrame accentColor="hsl(260 60% 50% / 0.3)">
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <UserPlus size={18} className="text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Contracting Pipeline</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeCount > 0
                    ? `${activeCount} in pipeline · ${rtsCount} ready to sell`
                    : 'No agents in pipeline'}
                </p>
              </div>
            </div>
            <Link
              to="/contracting"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Full pipeline <ChevronRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 rounded shimmer" />)}
            </div>
          ) : stageCounts.length === 0 ? (
            <div className="py-4 text-center">
              <UserPlus size={24} className="text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No agents currently in contracting</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stageCounts.map(({ stage, count, agents }) => {
                const meta = PIPELINE_STAGE_META[stage] || { label: stage, color: 'bg-zinc-500/20 text-zinc-400' };
                return (
                  <div key={stage} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Badge variant="outline" className={`text-xs ${meta.color} border-0 px-2 py-0.5`}>
                        {meta.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {agents.join(', ')}{count > 3 ? ` +${count - 3} more` : ''}
                      </span>
                    </div>
                    <span className="text-sm font-bold font-data text-foreground ml-2">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </HudFrame>
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
