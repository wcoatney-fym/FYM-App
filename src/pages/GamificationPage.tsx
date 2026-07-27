/**
 * Compete & Conquer — Agent Gamification Dashboard
 *
 * Battles: head-to-head or agency-vs-agency competitions on raw metrics.
 * Challenges: org-wide or agency-specific time-boxed goals.
 * No XP/tiers/badges — this tracks policies written, AP, and retention % directly.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StaggerContainer, StaggerItem, CountUp, RadialGauge } from '@/components/ui/animated';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { GamificationMetric, BattleType, ChallengeType } from '@/lib/database.types';
import {
  Swords, Target, Trophy, Users, Percent,
  Calendar, Clock, Crown, Plus, CheckCircle2, XCircle,
  FileText, DollarSign, ShieldCheck,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
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
  tracker_id: string;
  name: string;
}

type MainTab = 'battles' | 'challenges' | 'create';

// ── Helpers ────────────────────────────────────────────────────────────────
function metricLabel(m: GamificationMetric) {
  switch (m) {
    case 'policies': return 'Policies Written';
    case 'ap': return 'Annual Premium';
    case 'retention': return 'Retention %';
  }
}

function metricIcon(m: GamificationMetric) {
  switch (m) {
    case 'policies': return FileText;
    case 'ap': return DollarSign;
    case 'retention': return ShieldCheck;
  }
}

function fmtValue(v: number, m: GamificationMetric) {
  if (m === 'ap') {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
    return `$${Math.round(v).toLocaleString()}`;
  }
  if (m === 'retention') return `${v.toFixed(1)}%`;
  return v.toLocaleString();
}

function statusBadge(status: 'upcoming' | 'active' | 'completed') {
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

function daysRemaining(endDate: string): number {
  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function dateRange(start: string, end: string) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

async function fetchAllRows<T>(table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  if (!supabase) return [];
  const PAGE = 100;
  let offset = 0;
  let done = false;
  const rows: T[] = [];

  while (!done) {
    let q = (supabase as any).from(table).select(select).range(offset, offset + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) { done = true; break; }
    rows.push(...(data as T[]));
    if (data.length < PAGE) done = true;
    else offset += PAGE;
  }
  return rows;
}

// ── Component ──────────────────────────────────────────────────────────────
export function GamificationPage() {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const canCreate = role === 'admin' || role === 'manager';

  const [tab, setTab] = useState<MainTab>('battles');
  const [loading, setLoading] = useState(true);

  const [battles, setBattles] = useState<Battle[]>([]);
  const [battleParticipants, setBattleParticipants] = useState<Map<string, BattleParticipant[]>>(new Map());

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeParticipants, setChallengeParticipants] = useState<Map<string, ChallengeParticipant[]>>(new Map());

  const [agencies, setAgencies] = useState<AgencyOption[]>([]);

  // ── Create Battle form state ──
  const [battleTitle, setBattleTitle] = useState('');
  const [battleDesc, setBattleDesc] = useState('');
  const [battleType, setBattleType] = useState<BattleType>('agent_vs_agent');
  const [battleMetric, setBattleMetric] = useState<GamificationMetric>('policies');
  const [battleStart, setBattleStart] = useState('');
  const [battleEnd, setBattleEnd] = useState('');
  const [battleSubmitting, setBattleSubmitting] = useState(false);

  // ── Create Challenge form state ──
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDesc, setChallengeDesc] = useState('');
  const [challengeType, setChallengeType] = useState<ChallengeType>('org_wide');
  const [challengeAgencyId, setChallengeAgencyId] = useState('');
  const [challengeMetric, setChallengeMetric] = useState<GamificationMetric>('policies');
  const [challengeGoal, setChallengeGoal] = useState('');
  const [challengeStart, setChallengeStart] = useState('');
  const [challengeEnd, setChallengeEnd] = useState('');
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);

    const [battleRows, challengeRows, agencyRows] = await Promise.all([
      fetchAllRows<Battle>('battles', '*', (q) => q.order('created_at', { ascending: false })),
      fetchAllRows<Challenge>('challenges', '*', (q) => q.order('created_at', { ascending: false })),
      fetchAllRows<AgencyOption>('agencies', 'tracker_id, name'),
    ]);

    setBattles(battleRows);
    setChallenges(challengeRows);
    setAgencies(agencyRows.filter(a => a.tracker_id));

    // Load participants for each battle
    if (battleRows.length > 0) {
      const bpMap = new Map<string, BattleParticipant[]>();
      const allBp = await fetchAllRows<BattleParticipant>(
        'battle_participants', '*',
        (q) => q.in('battle_id', battleRows.map(b => b.id))
      );
      for (const bp of allBp) {
        const list = bpMap.get(bp.battle_id) || [];
        list.push(bp);
        bpMap.set(bp.battle_id, list);
      }
      // sort each list by current_value desc
      for (const [k, list] of bpMap) {
        list.sort((a, b) => b.current_value - a.current_value);
        bpMap.set(k, list);
      }
      setBattleParticipants(bpMap);
    } else {
      setBattleParticipants(new Map());
    }

    // Load participants for each challenge
    if (challengeRows.length > 0) {
      const cpMap = new Map<string, ChallengeParticipant[]>();
      const allCp = await fetchAllRows<ChallengeParticipant>(
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

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Battle stats ──
  const battleStats = useMemo(() => {
    const active = battles.filter(b => b.status === 'active').length;
    const completed = battles.filter(b => b.status === 'completed').length;
    let totalParticipants = 0;
    for (const list of battleParticipants.values()) totalParticipants += list.length;

    // Win rate for current user
    let won = 0;
    let completedForUser = 0;
    if (profile) {
      for (const b of battles) {
        if (b.status !== 'completed') continue;
        const parts = battleParticipants.get(b.id) || [];
        const mine = parts.find(p => p.agent_id === profile.id || p.agency_id === profile.agency_id);
        if (mine) {
          completedForUser += 1;
          if (mine.is_winner) won += 1;
        }
      }
    }
    const winRate = completedForUser > 0 ? Math.round((won / completedForUser) * 100) : 0;

    return { active, completed, totalParticipants, winRate };
  }, [battles, battleParticipants, profile]);

  // ── Challenge stats ──
  const challengeStats = useMemo(() => {
    const active = challenges.filter(c => c.status === 'active').length;
    const completed = challenges.filter(c => c.status === 'completed').length;
    const achieved = challenges.filter(c => c.is_achieved).length;
    const achievementRate = completed > 0 ? Math.round((achieved / completed) * 100) : 0;
    return { active, completed, achieved, achievementRate };
  }, [challenges]);

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
      await loadData();
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
    setChallengeSubmitting(true);
    try {
      const { error } = await (supabase as any).from('challenges').insert({
        title: challengeTitle.trim(),
        description: challengeDesc.trim() || null,
        challenge_type: challengeType,
        target_agency_id: challengeType === 'agency' ? (challengeAgencyId || null) : null,
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
      await loadData();
    } catch (err: any) {
      toast({ title: 'Failed to create challenge', description: err.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setChallengeSubmitting(false);
    }
  }

  const tabs: { key: MainTab; label: string; icon: React.ElementType }[] = [
    { key: 'battles', label: 'Active Battles', icon: Swords },
    { key: 'challenges', label: 'Active Challenges', icon: Target },
    ...(canCreate ? [{ key: 'create' as MainTab, label: 'Create New', icon: Plus }] : []),
  ];

  return (
    <div>
      <Header title="Compete & Conquer" />
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Swords size={20} className="text-primary" />
            Compete &amp; Conquer
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Head-to-head battles and time-boxed challenges on the metrics that matter — policies written, annual premium, and retention.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-2 border-b border-border/30 pb-0">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Active Battles tab ── */}
        {tab === 'battles' && (
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
                      {loading ? (
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

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-64 rounded-lg shimmer" />)}
              </div>
            ) : battles.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-16 text-center">
                  <Swords size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No battles yet.</p>
                  {canCreate && (
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Head to <button onClick={() => setTab('create')} className="text-primary hover:underline">Create New</button> to start one.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {battles.map(battle => {
                  const participants = battleParticipants.get(battle.id) || [];
                  const maxValue = Math.max(1, ...participants.map(p => p.current_value));
                  const MetricIcon = metricIcon(battle.metric);
                  const winner = participants.find(p => p.is_winner);

                  return (
                    <Card key={battle.id} className="border-border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                              {battle.title}
                            </CardTitle>
                            {battle.description && (
                              <p className="text-xs text-muted-foreground mt-1">{battle.description}</p>
                            )}
                          </div>
                          {statusBadge(battle.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground/80 mt-2">
                          <span className="flex items-center gap-1">
                            <MetricIcon size={12} />
                            {metricLabel(battle.metric)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {dateRange(battle.start_date, battle.end_date)}
                          </span>
                          {battle.status === 'active' && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Clock size={12} />
                              {daysRemaining(battle.end_date)}d left
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        {participants.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 py-4 text-center">No participants added yet.</p>
                        ) : (
                          participants.map(p => (
                            <div key={p.id}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className={`font-medium truncate flex items-center gap-1.5 ${
                                  battle.status === 'completed' && p.is_winner ? 'text-amber-400' : 'text-foreground'
                                }`}>
                                  {battle.status === 'completed' && p.is_winner && <Trophy size={12} className="text-amber-400" />}
                                  {p.display_name}
                                </span>
                                <span className="font-data text-muted-foreground">
                                  {fmtValue(p.current_value, battle.metric)}
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-secondary/50 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    battle.status === 'completed' && p.is_winner ? 'bg-amber-400' : 'gradient-primary'
                                  }`}
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

        {/* ── Active Challenges tab ── */}
        {tab === 'challenges' && (
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
                      {loading ? (
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

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-72 rounded-lg shimmer" />)}
              </div>
            ) : challenges.length === 0 ? (
              <Card className="border-border">
                <CardContent className="py-16 text-center">
                  <Target size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No challenges yet.</p>
                  {canCreate && (
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Head to <button onClick={() => setTab('create')} className="text-primary hover:underline">Create New</button> to set one up.
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
                  const MetricIcon = metricIcon(challenge.metric);

                  return (
                    <Card key={challenge.id} className="border-border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base font-semibold text-foreground">
                              {challenge.title}
                            </CardTitle>
                            {challenge.description && (
                              <p className="text-xs text-muted-foreground mt-1">{challenge.description}</p>
                            )}
                          </div>
                          {statusBadge(challenge.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground/80 mt-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <MetricIcon size={12} />
                            {metricLabel(challenge.metric)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {dateRange(challenge.start_date, challenge.end_date)}
                          </span>
                          <span className="uppercase tracking-wide text-[10px] text-muted-foreground/60">
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
                                {fmtValue(challenge.current_value, challenge.metric)} / {fmtValue(challenge.goal_value, challenge.metric)}
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
                                    <span className="text-muted-foreground/50 font-data w-4">{i + 1}.</span>
                                    {p.display_name}
                                  </span>
                                  <span className="font-data text-muted-foreground">
                                    {fmtValue(p.contribution, challenge.metric)}
                                  </span>
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
        {tab === 'create' && canCreate && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Battle */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Swords size={18} className="text-primary" />
                  Create Battle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateBattle} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                    <Input
                      required
                      placeholder="Q3 Policy Sprint"
                      value={battleTitle}
                      onChange={e => setBattleTitle(e.target.value)}
                      className="bg-card"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                    <Textarea
                      placeholder="Optional context for participants"
                      value={battleDesc}
                      onChange={e => setBattleDesc(e.target.value)}
                      className="bg-card"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Battle Type</label>
                      <div className="flex gap-2">
                        {([
                          ['agent_vs_agent', 'Agent'],
                          ['agency_vs_agency', 'Agency'],
                        ] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setBattleType(val)}
                            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              battleType === val
                                ? 'gradient-primary text-primary-foreground border-primary/30'
                                : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Metric</label>
                      <select
                        value={battleMetric}
                        onChange={e => setBattleMetric(e.target.value as GamificationMetric)}
                        className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-sm text-foreground"
                      >
                        <option value="policies">Policies Written</option>
                        <option value="ap">Annual Premium</option>
                        <option value="retention">Retention %</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label>
                      <Input
                        required
                        type="date"
                        value={battleStart}
                        onChange={e => setBattleStart(e.target.value)}
                        className="bg-card"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
                      <Input
                        required
                        type="date"
                        value={battleEnd}
                        onChange={e => setBattleEnd(e.target.value)}
                        className="bg-card"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={battleSubmitting}
                    className="w-full bg-primary hover:bg-primary/80 text-white"
                  >
                    {battleSubmitting ? 'Creating…' : 'Create Battle'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Create Challenge */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Target size={18} className="text-primary" />
                  Create Challenge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateChallenge} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                    <Input
                      required
                      placeholder="August Retention Push"
                      value={challengeTitle}
                      onChange={e => setChallengeTitle(e.target.value)}
                      className="bg-card"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                    <Textarea
                      placeholder="Optional context for participants"
                      value={challengeDesc}
                      onChange={e => setChallengeDesc(e.target.value)}
                      className="bg-card"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Challenge Type</label>
                      <div className="flex gap-2">
                        {([
                          ['org_wide', 'Org-Wide'],
                          ['agency', 'Agency'],
                        ] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setChallengeType(val)}
                            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              challengeType === val
                                ? 'gradient-primary text-primary-foreground border-primary/30'
                                : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Metric</label>
                      <select
                        value={challengeMetric}
                        onChange={e => setChallengeMetric(e.target.value as GamificationMetric)}
                        className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-sm text-foreground"
                      >
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
                        value={challengeAgencyId}
                        onChange={e => setChallengeAgencyId(e.target.value)}
                        className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-sm text-foreground"
                      >
                        <option value="">Select an agency…</option>
                        {agencies.map(a => (
                          <option key={a.tracker_id} value={a.tracker_id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Goal Value *</label>
                    <Input
                      required
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 50"
                      value={challengeGoal}
                      onChange={e => setChallengeGoal(e.target.value)}
                      className="bg-card font-data"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label>
                      <Input
                        required
                        type="date"
                        value={challengeStart}
                        onChange={e => setChallengeStart(e.target.value)}
                        className="bg-card"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
                      <Input
                        required
                        type="date"
                        value={challengeEnd}
                        onChange={e => setChallengeEnd(e.target.value)}
                        className="bg-card"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={challengeSubmitting}
                    className="w-full bg-primary hover:bg-primary/80 text-white"
                  >
                    {challengeSubmitting ? 'Creating…' : 'Create Challenge'}
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
