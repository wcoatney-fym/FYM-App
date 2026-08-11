/**
 * Agency Leaderboard + Compete & Conquer
 *
 * Single page combining:
 * - Agency leaderboard (rankings, period toggles, metric toggles)
 * - Ramp Up board (new agents in last 90 days)
 * - Battles (head-to-head competitions)
 * - Challenges (time-boxed org/agency goals)
 * - Create New (battles + challenges form — admin/manager only)
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
// useNavigate removed — agent drill-down TBD
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StaggerContainer, StaggerItem, CountUp, RadialGauge } from '@/components/ui/animated';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { fetchAgentProduction } from '@/lib/prod-api';
// filterDailyByRange removed — was used by agency period data
// useCachedFetch removed — was used by agencyBattleWins
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
// useOrgData removed — agency-level rows no longer loaded here
import { DataFilters } from '@/components/filters/DataFilters';
// ExecutiveSummary + KpiSummaryTile imports removed — agency-level exec summary replaced by agent stats

import { RampUpBoard, type RampUpAgent } from '@/components/leaderboard/RampUpBoard';
import type { GamificationMetric, BattleType, ChallengeType } from '@/lib/database.types';
import {
  Trophy, TrendingUp, ShieldCheck, AlertTriangle, ChevronRight,
  ChevronDown, ChevronUp, Calendar, DollarSign, FileText, Rocket,
  Search, Swords, Target, Users, Percent, Crown, Plus,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { fmt$ } from '@/lib/formatUtils';

// ── Types ──────────────────────────────────────────────────────────────────
// Removed dead code block (lines 43-56)

interface AgentLeaderRow {
  agent_id: string;
  agent_name: string | null;
  agency_id: string;
  agency_name: string | null;
  active_policies: number;
  active_annual_premium: number;
  at_risk_policies: number;
  retained_policies: number;
  ever_drafted: number;
  retention_pct: number | null;
  avg_annual_premium: number;
  rank: number;
}

type SortKey = 'rank' | 'retention' | 'policies' | 'premium' | 'at_risk' | 'period_policies' | 'period_ap'
  | 'ap' | 'apps' | 'save_rate' | 'taken_pct' | 'avg_ap' | 'agents';
type BoardTab = 'agencies' | 'ramp_up' | 'battles' | 'challenges' | 'create';
// Period type removed — period toggles no longer in agency view
// Metric type removed — period/metric toggles replaced by agent leaderboard

// ── Compete types ──────────────────────────────────────────────────────────
interface Battle {
  id: string;
  title: string;
  description: string | null;
  battle_type: BattleType;
  metric: GamificationMetric;
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'active' | 'completed';
  created_by: string | null;
  created_at: string;
}

interface BattleParticipant {
  id: string;
  battle_id: string;
  participant_type: 'agent' | 'agency';
  agent_id: string | null;
  agency_id: string | null;
  display_name: string;
  starting_value: number;
  current_value: number;
  is_winner: boolean;
}

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  challenge_type: ChallengeType;
  target_agency_id: string | null;
  metric: GamificationMetric;
  goal_value: number;
  current_value: number;
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'active' | 'completed';
  is_achieved: boolean;
  created_at: string;
}

interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  agent_id: string | null;
  agency_id: string | null;
  display_name: string;
  contribution: number;
}

interface AgencyOption {
  writing_number: string;
  name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function retentionBg(pct: number | null) {
  if (pct === null) return 'bg-secondary';
  if (pct >= 90) return 'bg-emerald-500/10';
  if (pct >= 85) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm font-bold text-muted-foreground tabular-nums">#{rank}</span>;
}

// ── Compete helpers ────────────────────────────────────────────────────────
function competeMetricLabel(m: GamificationMetric) {
  switch (m) {
    case 'policies': return 'Policies Written';
    case 'ap': return 'Annual Premium';
    case 'retention': return 'Retention %';
  }
}

function competeMetricIcon(m: GamificationMetric) {
  switch (m) {
    case 'policies': return FileText;
    case 'ap': return DollarSign;
    case 'retention': return ShieldCheck;
  }
}

function competeFmtValue(v: number, m: GamificationMetric) {
  if (m === 'ap') {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
    return `$${Math.round(v).toLocaleString()}`;
  }
  if (m === 'retention') return `${v.toFixed(1)}%`;
  return v.toLocaleString();
}

function competeStatusBadge(status: 'upcoming' | 'active' | 'completed') {
  if (status === 'active') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 pulse-glow">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 inline-block" />
        Active
      </Badge>
    );
  }
  if (status === 'upcoming') {
    return <Badge className="bg-slate-500/15 text-slate-300 border-slate-500/30">Upcoming</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground border-border">Completed</Badge>;
}

function competeDaysRemaining(endDate: string): number {
  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function competeDateRange(start: string, end: string) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} \u2013 ${fmt(end)}`;
}

async function fetchCompeteRows<T>(table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  if (!supabase) return [];
  const PG = 100;
  let offset = 0;
  const rows: T[] = [];
  let done = false;
  while (!done) {
    let q = (supabase as any).from(table).select(select).range(offset, offset + PG - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) { done = true; break; }
    rows.push(...(data as T[]));
    if (data.length < PG) done = true;
    else offset += PG;
  }
  return rows;
}

/** Export displayed leaderboard rows to CSV and trigger download. */
// exportLeaderboardCsv removed — agency-level CSV export

// periodLabel removed — agency-level

/** Get CT-local date parts via Intl (DST-safe, no toLocaleString hack). */

// Removed dead code block (lines 249-269)

// ── Component ──────────────────────────────────────────────────────────────
export function LeaderboardPage() {
  // navigate removed — agent drill-down TBD
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  // orgData removed — agency-level rows no longer loaded here
  // rows state removed — agency-level view replaced by agent leaderboard
  const [agentRows, setAgentRows] = useState<AgentLeaderRow[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  // loading removed — replaced by agentLoading for agent leaderboard
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<'all' | 'above' | 'below'>('all');
  // period state removed — period toggles no longer in agency view
  // metric state removed — period/metric toggles replaced by agent leaderboard
  const [boardTab, setBoardTab] = useState<BoardTab>('agencies');
  const [rampUpAgents, setRampUpAgents] = useState<RampUpAgent[]>([]);
  const [rampUpLoading, setRampUpLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Compete state ──
  const canCreate = role === 'admin' || role === 'manager';
  const [competeLoading, setCompeteLoading] = useState(true);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [battleParticipants, setBattleParticipants] = useState<Map<string, BattleParticipant[]>>(new Map());
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeParticipants, setChallengeParticipants] = useState<Map<string, ChallengeParticipant[]>>(new Map());
  const [competeAgencies, setCompeteAgencies] = useState<AgencyOption[]>([]);
  // Create Battle form
  const [battleTitle, setBattleTitle] = useState('');
  const [battleDesc, setBattleDesc] = useState('');
  const [battleType, setBattleType] = useState<BattleType>('agent_vs_agent');
  const [battleMetric, setBattleMetric] = useState<GamificationMetric>('policies');
  const [battleStart, setBattleStart] = useState('');
  const [battleEnd, setBattleEnd] = useState('');
  const [battleSubmitting, setBattleSubmitting] = useState(false);
  // Create Challenge form
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDesc, setChallengeDesc] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('org_wide');
  const [challengeAgencyId, setChallengeAgencyId] = useState('');
  const [challengeMetric, setChallengeMetric] = useState<GamificationMetric>('policies');
  const [challengeGoal, setChallengeGoal] = useState('');
  const [challengeStart, setChallengeStart] = useState('');
  const [challengeEnd, setChallengeEnd] = useState('');
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);

  const scopedAgencies = useMemo(() => {
    if (isOrgWide || !effectiveAgencyId) return competeAgencies;
    return competeAgencies.filter(a => a.writing_number === effectiveAgencyId);
  }, [competeAgencies, isOrgWide, effectiveAgencyId]);

  // Cache period data
  // periodData removed — agency period data loading no longer needed

  // agencyBattleWins removed — was used by agency-level table rows





  // ── Agent leaderboard data ──
  // Scoped by agency: FYM admin defaults to FYM (or selected agency),
  // everyone else sees only their own agency's agents.
  const agentLeaderAgencyId = useMemo(() => {
    if (isOrgWide) return filterAgencyId || '202JVV00'; // FYM admin defaults to FYM house
    return effectiveAgencyId || null;
  }, [isOrgWide, filterAgencyId, effectiveAgencyId]);

  useEffect(() => {
    if (boardTab !== 'agencies' || !agentLeaderAgencyId) return;
    let cancelled = false;
    setAgentLoading(true);

    (async () => {
      try {
        const agents = await fetchAgentProduction({ agency_id: agentLeaderAgencyId });
        if (cancelled) return;

        // Look up agency name
        let agencyName: string | null = null;
        if (supabase) {
          const { data } = await (supabase as any)
            .from('agencies')
            .select('name')
            .eq('writing_number', agentLeaderAgencyId)
            .maybeSingle();
          if (data?.name) agencyName = data.name;
        }
        if (cancelled) return;

        const ranked = agents
          .map(a => ({
            agent_id: a.agent_id,
            agent_name: a.agent_name,
            agency_id: a.agency_id,
            agency_name: agencyName,
            active_policies: a.active_policies,
            active_annual_premium: a.active_annual_premium,
            at_risk_policies: a.at_risk_policies,
            retained_policies: a.retained_policies,
            ever_drafted: a.ever_drafted,
            retention_pct: a.retention_pct,
            avg_annual_premium: a.avg_annual_premium,
            rank: 0,
          }))
          .sort((a, b) => {
            const retA = a.retention_pct ?? -1;
            const retB = b.retention_pct ?? -1;
            if (retB !== retA) return retB - retA;
            return b.active_annual_premium - a.active_annual_premium;
          });
        ranked.forEach((r, i) => { r.rank = i + 1; });
        if (!cancelled) setAgentRows(ranked);
      } catch (err) {
        console.error('Agent leaderboard load error:', err);
        if (!cancelled) setAgentRows([]);
      } finally {
        if (!cancelled) setAgentLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [boardTab, agentLeaderAgencyId]);

  // Load ramp-up agents (first app within last 90 days)
  useEffect(() => {
    if (boardTab !== 'ramp_up') return;
    let cancelled = false;
    setRampUpLoading(true);

    const loadRampUp = async () => {
      try {
        const today = new Date();
        const ninetyDaysAgo = new Date(today);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoff = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`;

        // Scope to effective agency for non-FYM-admin users
        const agencyScope = isOrgWide ? (filterAgencyId || undefined) : (effectiveAgencyId || undefined);

        // Fetch agents — scoped by agency if applicable
        const allAgents = await fetchAgentProduction({
          start_date: cutoff,
          ...(agencyScope ? { agency_id: agencyScope } : {}),
        });
        if (cancelled) return;

        // Build agency name lookup for enrichment
        const agencyIds = [...new Set(allAgents.map(a => a.agency_id).filter(Boolean))];
        const agencyNameMap = new Map<string, string>();
        if (supabase && agencyIds.length > 0) {
          for (let i = 0; i < agencyIds.length; i += 50) {
            const chunk = agencyIds.slice(i, i + 50);
            const { data: agencyNames } = await (supabase as any)
              .from('agencies')
              .select('writing_number, name')
              .in('writing_number', chunk);
            if (agencyNames) {
              for (const ag of agencyNames as any[]) {
                if (ag.writing_number && ag.name) agencyNameMap.set(ag.writing_number, ag.name);
              }
            }
          }
        }
        if (cancelled) return;

        const rampAgents: RampUpAgent[] = [];

        for (const a of allAgents) {
          // Check if this is a ramp-up agent (earliest_issue_date within 90 days)
          const firstDate = a.earliest_issue_date;
          if (!firstDate || firstDate < cutoff) continue;

          const daysActive = Math.floor(
            (today.getTime() - new Date(firstDate + 'T00:00:00').getTime()) / 86400000,
          );

          const totalApps = a.active_policies + a.terminated_policies + a.pending_policies;
          const totalAP = a.active_annual_premium;

          rampAgents.push({
            agent_id: a.agent_id,
            agent_name: a.agent_name ?? a.agent_id,
            agency_name: agencyNameMap.get(a.agency_id) ?? null,
            first_app_date: firstDate,
            days_active: daysActive,
            total_apps: totalApps,
            total_ap: totalAP,
            avg_ap_per_app: totalApps > 0 ? totalAP / totalApps : 0,
            retention_pct: a.retention_pct ?? null,
            at_risk_count: a.at_risk_policies ?? 0,
          });
        }

        if (!cancelled) setRampUpAgents(rampAgents);
      } catch (err) {
        console.error('Ramp-up load error:', err);
        if (!cancelled) setRampUpAgents([]);
      } finally {
        if (!cancelled) setRampUpLoading(false);
      }
    };

    loadRampUp();
    return () => { cancelled = true; };
  }, [boardTab, isOrgWide, filterAgencyId, effectiveAgencyId]);




  // ── Compete data loading ──
  const loadCompeteData = useCallback(async () => {
    if (!supabase) { setCompeteLoading(false); return; }
    setCompeteLoading(true);
    try {
      const [battleRows, challengeRows, agencyRows] = await Promise.all([
        fetchCompeteRows<Battle>('battles', '*', (q) => q.order('created_at', { ascending: false })),
        fetchCompeteRows<Challenge>('challenges', '*', (q) => q.order('created_at', { ascending: false })),
        fetchCompeteRows<AgencyOption>('agencies', 'writing_number, name'),
      ]);
      setBattles(battleRows);
      setChallenges(challengeRows);
      setCompeteAgencies(agencyRows.filter(a => a.writing_number));

      if (battleRows.length > 0) {
        const bpMap = new Map<string, BattleParticipant[]>();
        const allBp = await fetchCompeteRows<BattleParticipant>(
          'battle_participants', '*',
          (q) => q.in('battle_id', battleRows.map(b => b.id))
        );
        for (const bp of allBp) {
          const list = bpMap.get(bp.battle_id) || [];
          list.push(bp);
          bpMap.set(bp.battle_id, list);
        }
        for (const [k, list] of bpMap) {
          list.sort((a, b) => b.current_value - a.current_value);
          bpMap.set(k, list);
        }
        setBattleParticipants(bpMap);
      } else {
        setBattleParticipants(new Map());
      }

      if (challengeRows.length > 0) {
        const cpMap = new Map<string, ChallengeParticipant[]>();
        const allCp = await fetchCompeteRows<ChallengeParticipant>(
          'challenge_participants', '*',
          (q) => q.in('challenge_id', challengeRows.map(c => c.id))
        );
        for (const cp of allCp) {
          const list = cpMap.get(cp.challenge_id) || [];
          list.push(cp);
          cpMap.set(cp.challenge_id, list);
        }
        for (const [k, list] of cpMap) {
          list.sort((a, b) => b.contribution - a.contribution);
          cpMap.set(k, list);
        }
        setChallengeParticipants(cpMap);
      } else {
        setChallengeParticipants(new Map());
      }
    } catch (err) {
      console.error('Compete data load error:', err);
    } finally {
      setCompeteLoading(false);
    }
  }, []);

  // Load compete data when switching to battles/challenges/create tab
  useEffect(() => {
    if (boardTab === 'battles' || boardTab === 'challenges' || boardTab === 'create') {
      loadCompeteData();
    }
  }, [boardTab, loadCompeteData]);

  // ── Compete stats ──
  const battleStats = useMemo(() => {
    const active = battles.filter(b => b.status === 'active').length;
    const completed = battles.filter(b => b.status === 'completed').length;
    let totalParticipants = 0;
    for (const list of battleParticipants.values()) totalParticipants += list.length;
    let won = 0;
    let completedForUser = 0;
    if (profile) {
      for (const b of battles) {
        if (b.status !== 'completed') continue;
        const parts = battleParticipants.get(b.id) || [];
        const mine = parts.find(p => p.agent_id === profile.id || p.agency_id === (profile as any).agency_id);
        if (mine) {
          completedForUser += 1;
          if (mine.is_winner) won += 1;
        }
      }
    }
    const winRate = completedForUser > 0 ? Math.round((won / completedForUser) * 100) : 0;
    return { active, completed, totalParticipants, winRate };
  }, [battles, battleParticipants, profile]);

  const challengeStats = useMemo(() => {
    const active = challenges.filter(c => c.status === 'active').length;
    const completed = challenges.filter(c => c.status === 'completed').length;
    const achieved = challenges.filter(c => c.is_achieved).length;
    const achievementRate = completed > 0 ? Math.round((achieved / completed) * 100) : 0;
    return { active, completed, achieved, achievementRate };
  }, [challenges]);

  // ── Compete form handlers ──
  async function handleCreateBattle(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!battleTitle.trim() || !battleStart || !battleEnd) {
      toast({ title: 'Missing fields', description: 'Title, start date, and end date are required.', variant: 'destructive' });
      return;
    }
    setBattleSubmitting(true);
    try {
      const { error } = await (supabase as any).from('battles').insert({
        title: battleTitle.trim(),
        description: battleDesc.trim() || null,
        battle_type: battleType,
        metric: battleMetric,
        start_date: battleStart,
        end_date: battleEnd,
        status: 'upcoming',
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Battle created', description: `"${battleTitle.trim()}" is ready to go.` });
      setBattleTitle(''); setBattleDesc(''); setBattleType('agent_vs_agent');
      setBattleMetric('policies'); setBattleStart(''); setBattleEnd('');
      await loadCompeteData();
    } catch (err: any) {
      toast({ title: 'Failed to create battle', description: err.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setBattleSubmitting(false);
    }
  }

  async function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!challengeTitle.trim() || !challengeGoal || !challengeStart || !challengeEnd) {
      toast({ title: 'Missing fields', description: 'Title, goal value, start date, and end date are required.', variant: 'destructive' });
      return;
    }
    const resolvedAgencyId = !isOrgWide && effectiveAgencyId ? effectiveAgencyId : (challengeAgencyId || null);
    setChallengeSubmitting(true);
    try {
      const { error } = await (supabase as any).from('challenges').insert({
        title: challengeTitle.trim(),
        description: challengeDesc.trim() || null,
        challenge_type: challengeType,
        target_agency_id: challengeType === 'agency' ? resolvedAgencyId : null,
        metric: challengeMetric,
        goal_value: Number(challengeGoal),
        start_date: challengeStart,
        end_date: challengeEnd,
        status: 'upcoming',
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Challenge created', description: `"${challengeTitle.trim()}" is ready to go.` });
      setChallengeTitle(''); setChallengeDesc(''); setChallengeType('org_wide');
      setChallengeAgencyId(''); setChallengeMetric('policies'); setChallengeGoal('');
      setChallengeStart(''); setChallengeEnd('');
      await loadCompeteData();
    } catch (err: any) {
      toast({ title: 'Failed to create challenge', description: err.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setChallengeSubmitting(false);
    }
  }

  // Ramp-up agent count for badge
  const rampUpCount = rampUpAgents.length;
  const activeBattleCount = battles.filter(b => b.status === 'active').length;


  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'rank'); }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc
      ? <ChevronUp size={10} className="inline ml-0.5" />
      : <ChevronDown size={10} className="inline ml-0.5" />;
  }

  return (
    <div>
      <Header title="Agency Leaderboard" />
      <div className="p-6 space-y-6">

        {/* Agency filter — FYM admins only */}
        {showAgencyFilter && (
          <DataFilters
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />
        )}

        {/* Board Tab Switcher */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5 w-fit flex-wrap">
          {([
            { key: 'agencies' as BoardTab, label: 'Agencies', icon: Trophy },
            { key: 'ramp_up' as BoardTab, label: 'Ramp Up', icon: Rocket, badge: rampUpCount > 0 ? rampUpCount : undefined },
            { key: 'battles' as BoardTab, label: 'Battles', icon: Swords, badge: activeBattleCount > 0 ? activeBattleCount : undefined },
            { key: 'challenges' as BoardTab, label: 'Challenges', icon: Target },
            ...(canCreate ? [{ key: 'create' as BoardTab, label: 'Create New', icon: Plus }] : []),
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setBoardTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                boardTab === tab.key
                  ? 'gradient-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} /> {tab.label}
              {tab.badge && boardTab !== tab.key && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Ramp Up Board */}
        {boardTab === 'ramp_up' && (
          <RampUpBoard agents={rampUpAgents} loading={rampUpLoading} />
        )}

        {/* Agencies Board — Agent Leaderboard (scoped by agency) */}
        {boardTab === 'agencies' && (<>

        {(() => {
          // Filter + search agent rows
          const agentSortKey = sortKey;
          const filteredAgents = agentRows
            .filter(r => {
              if (filter === 'above') return r.retention_pct !== null && r.retention_pct >= 90;
              if (filter === 'below') return r.retention_pct === null || r.retention_pct < 90;
              return true;
            })
            .filter(r => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.trim().toLowerCase();
              return (r.agent_name?.toLowerCase().includes(q)) || r.agent_id.toLowerCase().includes(q);
            });

          // Sort
          const sortedAgents = [...filteredAgents].sort((a, b) => {
            let cmp = 0;
            switch (agentSortKey) {
              case 'rank': cmp = a.rank - b.rank; break;
              case 'retention': cmp = (a.retention_pct ?? -1) - (b.retention_pct ?? -1); break;
              case 'policies': cmp = a.active_policies - b.active_policies; break;
              case 'premium': cmp = a.active_annual_premium - b.active_annual_premium; break;
              case 'at_risk': cmp = a.at_risk_policies - b.at_risk_policies; break;
              default: cmp = a.rank - b.rank;
            }
            return sortAsc ? cmp : -cmp;
          });

          // Agent stats
          const agentStats = {
            total: sortedAgents.length,
            above: sortedAgents.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length,
            below: sortedAgents.filter(r => r.retention_pct === null || r.retention_pct < 90).length,
            totalPremium: sortedAgents.reduce((s, r) => s + r.active_annual_premium, 0),
            totalPolicies: sortedAgents.reduce((s, r) => s + r.active_policies, 0),
          };

          const agencyLabel = agentRows[0]?.agency_name || agentLeaderAgencyId || 'Agency';

          return <>
            {/* Agency header */}
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">{agencyLabel} — Agent Leaderboard</h2>
            </div>

            {/* Stats strip */}
            <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Total Agents', end: agentStats.total, icon: Users, color: 'text-primary', bg: 'bg-cyan-500/10' },
                { title: 'Above 90% Target', end: agentStats.above, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { title: 'Below 90% Target', end: agentStats.below, icon: AlertTriangle, color: agentStats.below > 0 ? 'text-red-400' : 'text-muted-foreground', bg: agentStats.below > 0 ? 'bg-red-500/10' : 'bg-secondary' },
                { title: 'Total Active Premium', end: agentStats.totalPremium, icon: TrendingUp, color: 'text-foreground/80', bg: 'bg-secondary', fmt: (n: number) => fmt$(n) },
              ].map(card => (
                <StaggerItem key={card.title}>
                  <Card className="border-border">
                    <CardContent className="p-4">
                      {agentLoading ? (
                        <div className="h-12 rounded shimmer" />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                            <CountUp
                              end={card.end}
                              format={card.fmt}
                              className="text-2xl font-bold text-foreground mt-0.5 block"
                            />
                          </div>
                          <div className={`p-2 rounded-lg ${card.bg}`}>
                            <card.icon size={18} className={card.color} />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* Filter tabs + search */}
            <div className="flex flex-wrap items-center gap-2">
              {([['all', 'All'], ['above', '≥ 90%'], ['below', '< 90%']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filter === key
                      ? 'gradient-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="relative ml-auto">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search agents…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {sortedAgents.length} {sortedAgents.length === 1 ? 'agent' : 'agents'}
              </span>
            </div>

            {/* Agent leaderboard table */}
            <Card className="border-border overflow-hidden">
              <CardContent className="p-0">
                {agentLoading ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded shimmer" />)}
                  </div>
                ) : sortedAgents.length === 0 ? (
                  <div className="py-16 text-center">
                    <Users size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {searchQuery.trim()
                        ? `No agents matching "${searchQuery.trim()}"`
                        : 'No agents match the current filter'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filter !== 'all' && `Showing: ${filter === 'above' ? '≥ 90%' : '< 90%'} retention. `}
                      Try adjusting the retention filter.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-background border-b border-border/50 text-xs font-semibold text-muted-foreground">
                          <th
                            className="px-4 py-2.5 text-left cursor-pointer hover:text-foreground whitespace-nowrap w-16"
                            onClick={() => toggleSort('rank')}
                          >Rank <SortArrow k="rank" /></th>
                          <th className="px-2 py-2.5 text-left">Agent</th>
                          <th
                            className="px-2 py-2.5 text-center cursor-pointer hover:text-foreground whitespace-nowrap"
                            onClick={() => toggleSort('retention')}
                          >90-Day Retention <SortArrow k="retention" /></th>
                          <th
                            className="px-2 py-2.5 text-right cursor-pointer hover:text-foreground whitespace-nowrap"
                            onClick={() => toggleSort('policies')}
                          >Active <SortArrow k="policies" /></th>
                          <th
                            className="px-2 py-2.5 text-right cursor-pointer hover:text-foreground whitespace-nowrap"
                            onClick={() => toggleSort('premium')}
                          >Premium <SortArrow k="premium" /></th>
                          <th
                            className="px-2 py-2.5 text-center cursor-pointer hover:text-foreground whitespace-nowrap w-20"
                            onClick={() => toggleSort('at_risk')}
                          >At-Risk <SortArrow k="at_risk" /></th>
                          <th className="px-2 py-2.5 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {sortedAgents.map((r) => (
                          <tr
                            key={r.agent_id}
                            className={`hover:bg-background/80 transition-colors ${
                              r.rank <= 3 ? 'bg-amber-500/10' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-center">{rankBadge(r.rank)}</td>
                            <td className="px-2 py-3">
                              <span className="font-medium text-foreground truncate max-w-[200px] block">
                                {r.agent_name ?? <span className="font-data text-xs text-muted-foreground">{r.agent_id.slice(0, 12)}…</span>}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${retentionBg(r.retention_pct)} ${retentionColor(r.retention_pct)}`}>
                                {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-right text-foreground/80 font-data">
                              {r.active_policies.toLocaleString()}
                            </td>
                            <td className="px-2 py-3 text-right text-foreground/80 font-data">
                              {fmt$(r.active_annual_premium)}
                            </td>
                            <td className={`px-2 py-3 text-center font-medium font-data ${r.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {r.at_risk_policies || '—'}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <ChevronRight size={16} className="text-muted-foreground" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>;
        })()}

        </>)}{/* end boardTab === 'agencies' */}

        {/* ── Battles tab ── */}
        {boardTab === 'battles' && (
          <div className="space-y-6">
            <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Active Battles', end: battleStats.active, icon: Swords, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { title: 'Completed', end: battleStats.completed, icon: CheckCircle2, color: 'text-primary', bg: 'bg-cyan-500/10' },
                { title: 'Total Participants', end: battleStats.totalParticipants, icon: Users, color: 'text-foreground/80', bg: 'bg-secondary' },
                { title: 'Your Win Rate', end: battleStats.winRate, icon: Crown, color: 'text-amber-400', bg: 'bg-amber-500/10', suffix: '%' },
              ].map(card => (
                <StaggerItem key={card.title}>
                  <Card className="border-border">
                    <CardContent className="p-4">
                      {competeLoading ? (
                        <div className="h-12 rounded shimmer" />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                            <CountUp
                              end={card.end}
                              suffix={card.suffix}
                              className="text-xl font-bold text-foreground mt-0.5 block"
                            />
                          </div>
                          <div className={`p-2 rounded-lg ${card.bg}`}>
                            <card.icon size={18} className={card.color} />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {competeLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-64 rounded-lg shimmer" />)}
              </div>
            ) : battles.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-16 text-center">
                  <Swords size={32} className="mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No battles yet.</p>
                  {canCreate && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Head to <button onClick={() => setBoardTab('create')} className="text-primary hover:underline">Create New</button> to start one.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {battles.map(battle => {
                  const participants = battleParticipants.get(battle.id) || [];
                  const maxValue = Math.max(1, ...participants.map(p => p.current_value));
                  const MetricIcon = competeMetricIcon(battle.metric);
                  const winner = participants.find(p => p.is_winner);
                  return (
                    <Card key={battle.id} className="border-border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base font-semibold text-foreground">{battle.title}</CardTitle>
                            {battle.description && <p className="text-xs text-muted-foreground mt-1">{battle.description}</p>}
                          </div>
                          {competeStatusBadge(battle.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><MetricIcon size={12} />{competeMetricLabel(battle.metric)}</span>
                          <span className="flex items-center gap-1"><Calendar size={12} />{competeDateRange(battle.start_date, battle.end_date)}</span>
                          {battle.status === 'active' && (
                            <span className="flex items-center gap-1 text-emerald-400"><Clock size={12} />{competeDaysRemaining(battle.end_date)}d left</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        {participants.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-4 text-center">No participants added yet.</p>
                        ) : (
                          participants.map(p => (
                            <div key={p.id}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className={`font-medium truncate flex items-center gap-1.5 ${battle.status === 'completed' && p.is_winner ? 'text-amber-400' : 'text-foreground'}`}>
                                  {battle.status === 'completed' && p.is_winner && <Trophy size={12} className="text-amber-400" />}
                                  {p.display_name}
                                </span>
                                <span className="font-data text-muted-foreground">{competeFmtValue(p.current_value, battle.metric)}</span>
                              </div>
                              <div className="h-2 rounded-full bg-secondary/50 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${battle.status === 'completed' && p.is_winner ? 'bg-amber-400' : 'gradient-primary'}`}
                                  style={{ width: `${Math.min(100, (p.current_value / maxValue) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ))
                        )}
                        {battle.status === 'completed' && winner && (
                          <div className="flex items-center gap-2 pt-2 border-t border-border/30 text-xs text-amber-400">
                            <Trophy size={14} />
                            <span className="font-semibold">{winner.display_name}</span> wins this battle
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Challenges tab ── */}
        {boardTab === 'challenges' && (
          <div className="space-y-6">
            <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Active Challenges', end: challengeStats.active, icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { title: 'Completed', end: challengeStats.completed, icon: CheckCircle2, color: 'text-primary', bg: 'bg-cyan-500/10' },
                { title: 'Achieved', end: challengeStats.achieved, icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                { title: 'Achievement Rate', end: challengeStats.achievementRate, icon: Percent, color: 'text-foreground/80', bg: 'bg-secondary', suffix: '%' },
              ].map(card => (
                <StaggerItem key={card.title}>
                  <Card className="border-border">
                    <CardContent className="p-4">
                      {competeLoading ? (
                        <div className="h-12 rounded shimmer" />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                            <CountUp end={card.end} suffix={card.suffix} className="text-xl font-bold text-foreground mt-0.5 block" />
                          </div>
                          <div className={`p-2 rounded-lg ${card.bg}`}>
                            <card.icon size={18} className={card.color} />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {competeLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-72 rounded-lg shimmer" />)}
              </div>
            ) : challenges.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-16 text-center">
                  <Target size={32} className="mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No challenges yet.</p>
                  {canCreate && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Head to <button onClick={() => setBoardTab('create')} className="text-primary hover:underline">Create New</button> to set one up.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {challenges.map(challenge => {
                  const participants = challengeParticipants.get(challenge.id) || [];
                  const pct = challenge.goal_value > 0
                    ? Math.min(100, (challenge.current_value / challenge.goal_value) * 100)
                    : 0;
                  const MetricIcon = competeMetricIcon(challenge.metric);
                  return (
                    <Card key={challenge.id} className="border-border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base font-semibold text-foreground">{challenge.title}</CardTitle>
                            {challenge.description && <p className="text-xs text-muted-foreground mt-1">{challenge.description}</p>}
                          </div>
                          {competeStatusBadge(challenge.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
                          <span className="flex items-center gap-1"><MetricIcon size={12} />{competeMetricLabel(challenge.metric)}</span>
                          <span className="flex items-center gap-1"><Calendar size={12} />{competeDateRange(challenge.start_date, challenge.end_date)}</span>
                          <span className="uppercase tracking-wide text-[10px] text-muted-foreground">
                            {challenge.challenge_type === 'org_wide' ? 'Org-Wide' : 'Agency-Specific'}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-5">
                          <RadialGauge value={pct} size={100} strokeWidth={8} thresholds={[50, 90]} />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Progress</p>
                              <p className="font-data text-sm text-foreground">
                                {competeFmtValue(challenge.current_value, challenge.metric)} / {competeFmtValue(challenge.goal_value, challenge.metric)}
                              </p>
                            </div>
                            {challenge.status === 'completed' && (
                              challenge.is_achieved ? (
                                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                  <CheckCircle2 size={11} className="mr-1" /> Achieved
                                </Badge>
                              ) : (
                                <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
                                  <XCircle size={11} className="mr-1" /> Missed
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                        {participants.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-border/30">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Top Contributors</p>
                            <div className="space-y-1.5">
                              {participants.slice(0, 5).map((p, i) => (
                                <div key={p.id} className="flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1.5 text-foreground/80 truncate">
                                    <span className="text-muted-foreground font-data w-4">{i + 1}.</span>
                                    {p.display_name}
                                  </span>
                                  <span className="font-data text-muted-foreground">{competeFmtValue(p.contribution, challenge.metric)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Create New tab ── */}
        {boardTab === 'create' && canCreate && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Battle */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Swords size={18} className="text-primary" /> Create Battle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateBattle} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                    <Input required placeholder="Q3 Policy Sprint" value={battleTitle} onChange={e => setBattleTitle(e.target.value)} className="bg-card" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                    <Textarea placeholder="Optional context for participants" value={battleDesc} onChange={e => setBattleDesc(e.target.value)} className="bg-card" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Battle Type</label>
                      <div className="flex gap-2">
                        {([['agent_vs_agent', 'Agent'], ['agency_vs_agency', 'Agency']] as const).map(([val, label]) => (
                          <button key={val} type="button" onClick={() => setBattleType(val)}
                            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              battleType === val
                                ? 'gradient-primary text-primary-foreground border-primary/30'
                                : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                            }`}
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Metric</label>
                      <select value={battleMetric} onChange={e => setBattleMetric(e.target.value as GamificationMetric)}
                        className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-sm text-foreground">
                        <option value="policies">Policies Written</option>
                        <option value="ap">Annual Premium</option>
                        <option value="retention">Retention %</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label>
                      <Input required type="date" value={battleStart} onChange={e => setBattleStart(e.target.value)} className="bg-card" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
                      <Input required type="date" value={battleEnd} onChange={e => setBattleEnd(e.target.value)} className="bg-card" />
                    </div>
                  </div>
                  <Button type="submit" disabled={battleSubmitting} className="w-full bg-primary hover:bg-primary/80 text-white">
                    {battleSubmitting ? 'Creating\u2026' : 'Create Battle'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Create Challenge */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Target size={18} className="text-primary" /> Create Challenge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateChallenge} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                    <Input required placeholder="August Retention Push" value={challengeTitle} onChange={e => setChallengeTitle(e.target.value)} className="bg-card" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                    <Textarea placeholder="Optional context for participants" value={challengeDesc} onChange={e => setChallengeDesc(e.target.value)} className="bg-card" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Challenge Type</label>
                      <div className="flex gap-2">
                        {([['org_wide', 'Org-Wide'], ['agency', 'Agency']] as const).map(([val, label]) => (
                          <button key={val} type="button" onClick={() => setChallengeType(val)}
                            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              challengeType === val
                                ? 'gradient-primary text-primary-foreground border-primary/30'
                                : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                            }`}
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Metric</label>
                      <select value={challengeMetric} onChange={e => setChallengeMetric(e.target.value as GamificationMetric)}
                        className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-sm text-foreground">
                        <option value="policies">Policies Written</option>
                        <option value="ap">Annual Premium</option>
                        <option value="retention">Retention %</option>
                      </select>
                    </div>
                  </div>
                  {challengeType === 'agency' && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Agency</label>
                      <select
                        value={!isOrgWide && effectiveAgencyId ? effectiveAgencyId : challengeAgencyId}
                        onChange={e => setChallengeAgencyId(e.target.value)}
                        disabled={!isOrgWide && !!effectiveAgencyId}
                        className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-sm text-foreground disabled:opacity-60">
                        <option value="">Select an agency\u2026</option>
                        {scopedAgencies.map(a => (
                          <option key={a.writing_number} value={a.writing_number}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Goal Value *</label>
                    <Input required type="number" min="0" step="any" placeholder="e.g. 50" value={challengeGoal}
                      onChange={e => setChallengeGoal(e.target.value)} className="bg-card font-data" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label>
                      <Input required type="date" value={challengeStart} onChange={e => setChallengeStart(e.target.value)} className="bg-card" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
                      <Input required type="date" value={challengeEnd} onChange={e => setChallengeEnd(e.target.value)} className="bg-card" />
                    </div>
                  </div>
                  <Button type="submit" disabled={challengeSubmitting} className="w-full bg-primary hover:bg-primary/80 text-white">
                    {challengeSubmitting ? 'Creating\u2026' : 'Create Challenge'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
