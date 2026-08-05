/**
 * GoalPage — Personal goal setting & pacing for agents (P4)
 *
 * Features:
 * - Set / edit monthly AP goal
 * - Progress bar showing MTD AP vs goal
 * - Pacing calculation: required AP per remaining business day
 * - Year-end projection at current pace
 * - Monthly goal history table for the year
 *
 * Data: agent_goals table (FYM App DB) + prod-data edge fn
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { fetchAgentProduction, fetchMonthlyProduction, type AgentProduction, type MonthlyProduction } from '@/lib/prod-api';
import { getGoal, getYearGoals, upsertGoal, type AgentGoal } from '@/lib/goals-api';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Calendar,
  Edit3,
  Check,
  X,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fmt$ as fmtCurrency, fmtPct } from '@/lib/formatUtils';

// ── Helpers ────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getBusinessDaysInMonth(year: number, month: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based here
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function getBusinessDaysRemaining(year: number, month: number): number {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  if (year !== todayYear || month !== todayMonth) {
    // Future or past month — return full BD count or 0
    if (year > todayYear || (year === todayYear && month > todayMonth)) {
      return getBusinessDaysInMonth(year, month);
    }
    return 0;
  }
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDate = today.getDate();
  for (let d = todayDate + 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function getBusinessDaysElapsed(year: number, month: number): number {
  return getBusinessDaysInMonth(year, month) - getBusinessDaysRemaining(year, month);
}

type PaceStatus = 'on_track' | 'catch_up' | 'behind' | 'no_goal';

function getPaceStatus(pct: number): PaceStatus {
  if (pct >= 90) return 'on_track';
  if (pct >= 60) return 'catch_up';
  return 'behind';
}

const paceConfig: Record<PaceStatus, { label: string; color: string; bg: string; icon: typeof TrendingUp }> = {
  on_track: { label: 'On Track', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: TrendingUp },
  catch_up: { label: 'Catch Up', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
  behind: { label: 'Behind', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: TrendingDown },
  no_goal: { label: 'No Goal Set', color: 'text-muted-foreground', bg: 'bg-secondary/20 border-border', icon: Target },
};

// ── Component ──────────────────────────────────────────────────────────

export function GoalPage() {
  const { user, effectiveWritingNumber, effectiveAgencyWritingNumber } = useEffectiveAuth();
  const { toast } = useToast();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [currentGoal, setCurrentGoal] = useState<AgentGoal | null>(null);
  const [yearGoals, setYearGoals] = useState<AgentGoal[]>([]);
  const [saving, setSaving] = useState(false);

  // Edit state — supports editing any month via calendar cells
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editingMonth, setEditingMonth] = useState<number>(currentMonth);

  const userId = user?.id ?? '';

  // Cached fetch for Max's DB data — instant render from localStorage
  const prodCacheKey = `goal-page-${effectiveWritingNumber || 'none'}`;
  const { data: cached, loading: cacheLoading, refresh: refreshProd } = useCachedMultiFetch(
    prodCacheKey,
    {
      agentData: () => fetchAgentProduction({ agent_id: effectiveWritingNumber! }),
      monthly: () => fetchMonthlyProduction({ agent_id: effectiveWritingNumber! }),
    },
    { skip: !effectiveWritingNumber, deps: [effectiveWritingNumber] }
  );

  const stats = useMemo((): AgentProduction | null => {
    if (!cached?.agentData) return null;
    return (cached.agentData as AgentProduction[]).find(
      a => a.writing_number === effectiveWritingNumber || a.agent_id === effectiveWritingNumber
    ) || null;
  }, [cached?.agentData, effectiveWritingNumber]);
  const monthlyData = (cached?.monthly || []) as MonthlyProduction[];
  const loading = cacheLoading;

  // Goal data from local Supabase (not Max's DB)
  const loadGoals = useCallback(async () => {
    if (!userId) return;
    try {
      const [goal, goals] = await Promise.all([
        getGoal(userId, currentMonth, currentYear),
        getYearGoals(userId, currentYear),
      ]);
      setCurrentGoal(goal);
      setYearGoals(goals);
    } catch (err) {
      console.error('[GoalPage] goal load error:', err);
    }
  }, [userId, currentMonth, currentYear]);

  const loadData = useCallback(async () => {
    await loadGoals();
    refreshProd();
  }, [loadGoals, refreshProd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived values ──
  const mtdAP = stats?.ap_this_month ?? 0;
  const targetAP = currentGoal?.target_ap ?? 0;
  const goalPct = targetAP > 0 ? Math.min(100, (mtdAP / targetAP) * 100) : 0;
  const bdTotal = getBusinessDaysInMonth(currentYear, currentMonth);
  const bdRemaining = getBusinessDaysRemaining(currentYear, currentMonth);
  const bdElapsed = getBusinessDaysElapsed(currentYear, currentMonth);
  const expectedPacePct = bdTotal > 0 ? (bdElapsed / bdTotal) * 100 : 0;
  const paceStatus: PaceStatus = targetAP > 0 ? getPaceStatus((goalPct / expectedPacePct) * 100) : 'no_goal';
  const pace = paceConfig[paceStatus];
  const PaceIcon = pace.icon;

  const remainingAP = Math.max(0, targetAP - mtdAP);
  const requiredPerBD = bdRemaining > 0 ? remainingAP / bdRemaining : 0;

  // Year-end projection: average monthly AP × 12
  const yearProjection = useMemo(() => {
    if (!monthlyData.length) return null;
    const sorted = [...monthlyData].sort((a, b) => a.month.localeCompare(b.month));
    // Use last 3 months average or all available
    const recent = sorted.slice(-3);
    const avgMonthly = recent.reduce((sum, m) => sum + m.annual_premium, 0) / recent.length;
    return {
      projected: avgMonthly * 12,
      avgMonthly,
      monthsUsed: recent.length,
    };
  }, [monthlyData]);

  const yearlyGoalTotal = useMemo(() => {
    return yearGoals.reduce((sum, g) => sum + g.target_ap, 0);
  }, [yearGoals]);

  // ── Projection confidence ──
  const projectionConfidence = useMemo(() => {
    const months = yearProjection?.monthsUsed ?? 0;
    if (months >= 6) return { label: 'High', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (months >= 3) return { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { label: 'Low', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
  }, [yearProjection?.monthsUsed]);

  // ── Handlers ──
  const handleSaveGoal = async () => {
    if (!userId || !effectiveWritingNumber) return;
    const val = parseFloat(editValue.replace(/[$,]/g, ''));
    if (isNaN(val) || val <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive dollar amount.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const goal = await upsertGoal({
        user_id: userId,
        writing_number: effectiveWritingNumber,
        agency_id: effectiveAgencyWritingNumber,
        month: editingMonth,
        year: currentYear,
        target_ap: val,
      });
      if (editingMonth === currentMonth) setCurrentGoal(goal);
      setEditing(false);
      toast({ title: 'Goal saved', description: `${MONTH_NAMES[editingMonth - 1]} goal set to ${fmtCurrency(val)}` });
      // Refresh year goals
      const goals = await getYearGoals(userId, currentYear);
      setYearGoals(goals);
    } catch (err) {
      toast({ title: 'Error saving goal', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (month?: number) => {
    const targetMonth = month ?? currentMonth;
    setEditingMonth(targetMonth);
    const existingGoal = targetMonth === currentMonth
      ? currentGoal
      : yearGoals.find(g => g.month === targetMonth) ?? null;
    setEditValue(existingGoal ? String(existingGoal.target_ap) : '');
    setEditing(true);
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <>
        <Header title="My Goal" />
        <div className="p-6 space-y-5 max-w-screen-xl mx-auto">
          {/* Page header skeleton */}
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>

          {/* Hero card skeleton */}
          <Skeleton className="h-[220px] w-full rounded-xl" />

          {/* Projection card skeleton */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="w-7 h-7 rounded-lg" />
                <div>
                  <Skeleton className="h-4 w-36 mb-1" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i}>
                    <Skeleton className="h-2.5 w-16 mb-2" />
                    <Skeleton className="h-6 w-20 mb-1" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Calendar grid skeleton */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="My Goal" />
      <div className="p-6 space-y-5 max-w-screen-xl mx-auto">
        <StaggerContainer>

          {/* ── Page header ── */}
          <StaggerItem>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">
                  {MONTH_NAMES[currentMonth - 1]} {currentYear} Goal
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bdElapsed} of {bdTotal} business days elapsed · {bdRemaining} remaining
                </p>
              </div>
              {!editing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEditing()}
                  className="gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {currentGoal ? 'Edit Goal' : 'Set Goal'}
                </Button>
              )}
            </div>
          </StaggerItem>

          {/* ── Goal Hero Card ── */}
          <StaggerItem>
            {editing ? (
              <Card className="border-primary/30">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-sm text-foreground">
                      Set your {MONTH_NAMES[editingMonth - 1]} AP goal
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="40,000"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveGoal(); if (e.key === 'Escape') setEditing(false); }}
                        className="pl-7 text-lg font-bold tabular-nums"
                        autoFocus
                      />
                    </div>
                    <Button onClick={handleSaveGoal} disabled={saving} size="sm" className="gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {currentGoal && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Current goal: {fmtCurrency(currentGoal.target_ap)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : currentGoal ? (
              <Card className="bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.8)] border-primary/30 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
                <CardContent className="pt-5 pb-5 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                      {MONTH_NAMES[currentMonth - 1]} AP Goal
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${pace.bg} ${pace.color}`}>
                      <PaceIcon className="w-2.5 h-2.5 mr-1" />
                      {pace.label}
                    </Badge>
                  </div>

                  {/* Progress: MTD vs Goal */}
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
                      {fmtCurrency(mtdAP)}
                    </span>
                    <span className="text-sm text-white/60">
                      of {fmtCurrency(targetAP)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 mb-2">
                    <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
                      <span>
                        <strong className="text-white font-bold">{fmtPct(goalPct)}</strong> of goal
                      </span>
                      <span className="tabular-nums">
                        {bdRemaining > 0
                          ? `${fmtCurrency(requiredPerBD)}/BD to finish`
                          : 'Month complete'}
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-white/15 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${Math.min(100, goalPct)}%`,
                          background: goalPct >= expectedPacePct
                            ? 'linear-gradient(90deg, #86EFAC, #4ADE80)'
                            : goalPct >= expectedPacePct * 0.7
                              ? 'linear-gradient(90deg, #FDE68A, #F59E0B)'
                              : 'linear-gradient(90deg, #FCA5A5, #EF4444)',
                        }}
                      />
                    </div>
                    {/* Expected pace marker */}
                    <div className="relative mt-1">
                      <div
                        className="absolute -top-1 w-0.5 h-2 bg-white/40 rounded"
                        style={{ left: `${Math.min(100, expectedPacePct)}%` }}
                      />
                      <div
                        className="absolute top-1.5 text-[9px] text-white/40 font-semibold"
                        style={{ left: `${Math.min(95, expectedPacePct)}%`, transform: 'translateX(-50%)' }}
                      >
                        Expected
                      </div>
                    </div>
                  </div>

                  {/* Gap / surplus */}
                  <div className="flex items-center gap-4 mt-5 pt-3 border-t border-white/10">
                    <div className="flex-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Remaining</p>
                      <p className="text-base font-bold text-white tabular-nums mt-0.5">
                        {fmtCurrency(remainingAP)}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Required Pace</p>
                      <p className="text-base font-bold text-white tabular-nums mt-0.5">
                        {bdRemaining > 0
                          ? `${fmtCurrency(requiredPerBD)}/BD`
                          : '—'}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">BD Left</p>
                      <p className="text-base font-bold text-white tabular-nums mt-0.5">
                        {bdRemaining}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* No goal set — prompt */
              <Card className="border-dashed border-2 border-primary/20">
                <CardContent className="pt-8 pb-8 text-center">
                  <Target className="w-10 h-10 text-primary/30 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    No goal set for {MONTH_NAMES[currentMonth - 1]}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
                    Set a monthly AP target to track your pacing, see your required daily production, and project your year-end numbers.
                  </p>
                  <Button onClick={() => startEditing()} size="sm" className="gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    Set My Goal
                  </Button>
                </CardContent>
              </Card>
            )}
          </StaggerItem>

          {/* ── Year-End Projection Card ── */}
          {yearProjection && (
            <StaggerItem>
              <HudFrame accentColor="hsl(199 89% 48% / 0.4)">
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Year-End Projection</p>
                        <p className="text-[10px] text-muted-foreground">
                          Based on {yearProjection.monthsUsed}-month average
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${projectionConfidence.bg} ${projectionConfidence.color} gap-1`}
                      title={`Confidence based on ${yearProjection.monthsUsed} month(s) of data. 6+ = High, 3-5 = Medium, 1-2 = Low.`}
                    >
                      <Info className="w-2.5 h-2.5" />
                      {projectionConfidence.label} Confidence
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Projected</p>
                      <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">
                        {fmtCurrency(yearProjection.projected)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        at {fmtCurrency(yearProjection.avgMonthly)}/mo avg
                      </p>
                    </div>
                    {yearlyGoalTotal > 0 && (
                      <>
                        <div>
                          <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Yearly Goal</p>
                          <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">
                            {fmtCurrency(yearlyGoalTotal)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {yearGoals.length} months set
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Gap</p>
                          {(() => {
                            const gap = yearProjection.projected - yearlyGoalTotal;
                            const isPositive = gap >= 0;
                            return (
                              <>
                                <p className={`text-xl font-bold tabular-nums mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {isPositive ? '+' : ''}{fmtCurrency(gap)}
                                </p>
                                <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  {isPositive
                                    ? <><ArrowUp className="w-2.5 h-2.5 text-emerald-400" /> On pace</>
                                    : <><ArrowDown className="w-2.5 h-2.5 text-red-400" /> Below target</>
                                  }
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
              </HudFrame>
            </StaggerItem>
          )}

          {/* ── Monthly Goals Table ── */}
          <StaggerItem>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">{currentYear} Monthly Goals</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearGoals.length} of 12 months set
                  </p>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {MONTH_NAMES.map((name, idx) => {
                    const monthNum = idx + 1;
                    const goal = yearGoals.find(g => g.month === monthNum);
                    const isCurrent = monthNum === currentMonth;
                    const isPast = monthNum < currentMonth;
                    const isClickable = !isPast || isCurrent;

                    return (
                      <div
                        key={name}
                        role={isClickable ? 'button' : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onClick={isClickable ? () => startEditing(monthNum) : undefined}
                        onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEditing(monthNum); } } : undefined}
                        className={`
                          rounded-lg p-2.5 border text-center transition-all
                          ${isCurrent
                            ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                            : goal
                              ? 'border-border bg-secondary/10'
                              : 'border-dashed border-border/50 bg-transparent'
                          }
                          ${isPast && !isCurrent ? 'opacity-40 cursor-default' : 'cursor-pointer hover:border-primary/40 hover:bg-primary/5'}
                        `}
                      >
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                          {name}
                        </p>
                        {goal ? (
                          <p className="text-sm font-bold tabular-nums text-foreground mt-1">
                            {fmtCurrency(goal.target_ap)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">
                            {isClickable ? '+ Set' : '—'}
                          </p>
                        )}
                        {isCurrent && goal && (
                          <div className="mt-1.5">
                            <div className="w-full h-1 rounded-full bg-primary/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(100, goalPct)}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-primary font-semibold mt-0.5 tabular-nums">
                              {fmtPct(goalPct)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

        </StaggerContainer>
      </div>
    </>
  );
}
