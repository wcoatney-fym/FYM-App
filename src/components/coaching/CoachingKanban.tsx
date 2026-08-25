/**
 * CoachingKanban — Agent-focused coaching pipeline board
 *
 * Kanban columns = pipeline stages (Flagged → Assigned → Action Plan → In Progress → Review)
 * Cards = agents with coaching plans, color-coded by flag type:
 *   🟡 Production (amber)  🔴 Quality (red)  🟢 RTS Watch (emerald)
 *
 * Features:
 * - Drag-and-drop between stages (native HTML5)
 * - KPI strip with counts by flag type + overdue
 * - Flag type filter chips
 * - Click card → detail drawer
 * - Assign manager (self-assign on drag to Assigned)
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  RefreshCw, Search, Clock, Users, AlertTriangle, Loader2,
  GripVertical, User, Target,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  ACTIVE_COACHING_STAGES,
  COACHING_STAGE_LABELS,
  COACHING_STAGE_COLORS,
  FLAG_TYPE_COLORS,
  FLAG_TYPE_LABELS,
  daysRemaining,
  type CoachingFlagType,
  type CoachingStage,
  type CoachingCard,
} from '@/lib/coaching/types';
import {
  fetchCoachingPlans,
  advanceCoachingStage,
} from '@/lib/coaching/api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

interface CoachingKanbanProps {
  agencyId?: string;
  onSelectPlan: (planId: string) => void;
  refreshKey?: number;
}

export function CoachingKanban({ agencyId, onSelectPlan, refreshKey }: CoachingKanbanProps) {
  const { profile } = useEffectiveAuth();
  const profileId = profile?.id ?? null;
  const [plans, setPlans] = useState<CoachingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFlag, setFilterFlag] = useState<CoachingFlagType | 'all'>('all');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CoachingStage | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const data = await fetchCoachingPlans({
      agencyId,
      stage: ACTIVE_COACHING_STAGES,
    });
    setPlans(data);
    setLoading(false);
  }, [agencyId]);

  useEffect(() => { loadPlans(); }, [loadPlans, refreshKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPlans();
    setRefreshing(false);
  };

  // Filter + search
  const filtered = useMemo(() => {
    let result = plans;
    if (filterFlag !== 'all') {
      result = result.filter(p => p.active_flag_types.includes(filterFlag));
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p =>
        `${p.agent_first_name} ${p.agent_last_name}`.toLowerCase().includes(q) ||
        p.agent_writing_number?.toLowerCase().includes(q) ||
        p.agent_email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [plans, filterFlag, searchTerm]);

  // Group by stage
  const columns = useMemo(() => {
    const map: Record<CoachingStage, CoachingCard[]> = {} as any;
    for (const stage of ACTIVE_COACHING_STAGES) {
      map[stage] = [];
    }
    for (const plan of filtered) {
      if (map[plan.stage]) {
        map[plan.stage].push(plan);
      }
    }
    // Sort each column: overdue first, then by days remaining
    for (const stage of ACTIVE_COACHING_STAGES) {
      map[stage].sort((a, b) => {
        const da = daysRemaining(a.deadline);
        const db = daysRemaining(b.deadline);
        return da - db; // most urgent first
      });
    }
    return map;
  }, [filtered]);

  // KPI counts
  const kpis = useMemo(() => {
    const active = plans.length;
    const overdue = plans.filter(p => daysRemaining(p.deadline) < 0).length;
    const production = plans.filter(p => p.active_flag_types.includes('production')).length;
    const quality = plans.filter(p => p.active_flag_types.includes('quality')).length;
    const rts = plans.filter(p => p.active_flag_types.includes('rts_watch')).length;
    const unassigned = plans.filter(p => p.stage === 'flagged').length;
    return { active, overdue, production, quality, rts, unassigned };
  }, [plans]);

  // Drag-and-drop handlers
  const handleDrop = async (targetStage: CoachingStage) => {
    if (!dragId || !profileId) return;
    const plan = plans.find(p => p.id === dragId);
    if (!plan || plan.stage === targetStage) {
      setDragId(null);
      setDropTarget(null);
      return;
    }

    // Optimistic update
    setPlans(prev => prev.map(p =>
      p.id === dragId ? { ...p, stage: targetStage } : p
    ));
    setDragId(null);
    setDropTarget(null);

    // Persist
    const result = await advanceCoachingStage(
      dragId,
      targetStage,
      profileId,
    );
    if (!result) {
      // Revert on failure
      await loadPlans();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── KPI Strip ── */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Active', value: kpis.active, icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10', accent: 'hsl(199 89% 48%)' },
          { label: 'Unassigned', value: kpis.unassigned, icon: AlertTriangle, color: kpis.unassigned > 0 ? 'text-amber-400' : 'text-muted-foreground', bg: kpis.unassigned > 0 ? 'bg-amber-500/10' : 'bg-secondary', accent: kpis.unassigned > 0 ? 'hsl(38 92% 50%)' : 'hsl(215 20% 55%)' },
          { label: '🟡 Production', value: kpis.production, icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10', accent: 'hsl(38 92% 50%)' },
          { label: '🔴 Quality', value: kpis.quality, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', accent: 'hsl(0 84% 60%)' },
          { label: 'Overdue', value: kpis.overdue, icon: Clock, color: kpis.overdue > 0 ? 'text-red-400' : 'text-muted-foreground', bg: kpis.overdue > 0 ? 'bg-red-500/10' : 'bg-secondary', accent: kpis.overdue > 0 ? 'hsl(0 84% 60%)' : 'hsl(215 20% 55%)' },
        ].map(kpi => (
          <StaggerItem key={kpi.label}>
            <HudFrame accentColor={kpi.accent}>
              <Card className="border-border">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                      <CountUp end={kpi.value} className="text-xl font-bold font-data text-foreground" />
                    </div>
                    <div className={`p-2 rounded-lg ${kpi.bg}`}>
                      <kpi.icon size={16} className={kpi.color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-8 text-sm bg-card"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'production', 'quality', 'rts_watch'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filterFlag === f ? 'default' : 'outline'}
              onClick={() => setFilterFlag(f)}
              className={`h-7 text-xs ${filterFlag === f ? '' : 'border-border'}`}
            >
              {f === 'all' ? 'All' : f === 'production' ? '🟡 Production' : f === 'quality' ? '🔴 Quality' : '🟢 RTS'}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-7 text-xs border-border ml-auto"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* ── Kanban Board ── */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {ACTIVE_COACHING_STAGES.map(stage => {
          const stageCards = columns[stage] || [];
          const stageColors = COACHING_STAGE_COLORS[stage];
          const isDropping = dropTarget === stage;

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-72 rounded-lg border transition-colors ${
                isDropping ? 'border-primary bg-primary/5' : 'border-border bg-card/50'
              }`}
              onDragOver={e => {
                e.preventDefault();
                setDropTarget(stage);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={e => {
                e.preventDefault();
                handleDrop(stage);
              }}
            >
              {/* Column header */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stageColors.dot}`} />
                    <span className="text-sm font-medium text-foreground">
                      {COACHING_STAGE_LABELS[stage]}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                    {stageCards.length}
                  </Badge>
                </div>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto">
                {stageCards.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8 italic">
                    No agents
                  </p>
                )}
                {stageCards.map(plan => (
                  <CoachingCardItem
                    key={plan.id}
                    plan={plan}
                    onSelect={() => onSelectPlan(plan.id)}
                    onDragStart={() => setDragId(plan.id)}
                    onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Card Item ────────────────────────────────────────────────────────────────

function CoachingCardItem({
  plan,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  plan: CoachingCard;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  // Multi-flag: use the first active flag for card border color, show all flags as badges
  const activeFlags = plan.active_flag_types.length > 0 ? plan.active_flag_types : (plan.flag_type ? [plan.flag_type] : []);
  const primaryFlagType = activeFlags[0] || 'production';
  const flagColors = FLAG_TYPE_COLORS[primaryFlagType];
  const days = daysRemaining(plan.deadline);
  const isOverdue = days < 0;
  const progress = plan.requirements_total > 0
    ? Math.round((plan.requirements_completed / plan.requirements_total) * 100)
    : 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`rounded-lg border p-3 cursor-pointer hover:border-primary/40 transition-colors ${flagColors.border} ${flagColors.bg}`}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onSelect(); }}
    >
      {/* Top row: name + flag badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical size={12} className="text-muted-foreground shrink-0 cursor-grab" />
          <span className="text-sm font-medium text-foreground truncate">
            {plan.agent_first_name} {plan.agent_last_name}
          </span>
        </div>
        <div className="flex gap-1 shrink-0">
          {activeFlags.map(ft => (
            <Badge key={ft} variant="outline" className={`text-[10px] ${FLAG_TYPE_COLORS[ft].badge}`}>
              {FLAG_TYPE_COLORS[ft].icon} {FLAG_TYPE_LABELS[ft]}
            </Badge>
          ))}
        </div>
      </div>

      {/* Writing number */}
      {plan.agent_writing_number && (
        <p className="text-[11px] text-muted-foreground mb-2 font-mono">
          WN: {plan.agent_writing_number}
        </p>
      )}

      {/* Progress bar (if requirements exist) */}
      {plan.requirements_total > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{plan.requirements_completed}/{plan.requirements_total} complete</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress === 100 ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom row: deadline + assigned */}
      <div className="flex items-center justify-between text-[10px]">
        <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
          <Clock size={10} />
          {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </span>
        {plan.assigned_to_name ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <User size={10} />
            {plan.assigned_to_name.split(' ')[0]}
          </span>
        ) : (
          <span className="text-amber-400 italic">Unassigned</span>
        )}
      </div>

      {/* Notes count */}
      {plan.notes_count > 0 && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          💬 {plan.notes_count} note{plan.notes_count !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
