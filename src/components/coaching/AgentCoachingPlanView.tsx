/**
 * AgentCoachingPlanView — Agent-facing view of their coaching plans
 *
 * Shows the agent's active coaching cards with:
 * - Flag type badge + deadline countdown
 * - Action plan checklist with completion status
 * - Progress ring
 * - Notes from their manager
 *
 * Stub for PR 3 — full implementation in PR 4 (Agent UI).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Target, CheckCircle2, AlertTriangle, Loader2,
  ListChecks,
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
} from '@/lib/coaching/types';
import { fetchCoachingPlans } from '@/lib/coaching/api';

export function AgentCoachingPlanView() {
  const { effectiveAgencyId, effectiveWritingNumber } = useEffectiveAuth();
  const [plans, setPlans] = useState<CoachingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterAgentId, setRosterAgentId] = useState<string | null>(null);

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
    // Show active plans only (not resolved/escalated)
    setPlans(data.filter(p => !['resolved', 'escalated'].includes(p.stage)));
    setLoading(false);
  }, [rosterAgentId]);

  useEffect(() => {
    if (rosterAgentId) loadPlans();
  }, [rosterAgentId, loadPlans]);

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
        const flagColors = FLAG_TYPE_COLORS[plan.flag_type];
        const days = daysRemaining(plan.deadline);
        const isOverdue = days < 0;
        const progress = plan.requirements_total > 0
          ? Math.round((plan.requirements_completed / plan.requirements_total) * 100)
          : 0;

        return (
          <Card key={plan.id} className={`border ${flagColors.border}`}>
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
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {plan.flag_type === 'production' && 'Your production is below the required threshold.'}
                    {plan.flag_type === 'quality' && 'Your at-risk or terminated policy percentage is too high.'}
                    {plan.flag_type === 'rts_watch' && 'You\'ve been moved to RTS — this is your observation period.'}
                  </p>
                </div>
                <div className={`text-right ${isOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <Clock size={14} />
                    {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </div>
                  <p className="text-[10px] mt-0.5">
                    Deadline: {new Date(plan.deadline).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                  </p>
                </div>
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
              {plan.target_metric && (
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
                    </div>
                  ))}
                </div>
              )}

              {plan.requirements.length === 0 && (
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
