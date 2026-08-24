/**
 * AgentCoachingPlanView — Agent-facing view of their coaching plans
 *
 * Shows the agent's active coaching plans with:
 * - Flag type badge + deadline countdown
 * - Action plan checklist with completion status
 * - Progress bar
 * - Expandable detail: notes from manager + stage history timeline
 * - "Why you were flagged" trigger context
 * - Target metrics to resolve
 *
 * Read-only for agents — managers modify via the CoachingPlanDrawer.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Target, CheckCircle2, AlertTriangle, Loader2,
  ListChecks, ChevronDown, ChevronUp, MessageSquare,
  History,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { supabase } from '@/lib/supabase';
import {
  FLAG_TYPE_COLORS,
  FLAG_TYPE_LABELS,
  COACHING_STAGE_LABELS,
  COACHING_STAGE_COLORS,
  REQUIREMENT_TYPE_ICONS,
  daysRemaining,
  type CoachingCard,
  type CoachingNote,
  type CoachingStageHistoryEntry,
} from '@/lib/coaching/types';
import {
  fetchCoachingPlans,
  fetchCoachingNotes,
  fetchStageHistory,
} from '@/lib/coaching/api';

export function AgentCoachingPlanView() {
  const { effectiveAgencyId, effectiveWritingNumber } = useEffectiveAuth();
  const [plans, setPlans] = useState<CoachingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterAgentId, setRosterAgentId] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  // Resolve writing number → roster agent ID
  useEffect(() => {
    if (!supabase || !effectiveWritingNumber || !effectiveAgencyId) return;
    supabase
      .from('agency_rosters')
      .select('id')
      .eq('agency_id', effectiveAgencyId)
      .eq('unl_writing_number', effectiveWritingNumber)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        setRosterAgentId(data?.id ?? null);
      });
  }, [effectiveWritingNumber, effectiveAgencyId]);

  const loadPlans = useCallback(async () => {
    if (!rosterAgentId) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchCoachingPlans({
      rosterAgentId,
    });
    // Show active plans only (not resolved/escalated) — but also show recently resolved (last 30d)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    setPlans(data.filter(p => {
      if (!['resolved', 'escalated'].includes(p.stage)) return true;
      // Show resolved/escalated if within last 30 days
      const resolvedDate = p.resolved_at || p.escalated_at;
      return resolvedDate && new Date(resolvedDate) >= thirtyDaysAgo;
    }));
    setLoading(false);
  }, [rosterAgentId]);

  useEffect(() => {
    if (rosterAgentId) loadPlans();
  }, [rosterAgentId, loadPlans]);

  const toggleExpand = (planId: string) => {
    setExpandedPlanId(prev => prev === planId ? null : planId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center">
          <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">No Active Coaching Plans</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You're in good standing — no coaching flags at this time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {plans.map(plan => {
        const isExpanded = expandedPlanId === plan.id;
        const isTerminal = plan.stage === 'resolved' || plan.stage === 'escalated';

        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            isExpanded={isExpanded}
            isTerminal={isTerminal}
            onToggle={() => toggleExpand(plan.id)}
          />
        );
      })}
    </div>
  );
}

// ── Individual Plan Card ──────────────────────────────────────────────────

function PlanCard({
  plan,
  isExpanded,
  isTerminal,
  onToggle,
}: {
  plan: CoachingCard;
  isExpanded: boolean;
  isTerminal: boolean;
  onToggle: () => void;
}) {
  const flagColors = FLAG_TYPE_COLORS[plan.flag_type];
  const days = daysRemaining(plan.deadline);
  const isOverdue = days < 0;
  const progress = plan.requirements_total > 0
    ? Math.round((plan.requirements_completed / plan.requirements_total) * 100)
    : 0;

  return (
    <Card className={`border ${isTerminal ? 'border-border opacity-75' : flagColors.border}`}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-xs ${flagColors.badge}`}>
                {flagColors.icon} {FLAG_TYPE_LABELS[plan.flag_type]}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${COACHING_STAGE_COLORS[plan.stage].badge}`}>
                {COACHING_STAGE_LABELS[plan.stage]}
              </Badge>
              {isTerminal && (
                <Badge variant="outline" className="text-[10px] bg-secondary text-muted-foreground border-border">
                  {plan.stage === 'resolved' ? '✅ Complete' : '⚠️ Escalated'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {plan.flag_type === 'production' && 'Your production is below the required threshold.'}
              {plan.flag_type === 'quality' && 'Your at-risk or terminated policy percentage is too high.'}
              {plan.flag_type === 'rts_watch' && 'You\'ve been moved to RTS — this is your observation period.'}
            </p>
          </div>
          {!isTerminal && (
            <div className={`text-right ${isOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
              <div className="flex items-center gap-1 text-sm font-medium">
                <Clock size={14} />
                {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
              </div>
              <p className="text-[10px] mt-0.5">
                Deadline: {new Date(plan.deadline).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
              </p>
            </div>
          )}
          {isTerminal && plan.resolved_at && (
            <div className="text-right text-muted-foreground">
              <p className="text-xs">
                {plan.stage === 'resolved' ? 'Resolved' : 'Escalated'}{' '}
                {new Date(plan.resolved_at || plan.escalated_at || '').toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
              </p>
            </div>
          )}
        </div>

        {/* Trigger context */}
        {plan.trigger_metric && (
          <div className={`p-3 rounded-lg border mb-4 ${flagColors.border} ${flagColors.bg}`}>
            <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1.5">
              <AlertTriangle size={12} className={flagColors.text} />
              Why you were flagged
            </p>
            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
              {Object.entries(plan.trigger_metric).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k.replace(/_/g, ' ')}</span>
                  <span className="font-mono font-medium text-foreground">
                    {typeof v === 'number' ? (k.includes('pct') ? `${v}%` : v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target */}
        {plan.target_metric && !isTerminal && (
          <div className="p-3 rounded-lg border border-border mb-4">
            <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1.5">
              <Target size={12} className="text-primary" />
              Target to resolve
            </p>
            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
              {Object.entries(plan.target_metric).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k.replace(/_/g, ' ')}</span>
                  <span className="font-mono font-medium text-foreground">
                    {typeof v === 'number' ? (k.includes('pct') ? `${v}%` : v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {plan.requirements_total > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-foreground flex items-center gap-1">
                <ListChecks size={13} />
                Your Action Plan
              </span>
              <span>{plan.requirements_completed}/{plan.requirements_total} complete ({progress}%)</span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  progress === 100 ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Requirements list */}
        {plan.requirements.length > 0 && (
          <div className="space-y-1.5">
            {plan.requirements.map(req => (
              <div
                key={req.id}
                className={`flex items-center gap-2 p-2 rounded border text-sm ${
                  req.is_completed
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-muted-foreground'
                    : 'border-border text-foreground'
                }`}
              >
                <CheckCircle2
                  size={14}
                  className={req.is_completed ? 'text-emerald-400 fill-emerald-500/20' : 'text-muted-foreground'}
                />
                <span className={req.is_completed ? 'line-through' : ''}>
                  {REQUIREMENT_TYPE_ICONS[req.requirement_type]} {req.title}
                </span>
                {req.is_completed && req.completed_at && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(req.completed_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {plan.requirements.length === 0 && !isTerminal && (
          <p className="text-xs text-muted-foreground italic text-center py-3">
            Your manager hasn't set up your action plan yet.
          </p>
        )}

        {/* Manager info */}
        {plan.assigned_to_name && (
          <p className="text-[11px] text-muted-foreground mt-3">
            Coach: <span className="text-foreground font-medium">{plan.assigned_to_name}</span>
          </p>
        )}

        {/* Expand/collapse for notes + history */}
        <button
          onClick={onToggle}
          className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors w-full justify-center py-1"
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isExpanded ? 'Hide details' : `View notes & history${plan.notes_count > 0 ? ` (${plan.notes_count})` : ''}`}
        </button>

        {/* Expanded detail section */}
        {isExpanded && (
          <PlanDetail planId={plan.id} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Expandable Detail: Notes + History ────────────────────────────────────

function PlanDetail({ planId }: { planId: string }) {
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [history, setHistory] = useState<CoachingStageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [n, h] = await Promise.all([
        fetchCoachingNotes(planId),
        fetchStageHistory(planId),
      ]);
      if (!cancelled) {
        setNotes(n);
        setHistory(h);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [planId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="animate-spin text-muted-foreground" size={16} />
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border/30 pt-4 space-y-5">
      {/* Notes from manager */}
      <div>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <MessageSquare size={13} />
          Coaching Notes
        </h4>
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No coaching notes yet.</p>
        ) : (
          <div className="space-y-2">
            {notes.map(note => (
              <div key={note.id} className="p-2.5 rounded-lg border border-border bg-secondary/30">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.body}</p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {new Date(note.created_at).toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })} CT
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stage history timeline */}
      <div>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <History size={13} />
          Timeline
        </h4>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No history yet.</p>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
            {history.map(entry => (
              <div key={entry.id} className="relative pb-3 last:pb-0">
                <div className={`absolute -left-2.5 top-1.5 w-2 h-2 rounded-full ${
                  entry.to_stage === 'resolved' ? 'bg-emerald-500'
                  : entry.to_stage === 'escalated' ? 'bg-red-500'
                  : COACHING_STAGE_COLORS[entry.to_stage]?.dot || 'bg-primary'
                }`} />
                <div className="ml-2">
                  <p className="text-xs text-foreground">
                    {entry.from_stage
                      ? `${COACHING_STAGE_LABELS[entry.from_stage]} → ${COACHING_STAGE_LABELS[entry.to_stage]}`
                      : `Started at ${COACHING_STAGE_LABELS[entry.to_stage]}`
                    }
                  </p>
                  {entry.note && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{entry.note}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(entry.created_at).toLocaleString('en-US', {
                      timeZone: 'America/Chicago',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })} CT
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
