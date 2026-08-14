/**
 * ManagerTeamPage — Consolidated agent table for managers (P5)
 *
 * Shows all agents in the manager's agency with:
 * - Agent name, writing number, tenure indicator
 * - MTD AP + vs Goal %
 * - App count
 * - Save rate (retention %)
 * - At-risk / attention count
 * - Sortable columns, search, filter by pace status
 * - Click-through to agent detail
 *
 * Data: prod-data edge fn (type=agent, agency_id filter) + agent_goals table
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  fetchAgentProduction,
  fetchAtRiskPolicies,
  type AgentProduction,
  type AtRiskPolicy,
} from '@/lib/prod-api';
import { portalSupabase } from '@/lib/portal-supabase';
import { supabase } from '@/lib/supabase';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';
import {
  Search,
  AlertTriangle,
  Activity,
  UserPlus,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Download,
  Sparkles,
} from 'lucide-react';
import { fmt$ as fmtCurrency, fmtPct, retentionColor } from '@/lib/formatUtils';

// ── Types ──────────────────────────────────────────────────────────────

interface GoalRecord {
  user_id: string;
  writing_number: string;
  agency_id: string | null;
  target_ap: number;
  month: number;
  year: number;
}

/** Contracting pipeline record from Portal DB */
interface PipelineAgent {
  id: string;
  agent_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  stage_entered_at: string | null;
  writing_numbers: Record<string, string> | null;
}

interface AgentRow extends AgentProduction {
  goal_target_ap: number | null;
  goal_pct: number | null;
  at_risk_count: number;
  /** Contracting pipeline stage (if agent is also in the pipeline) */
  pipeline_stage: string | null;
  /** True if agent exists only in contracting, not yet in production */
  pipeline_only: boolean;
}

type SortKey = 'name' | 'ap' | 'goal' | 'apps' | 'retention' | 'attention';
type SortDir = 'asc' | 'desc';
type PaceFilter = 'all' | 'on_track' | 'catch_up' | 'behind' | 'in_pipeline';

/** Human-readable labels for contracting pipeline stages */
const STAGE_LABELS: Record<string, string> = {
  hip_broker: 'HIP Broker',
  hip_career: 'HIP Career',
  iaa: 'IAA',
  signed_iaa: 'Signed IAA',
  bill_com: 'Bill.com',
  in_contracting: 'Contracting',
  rts: 'Ready to Sell',
  crm: 'CRM Setup',
  hip_broker_ready: 'HIP Broker Ready',
  hip_career_ready: 'HIP Career Ready',
  actively_selling: 'Active',
};

// ── CSV Export ─────────────────────────────────────────────────────────

function exportTeamCsv(rows: AgentRow[]) {
  const headers = [
    'Agent', 'Writing #', 'MTD AP', 'Goal', 'Goal %', 'Apps', 'Retention %', 'Attention',
  ];
  const csvRows = rows.map(r => [
    `"${(r.agent_name || 'Unknown').replace(/"/g, '""')}"`,
    r.writing_number || r.agent_id,
    r.ap_this_month,
    r.goal_target_ap ?? '',
    r.goal_pct != null ? Math.round(r.goal_pct) : '',
    r.policies_this_month,
    r.retention_pct != null ? r.retention_pct.toFixed(1) : '',
    r.at_risk_count,
  ]);
  const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Expected goal % for the current day of the month — memoized per render cycle. */
let _cachedExpectedPct: { key: string; value: number } | null = null;
function getExpectedPct(): number {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (_cachedExpectedPct?.key === key) return _cachedExpectedPct.value;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const value = (now.getDate() / daysInMonth) * 100;
  _cachedExpectedPct = { key, value };
  return value;
}

function getPaceStatus(goalPct: number | null): 'on_track' | 'catch_up' | 'behind' | 'no_goal' {
  if (goalPct == null) return 'no_goal';
  const ratio = goalPct / getExpectedPct();
  if (ratio >= 0.9) return 'on_track';
  if (ratio >= 0.6) return 'catch_up';
  return 'behind';
}

/** Agents whose earliest policy is within the last 30 days. */
const NEW_AGENT_DAYS = 30;
function isNewAgent(agent: AgentProduction): boolean {
  if (!agent.earliest_issue_date) return false;
  const earliest = new Date(agent.earliest_issue_date + 'T00:00:00');
  const diffMs = Date.now() - earliest.getTime();
  return diffMs >= 0 && diffMs <= NEW_AGENT_DAYS * 86_400_000;
}

/** Agents with zero MTD production are visually dimmed. */
function isInactive(agent: AgentRow): boolean {
  return agent.ap_this_month === 0 && agent.policies_this_month === 0;
}

const paceColors = {
  on_track: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  catch_up: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  behind: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  no_goal: { text: 'text-muted-foreground', bg: 'bg-secondary/10', border: 'border-border' },
};



// retColor removed — now using shared retentionColor from formatUtils

// ── Component ──────────────────────────────────────────────────────────

export function ManagerTeamPage() {
  const navigate = useNavigate();
  const { effectiveAgencyId, effectiveAgencyWritingNumber } = useEffectiveAuth();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [paceFilter, setPaceFilter] = useState<PaceFilter>('all');
  const [goals, setGoals] = useState<GoalRecord[]>([]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Cached fetch for Max's DB data — instant render from localStorage
  const agencyParam = effectiveAgencyWritingNumber
    ? { agency_id: effectiveAgencyWritingNumber }
    : undefined;
  const cacheKey = `manager-team-${effectiveAgencyWritingNumber || 'org'}`;
  const { data: cached, loading: cacheLoading, error: fetchError, refresh: loadData } = useCachedMultiFetch(
    cacheKey,
    {
      agentData: () => fetchAgentProduction(agencyParam),
      atRiskResp: () => fetchAtRiskPolicies(agencyParam),
    },
    { deps: [effectiveAgencyWritingNumber] }
  );

  // Goals from local Supabase (not Max's DB) — scoped to agency when available
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      let query = (supabase as any)
        .from('agent_goals')
        .select('user_id, writing_number, agency_id, target_ap, month, year')
        .eq('month', currentMonth)
        .eq('year', currentYear);
      if (effectiveAgencyWritingNumber) {
        query = query.eq('agency_id', effectiveAgencyWritingNumber);
      }
      const { data } = await query;
      setGoals((data || []) as GoalRecord[]);
    })();
  }, [currentMonth, currentYear, effectiveAgencyWritingNumber]);

  // ── Contracting pipeline agents from Portal DB ──
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(true);

  // Resolve agency UUID → display name for portal filtering
  const [agencyDisplayName, setAgencyDisplayName] = useState<string | null>(null);
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

  const fetchPipeline = useCallback(async () => {
    if (!portalSupabase) { setPipelineLoading(false); return; }
    setPipelineLoading(true);
    // FYM direct agents have agency = null in the portal pipeline.
    // Other agencies match by name string.
    let query = portalSupabase
      .from('agent_pipeline')
      .select('id, agent_name, first_name, last_name, email, phone, stage, stage_entered_at, writing_numbers')
      .order('stage_entered_at', { ascending: false });
    if (agencyDisplayName === 'FYM') {
      query = query.is('agency', null);
    } else if (agencyDisplayName) {
      query = query.eq('agency', agencyDisplayName);
    }
    const { data: rows } = await query;
    setPipelineAgents((rows || []) as PipelineAgent[]);
    setPipelineLoading(false);
  }, [agencyDisplayName]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const loading = cacheLoading || pipelineLoading;
  const error = fetchError ? 'Failed to load team data. Please try again.' : null;

  // Derive agents from cached production data + contracting pipeline
  const agents = useMemo((): AgentRow[] => {
    const agentData = (cached?.agentData as AgentProduction[]) || [];
    const atRiskPolicies: AtRiskPolicy[] = (cached?.atRiskResp as any)?.data?.policies || [];

    const atRiskByAgent = new Map<string, number>();
    atRiskPolicies.forEach(p => {
      const key = p.agent_writing_number || '';
      atRiskByAgent.set(key, (atRiskByAgent.get(key) || 0) + 1);
    });

    const goalByWn = new Map<string, number>();
    goals.forEach(g => {
      if (g.writing_number) goalByWn.set(g.writing_number, g.target_ap);
    });

    // Build a pipeline lookup by normalized name for merge
    const pipelineByName = new Map<string, PipelineAgent>();
    const matchedPipelineIds = new Set<string>();
    for (const p of pipelineAgents) {
      const key = (p.agent_name || '').trim().toLowerCase();
      if (key) pipelineByName.set(key, p);
    }

    // Map production agents, enriching with pipeline stage if matched
    const rows: AgentRow[] = agentData.map(a => {
      const wn = a.writing_number || a.agent_id;
      const targetAp = goalByWn.get(wn) ?? null;
      const goalPct = targetAp && targetAp > 0
        ? (a.ap_this_month / targetAp) * 100
        : null;

      // Try to match to a pipeline record by name
      const nameKey = (a.agent_name || '').trim().toLowerCase();
      const pipelineMatch = pipelineByName.get(nameKey);
      if (pipelineMatch) matchedPipelineIds.add(pipelineMatch.id);

      return {
        ...a,
        goal_target_ap: targetAp,
        goal_pct: goalPct,
        at_risk_count: atRiskByAgent.get(wn) || 0,
        pipeline_stage: pipelineMatch?.stage ?? null,
        pipeline_only: false,
      };
    });

    // Add pipeline-only agents (in contracting but not yet producing)
    for (const p of pipelineAgents) {
      if (matchedPipelineIds.has(p.id)) continue; // already merged with a production agent
      if (p.stage === 'terminated') continue; // skip terminated

      rows.push({
        agent_id: p.id,
        agent_name: p.agent_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
        writing_number: (p.writing_numbers as any)?.unl || null,
        agency_id: effectiveAgencyWritingNumber || '',
        total_policies: 0,
        active_policies: 0,
        terminated_policies: 0,
        pending_policies: 0,
        at_risk_policies: 0,
        active_monthly_premium: 0,
        active_annual_premium: 0,
        policies_this_month: 0,
        ap_this_month: 0,
        retained_policies: 0,
        ever_drafted: 0,
        avg_annual_premium: 0,
        retention_pct: null,
        earliest_issue_date: null,
        goal_target_ap: null,
        goal_pct: null,
        at_risk_count: 0,
        pipeline_stage: p.stage,
        pipeline_only: true,
      });
    }

    return rows;
  }, [cached, goals, pipelineAgents, effectiveAgencyWritingNumber, agencyDisplayName]);

  // ── Derived: filter + sort ──
  const filteredAgents = useMemo(() => {
    let list = [...agents];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.agent_name || '').toLowerCase().includes(q) ||
        (a.writing_number || '').toLowerCase().includes(q)
      );
    }

    // Pace filter
    if (paceFilter === 'in_pipeline') {
      list = list.filter(a => a.pipeline_only);
    } else if (paceFilter !== 'all') {
      list = list.filter(a => !a.pipeline_only && getPaceStatus(a.goal_pct) === paceFilter);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = (a.agent_name || '').localeCompare(b.agent_name || ''); break;
        case 'ap': cmp = a.ap_this_month - b.ap_this_month; break;
        case 'goal': cmp = (a.goal_pct ?? -1) - (b.goal_pct ?? -1); break;
        case 'apps': cmp = a.policies_this_month - b.policies_this_month; break;
        case 'retention': cmp = (a.retention_pct ?? -1) - (b.retention_pct ?? -1); break;
        case 'attention': cmp = a.at_risk_count - b.at_risk_count; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [agents, search, paceFilter, sortKey, sortDir]);

  // Summary stats
  const summary = useMemo(() => {
    const producing = agents.filter(a => !a.pipeline_only);
    const inPipeline = agents.filter(a => a.pipeline_only).length;
    const total = agents.length;
    const onTrack = producing.filter(a => getPaceStatus(a.goal_pct) === 'on_track').length;
    const catchUp = producing.filter(a => getPaceStatus(a.goal_pct) === 'catch_up').length;
    const behind = producing.filter(a => getPaceStatus(a.goal_pct) === 'behind').length;
    const totalAP = producing.reduce((s, a) => s + a.ap_this_month, 0);
    const totalApps = producing.reduce((s, a) => s + a.policies_this_month, 0);
    const totalAtRisk = producing.reduce((s, a) => s + a.at_risk_count, 0);
    const teamGoalAP = producing.reduce((s, a) => s + (a.goal_target_ap ?? 0), 0);
    const agentsWithGoals = producing.filter(a => a.goal_target_ap != null && a.goal_target_ap > 0).length;
    const teamGoalPct = teamGoalAP > 0 ? (totalAP / teamGoalAP) * 100 : null;
    return { total, inPipeline, onTrack, catchUp, behind, totalAP, totalApps, totalAtRisk, teamGoalAP, agentsWithGoals, teamGoalPct };
  }, [agents]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-muted-foreground" />;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-primary" />
      : <ChevronUp className="w-3 h-3 text-primary" />;
  };

  // ── Loading ──
  if (loading) {
    return (
      <>
        <Header title="My Team" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Activity className="w-8 h-8 text-primary/40 animate-pulse mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading team data…</p>
          </div>
        </div>
      </>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <>
        <Header title="My Team" />
        <div className="p-6">
          <Card className="border-red-500/30">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={loadData} className="mt-3 text-sm font-medium text-primary hover:underline">Retry</button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="My Team" />
      <div className="p-6 space-y-5 max-w-screen-xl mx-auto">
        <StaggerContainer>

          {/* ── Summary Strip ── */}
          <StaggerItem>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-1">
              <HudFrame>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Size</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{summary.total}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {summary.inPipeline > 0
                        ? `${summary.total - summary.inPipeline} producing · ${summary.inPipeline} in pipeline`
                        : 'agents in your book'}
                    </p>
                  </CardContent>
                </Card>
              </HudFrame>
              <HudFrame>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Book MTD AP</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{fmtCurrency(summary.totalAP)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{summary.totalApps} apps submitted</p>
                  </CardContent>
                </Card>
              </HudFrame>
              {/* ── Team Goal KPI ── */}
              <HudFrame>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Goal</p>
                    {summary.teamGoalAP > 0 ? (
                      <>
                        <p className={`text-2xl font-bold tabular-nums mt-1 ${
                          (summary.teamGoalPct ?? 0) >= 100 ? 'text-emerald-400'
                            : (summary.teamGoalPct ?? 0) >= 70 ? 'text-foreground'
                            : 'text-amber-400'
                        }`}>
                          {Math.round(summary.teamGoalPct!)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {fmtCurrency(summary.totalAP)} of {fmtCurrency(summary.teamGoalAP)} · {summary.agentsWithGoals} set
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-bold text-muted-foreground mt-1">—</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">no goals set</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </HudFrame>
              <HudFrame>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Goal Pacing</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-emerald-400 tabular-nums">{summary.onTrack}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-sm font-bold text-amber-400 tabular-nums">{summary.catchUp}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-sm font-bold text-red-400 tabular-nums">{summary.behind}</span>
                    </div>
                    {/* Pace strip */}
                    {summary.total > 0 && (
                      <div className="flex h-1.5 rounded-full overflow-hidden mt-2">
                        <div className="bg-emerald-400" style={{ width: `${(summary.onTrack / summary.total) * 100}%` }} />
                        <div className="bg-amber-400" style={{ width: `${(summary.catchUp / summary.total) * 100}%` }} />
                        <div className="bg-red-400" style={{ width: `${(summary.behind / summary.total) * 100}%` }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </HudFrame>
              <HudFrame>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Attention Items</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{summary.totalAtRisk}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">across all agents</p>
                  </CardContent>
                </Card>
              </HudFrame>
            </div>
          </StaggerItem>

          {/* ── Filters ── */}
          <StaggerItem>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaceFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${paceFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                >
                  All · {agents.length}
                </button>
                <button
                  onClick={() => setPaceFilter('on_track')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${paceFilter === 'on_track' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'border-border text-muted-foreground hover:border-emerald-500/30'}`}
                >
                  On Track · {summary.onTrack}
                </button>
                <button
                  onClick={() => setPaceFilter('catch_up')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${paceFilter === 'catch_up' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'border-border text-muted-foreground hover:border-amber-500/30'}`}
                >
                  Catch Up · {summary.catchUp}
                </button>
                <button
                  onClick={() => setPaceFilter('behind')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${paceFilter === 'behind' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'border-border text-muted-foreground hover:border-red-500/30'}`}
                >
                  Behind · {summary.behind}
                </button>
                {summary.inPipeline > 0 && (
                  <button
                    onClick={() => setPaceFilter('in_pipeline')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${paceFilter === 'in_pipeline' ? 'bg-violet-500/20 text-violet-400 border-violet-500/40' : 'border-border text-muted-foreground hover:border-violet-500/30'}`}
                  >
                    In Pipeline · {summary.inPipeline}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search agent name or #..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
                <button
                  onClick={() => exportTeamCsv(filteredAgents)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground hover:border-primary/30 transition-colors"
                  title="Export filtered list to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </div>
            </div>
          </StaggerItem>

          {/* ── Team Table ── */}
          <StaggerItem>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/20">
                      <th
                        className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                        onClick={() => toggleSort('name')}
                        aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center gap-1">Agent <SortIcon col="name" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                        onClick={() => toggleSort('ap')}
                        aria-sort={sortKey === 'ap' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-end gap-1">MTD AP <SortIcon col="ap" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                        onClick={() => toggleSort('goal')}
                        aria-sort={sortKey === 'goal' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-end gap-1">vs Goal <SortIcon col="goal" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                        onClick={() => toggleSort('apps')}
                        aria-sort={sortKey === 'apps' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-end gap-1">Apps <SortIcon col="apps" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                        onClick={() => toggleSort('retention')}
                        aria-sort={sortKey === 'retention' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-end gap-1">Retention <SortIcon col="retention" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
                        onClick={() => toggleSort('attention')}
                        aria-sort={sortKey === 'attention' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-end gap-1">Attention <SortIcon col="attention" /></div>
                      </th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                          {search.trim() || paceFilter !== 'all'
                            ? 'No agents match your filters.'
                            : 'No agents found in your book.'}
                        </td>
                      </tr>
                    ) : (
                      filteredAgents.map((agent) => {
                        const pace = getPaceStatus(agent.goal_pct);
                        const pc = paceColors[pace];
                        const wn = agent.writing_number || agent.agent_id;

                        return (
                          <tr
                            key={wn}
                            className={`border-b border-border/50 hover:bg-secondary/10 cursor-pointer transition-colors${
                              isInactive(agent) ? ' opacity-50' : ''
                            }`}
                            onClick={() => navigate(`/production/${agent.agency_id}/agent/${wn}`)}
                          >
                            {/* Agent name */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                  {(agent.agent_name || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-semibold text-sm text-foreground leading-tight">
                                      {agent.agent_name || 'Unknown'}
                                    </p>
                                    {isNewAgent(agent) && !agent.pipeline_only && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        New
                                      </span>
                                    )}
                                    {agent.pipeline_stage && (
                                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                        agent.pipeline_only
                                          ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
                                          : 'bg-teal-500/15 text-teal-400 border border-teal-500/25'
                                      }`}>
                                        <UserPlus className="w-2.5 h-2.5" />
                                        {STAGE_LABELS[agent.pipeline_stage] || agent.pipeline_stage}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    {agent.pipeline_only ? (agent.writing_number || 'In pipeline') : wn}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* MTD AP */}
                            <td className="px-4 py-3 text-right">
                              <p className="font-bold tabular-nums text-foreground">{fmtCurrency(agent.ap_this_month)}</p>
                            </td>

                            {/* vs Goal */}
                            <td className="px-4 py-3 text-right">
                              {agent.goal_pct != null ? (
                                <div>
                                  <p className={`font-bold tabular-nums ${pc.text}`}>
                                    {Math.round(agent.goal_pct)}%
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {fmtCurrency(agent.goal_target_ap!)} goal
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">—</p>
                              )}
                            </td>

                            {/* Apps */}
                            <td className="px-4 py-3 text-right tabular-nums text-foreground">
                              {agent.policies_this_month}
                            </td>

                            {/* Retention */}
                            <td className="px-4 py-3 text-right">
                              <p className={`font-bold tabular-nums ${retentionColor(agent.retention_pct)}`}>
                                {fmtPct(agent.retention_pct)}
                              </p>
                            </td>

                            {/* Attention */}
                            <td className="px-4 py-3 text-right">
                              {agent.at_risk_count > 0 ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] tabular-nums ${
                                    agent.at_risk_count >= 5
                                      ? 'border-red-500/40 text-red-400 bg-red-500/10'
                                      : agent.at_risk_count >= 3
                                        ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                                        : 'border-border text-muted-foreground'
                                  }`}
                                >
                                  {agent.at_risk_count}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">0</span>
                              )}
                            </td>

                            {/* Chevron */}
                            <td className="px-2 py-3">
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </StaggerItem>

        </StaggerContainer>
      </div>
    </>
  );
}
