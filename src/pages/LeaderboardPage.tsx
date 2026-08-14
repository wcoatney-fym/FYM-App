/**
 * Agency Leaderboard + Compete & Conquer
 *
 * Compressed layout (3 tabs):
 * - Leaderboard: top-10 period-based agent rankings (quality/production/overall)
 * - Compete: battles + challenges in one view
 * - Create New: admin/manager battle & challenge creation
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
import { HeroPodium, type PodiumAgent } from '@/components/leaderboard/HeroPodium';
import { LeaderboardTable, type LeaderRow } from '@/components/leaderboard/LeaderboardTable';
import { YourPosition } from '@/components/leaderboard/YourPosition';
// filterDailyByRange removed — was used by agency period data
// useCachedFetch removed — was used by agencyBattleWins
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
// useOrgData removed — agency-level rows no longer loaded here
import { DataFilters } from '@/components/filters/DataFilters';
// ExecutiveSummary + KpiSummaryTile imports removed — agency-level exec summary replaced by agent stats

// RampUpBoard removed — ramp-up folded into main leaderboard
import type { GamificationMetric, BattleType, ChallengeType } from '@/lib/database.types';
import {
  Trophy, TrendingUp, ShieldCheck,
  Calendar, DollarSign, FileText,
  Swords, Target, Users, Crown, Plus,
  CheckCircle2, XCircle,
} from 'lucide-react';
// fmt$ moved to HeroPodium/LeaderboardTable components
import { BattleMatchup } from '@/components/leaderboard/BattleMatchup';
import { HallOfFame, type HallOfFameEntry } from '@/components/leaderboard/HallOfFame';

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
  /** Rank change vs prior period: positive = climbed, negative = dropped, 0 = unchanged, undefined = new */
  movement?: number;
}

// SortKey removed — top 10 leaderboard sorts by category, not user-toggled columns
type BoardTab = 'leaderboard' | 'compete' | 'create';
type LeaderPeriod = 'week' | 'month' | 'year';
type LeaderCategory = 'overall' | 'quality' | 'production';

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
// retentionColor, retentionBg, rankBadge moved to HeroPodium / LeaderboardTable components

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

// competeDaysRemaining moved to BattleMatchup component

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
  // sortKey/sortAsc removed — top 10 leaderboard sorts by category
  // filter/search removed — top 10 leaderboard doesn't need manual filtering
  // Leaderboard period + category state
  const [leaderPeriod, setLeaderPeriod] = useState<LeaderPeriod>('month');
  const [leaderCategory, setLeaderCategory] = useState<LeaderCategory>('overall');
  const [boardTab, setBoardTab] = useState<BoardTab>('leaderboard');
  // searchQuery removed — top 10 leaderboard doesn't need search

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

  // Compute date range for selected leaderboard period + prior period for movement
  const { leaderDateRange, priorDateRange } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const endDate = fmtDate(now);
    let startDate: string;
    let priorStart: string;
    let priorEnd: string;
    switch (leaderPeriod) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay()); // start of current week (Sunday)
        startDate = fmtDate(d);
        // Prior week
        const prevWeekEnd = new Date(d);
        prevWeekEnd.setDate(prevWeekEnd.getDate() - 1); // Saturday before
        const prevWeekStart = new Date(prevWeekEnd);
        prevWeekStart.setDate(prevWeekStart.getDate() - 6); // Sunday before that
        priorStart = fmtDate(prevWeekStart);
        priorEnd = fmtDate(prevWeekEnd);
        break;
      }
      case 'month': {
        startDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        // Prior month
        const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        priorStart = fmtDate(pm);
        const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prior month
        priorEnd = fmtDate(pmEnd);
        break;
      }
      case 'year': {
        startDate = `${now.getFullYear()}-01-01`;
        // Prior year
        priorStart = `${now.getFullYear() - 1}-01-01`;
        priorEnd = `${now.getFullYear() - 1}-12-31`;
        break;
      }
    }
    return {
      leaderDateRange: { startDate, endDate },
      priorDateRange: { startDate: priorStart, endDate: priorEnd },
    };
  }, [leaderPeriod]);

  useEffect(() => {
    if (boardTab !== 'leaderboard' || !agentLeaderAgencyId) return;
    let cancelled = false;
    setAgentLoading(true);

    (async () => {
      try {
        // Fetch current + prior period in parallel for movement computation
        const [agents, priorAgents] = await Promise.all([
          fetchAgentProduction({
            agency_id: agentLeaderAgencyId,
            start_date: leaderDateRange.startDate,
            end_date: leaderDateRange.endDate,
          }),
          fetchAgentProduction({
            agency_id: agentLeaderAgencyId,
            start_date: priorDateRange.startDate,
            end_date: priorDateRange.endDate,
          }),
        ]);
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

        // Rank prior period agents (same default sort: retention desc, then premium desc)
        const priorProducing = priorAgents.filter(a => a.total_policies > 0)
          .sort((a, b) => {
            const retA = a.retention_pct ?? -1;
            const retB = b.retention_pct ?? -1;
            if (retB !== retA) return retB - retA;
            return b.active_annual_premium - a.active_annual_premium;
          });
        const priorRankMap = new Map<string, number>();
        priorProducing.forEach((a, i) => { priorRankMap.set(a.agent_id, i + 1); });

        // Only include agents who actually produced in this period
        const producingAgents = agents.filter(a => a.total_policies > 0);

        const ranked: AgentLeaderRow[] = producingAgents
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
        ranked.forEach((r, i) => {
          r.rank = i + 1;
          const priorRank = priorRankMap.get(r.agent_id);
          // movement = priorRank - currentRank (positive = climbed, negative = dropped)
          // undefined = new to the leaderboard this period
          r.movement = priorRank !== undefined ? priorRank - r.rank : undefined;
        });
        if (!cancelled) setAgentRows(ranked);
      } catch (err) {
        console.error('Agent leaderboard load error:', err);
        if (!cancelled) setAgentRows([]);
      } finally {
        if (!cancelled) setAgentLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [boardTab, agentLeaderAgencyId, leaderDateRange, priorDateRange]);

  // Ramp-up tab removed — new agents appear in the main leaderboard naturally


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

  // Load compete data when switching to compete or create tab
  useEffect(() => {
    if (boardTab === 'compete' || boardTab === 'create') {
      loadCompeteData();
    }
  }, [boardTab, loadCompeteData]);

  // ── Compete stats ──
  // Defensive Map access — guards against corrupted state where Map becomes plain object
  const safeMapGet = <V,>(m: Map<string, V> | Record<string, V>, key: string): V | undefined => {
    if (m instanceof Map) return m.get(key);
    return (m as Record<string, V>)?.[key];
  };
  const safeMapValues = <V,>(m: Map<string, V> | Record<string, V>): V[] => {
    if (m instanceof Map) return [...m.values()];
    return Object.values(m || {});
  };

  const battleStats = useMemo(() => {
    const active = battles.filter(b => b.status === 'active').length;
    const completed = battles.filter(b => b.status === 'completed').length;
    let totalParticipants = 0;
    for (const list of safeMapValues(battleParticipants)) totalParticipants += list.length;
    let won = 0;
    let completedForUser = 0;
    if (profile) {
      for (const b of battles) {
        if (b.status !== 'completed') continue;
        const parts = safeMapGet(battleParticipants, b.id) || [];
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

  const activeBattleCount = battles.filter(b => b.status === 'active').length;
  const activeChallengeCount = challenges.filter(c => c.status === 'active').length;
  const activeCompeteCount = activeBattleCount + activeChallengeCount;


  // toggleSort/SortArrow removed — top 10 leaderboard sorts by category

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

        {/* Board Tab Switcher — compressed: Leaderboard | Compete | Create New */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5 w-fit flex-wrap">
          {([
            { key: 'leaderboard' as BoardTab, label: 'Leaderboard', icon: Trophy },
            { key: 'compete' as BoardTab, label: 'Compete', icon: Swords, badge: activeCompeteCount > 0 ? activeCompeteCount : undefined },
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

        {/* Leaderboard — Hero Podium + Table with movement arrows */}
        {boardTab === 'leaderboard' && (<>

        {(() => {
          // Sort agents by category
          const sortByCategory = (agents: AgentLeaderRow[], cat: LeaderCategory): AgentLeaderRow[] => {
            const sorted = [...agents];
            switch (cat) {
              case 'quality':
                sorted.sort((a, b) => {
                  const retA = a.retention_pct ?? -1;
                  const retB = b.retention_pct ?? -1;
                  if (retB !== retA) return retB - retA;
                  return b.active_annual_premium - a.active_annual_premium;
                });
                break;
              case 'production':
                sorted.sort((a, b) => {
                  if (b.active_annual_premium !== a.active_annual_premium)
                    return b.active_annual_premium - a.active_annual_premium;
                  return b.active_policies - a.active_policies;
                });
                break;
              case 'overall': {
                const retRanked = [...agents].sort((a, b) => (b.retention_pct ?? -1) - (a.retention_pct ?? -1));
                const premRanked = [...agents].sort((a, b) => b.active_annual_premium - a.active_annual_premium);
                const polRanked = [...agents].sort((a, b) => b.active_policies - a.active_policies);
                const scoreMap = new Map<string, number>();
                agents.forEach(a => {
                  const retIdx = retRanked.findIndex(r => r.agent_id === a.agent_id);
                  const premIdx = premRanked.findIndex(r => r.agent_id === a.agent_id);
                  const polIdx = polRanked.findIndex(r => r.agent_id === a.agent_id);
                  scoreMap.set(a.agent_id, retIdx * 0.5 + premIdx * 0.3 + polIdx * 0.2);
                });
                sorted.sort((a, b) => (scoreMap.get(a.agent_id) ?? 999) - (scoreMap.get(b.agent_id) ?? 999));
                break;
              }
            }
            sorted.forEach((r, i) => { r.rank = i + 1; });
            return sorted;
          };

          const allRanked = sortByCategory(agentRows, leaderCategory);
          const top3 = allRanked.slice(0, 3);
          const rows4to10 = allRanked.slice(3, 10);
          const agencyLabel = agentRows[0]?.agency_name || agentLeaderAgencyId || 'Agency';

          // Find current user's position (if agent role and not in top 10)
          const myAgentId = profile?.id;
          const myRow = myAgentId ? allRanked.find(r => r.agent_id === myAgentId) : null;
          const showYourPosition = myRow && myRow.rank > 10 && role === 'agent';
          const tenthPlace = allRanked[9] || null;

          const periodLabels: Record<LeaderPeriod, string> = {
            week: 'This Week',
            month: 'This Month',
            year: 'This Year',
          };
          const categoryLabels: Record<LeaderCategory, { label: string; icon: typeof Trophy }> = {
            overall: { label: 'Overall', icon: Trophy },
            quality: { label: 'Quality', icon: ShieldCheck },
            production: { label: 'Production', icon: TrendingUp },
          };

          // Map to podium props (with movement)
          const podiumAgents: PodiumAgent[] = top3.map(a => ({
            agent_id: a.agent_id,
            agent_name: a.agent_name,
            agency_name: a.agency_name,
            active_policies: a.active_policies,
            active_annual_premium: a.active_annual_premium,
            retention_pct: a.retention_pct,
            at_risk_policies: a.at_risk_policies,
            avg_annual_premium: a.avg_annual_premium,
            movement: a.movement,
          }));

          // Map to table rows (with movement)
          const tableRows: LeaderRow[] = rows4to10.map(a => ({
            agent_id: a.agent_id,
            agent_name: a.agent_name,
            agency_name: a.agency_name,
            rank: a.rank,
            active_policies: a.active_policies,
            active_annual_premium: a.active_annual_premium,
            retention_pct: a.retention_pct,
            at_risk_policies: a.at_risk_policies,
            avg_annual_premium: a.avg_annual_premium,
            movement: a.movement,
          }));

          return <>
            {/* Header + Period selector */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Crown size={20} className="text-amber-400" />
                <h2 className="text-lg font-semibold text-foreground">Top 10 — {agencyLabel}</h2>
              </div>
              <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
                {(['week', 'month', 'year'] as LeaderPeriod[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setLeaderPeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      leaderPeriod === p
                        ? 'gradient-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1 w-fit">
              {(['overall', 'quality', 'production'] as LeaderCategory[]).map(cat => {
                const { label, icon: Icon } = categoryLabels[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setLeaderCategory(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      leaderCategory === cat
                        ? 'bg-background text-foreground shadow-sm border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Hero Podium — Top 3 */}
            <HeroPodium agents={podiumAgents} loading={agentLoading} />

            {/* Rows 4–10 */}
            {!agentLoading && rows4to10.length > 0 && (
              <LeaderboardTable
                rows={tableRows}
                showAvgAp={leaderCategory !== 'production'}
                emptyMessage={`No agents produced ${periodLabels[leaderPeriod].toLowerCase()}`}
              />
            )}

            {/* Empty state (no agents at all) */}
            {!agentLoading && allRanked.length === 0 && (
              <div className="rounded-xl border border-border py-16 text-center">
                <Trophy size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">
                  No agents produced {periodLabels[leaderPeriod].toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different period or check back later.
                </p>
              </div>
            )}

            {/* Your Position — sticky bar for agents outside top 10 */}
            {showYourPosition && myRow && tenthPlace && (
              <YourPosition
                rank={myRow.rank}
                agentName={myRow.agent_name}
                policies={myRow.active_policies}
                premium={myRow.active_annual_premium}
                retentionPct={myRow.retention_pct}
                tenthPlacePolicies={tenthPlace.active_policies}
                tenthPlacePremium={tenthPlace.active_annual_premium}
                category={leaderCategory}
              />
            )}
          </>;
        })()}

        </>)}{/* end boardTab === 'leaderboard' */}

        {/* ── Compete tab (Battles + Challenges merged) ── */}
        {boardTab === 'compete' && (
          <div className="space-y-6">
            <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Active Battles', end: battleStats.active, icon: Swords, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { title: 'Active Challenges', end: challengeStats.active, icon: Target, color: 'text-purple-400', bg: 'bg-purple-500/10' },
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

            {/* Battles — ESPN-style matchup cards */}
            <div className="flex items-center gap-2">
              <Swords size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Battles</h3>
            </div>

            {competeLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-64 rounded-lg shimmer" />)}
              </div>
            ) : battles.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-10 text-center">
                  <Swords size={24} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No battles yet.</p>
                  {canCreate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <button onClick={() => setBoardTab('create')} className="text-primary hover:underline">Create one</button> to get started.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {battles.map(battle => {
                  const participants = safeMapGet(battleParticipants, battle.id) || [];
                  return (
                    <BattleMatchup
                      key={battle.id}
                      title={battle.title}
                      description={battle.description}
                      metric={battle.metric}
                      status={battle.status}
                      startDate={battle.start_date}
                      endDate={battle.end_date}
                      participants={participants}
                    />
                  );
                })}
              </div>
            )}

            {/* Hall of Fame */}
            {!competeLoading && (() => {
              // Compute hall of fame data from completed battles
              const winCounts = new Map<string, number>();
              for (const b of battles) {
                if (b.status !== 'completed') continue;
                const parts = safeMapGet(battleParticipants, b.id) || [];
                for (const p of parts) {
                  if (p.is_winner) {
                    winCounts.set(p.display_name, (winCounts.get(p.display_name) || 0) + 1);
                  }
                }
              }
              const topWinners: HallOfFameEntry[] = [...winCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([name, wins]) => ({ displayName: name, value: wins, label: wins === 1 ? 'win' : 'wins' }));

              const completedChallengeCount = new Map<string, number>();
              for (const c of challenges) {
                if (c.status !== 'completed') continue;
                const parts = safeMapGet(challengeParticipants, c.id) || [];
                for (const p of parts) {
                  completedChallengeCount.set(p.display_name, (completedChallengeCount.get(p.display_name) || 0) + 1);
                }
              }
              const topChallenger = [...completedChallengeCount.entries()]
                .sort((a, b) => b[1] - a[1])[0] || null;

              return (
                <HallOfFame
                  topBattleWinners={topWinners}
                  longestStreak={null}
                  mostChallengesCompleted={topChallenger ? {
                    displayName: topChallenger[0],
                    value: topChallenger[1],
                    label: topChallenger[1] === 1 ? 'challenge' : 'challenges',
                  } : null}
                />
              );
            })()}
          {/* ── Challenges section (inside Compete tab) ── */}
            <div className="flex items-center gap-2 pt-4 border-t border-border/30">
              <Target size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Challenges</h3>
            </div>

            {competeLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-48 rounded-lg shimmer" />)}
              </div>
            ) : challenges.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-10 text-center">
                  <Target size={24} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No challenges yet.</p>
                  {canCreate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <button onClick={() => setBoardTab('create')} className="text-primary hover:underline">Create one</button> to get started.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {challenges.map(challenge => {
                  const participants = safeMapGet(challengeParticipants, challenge.id) || [];
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
