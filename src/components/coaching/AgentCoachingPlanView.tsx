/**
 * AgentCoachingPlanView — Agent-facing view of their coaching plans
 *
 * Shows the agent's active coaching plans with:
 * - Flag type badge + deadline countdown
 * - Action plan checklist with self-completion for eligible types
 * - Progress bar
 * - Two-way notes thread (agent can post notes back to manager)
 * - "Why you were flagged" trigger context
 * - Target metrics to resolve
 * - Stage history timeline
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Target, CheckCircle2, AlertTriangle, Loader2,
  ListChecks, ChevronDown, ChevronUp, MessageSquare,
  History, Send,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  type CoachingRequirement,
} from '@/lib/coaching/types';
import {
  fetchCoachingPlans,
  fetchCoachingNotes,
  fetchStageHistory,
  addCoachingNote,
  completeRequirement,
  updateRequirement,
} from '@/lib/coaching/api';

/** Requirement types the agent can self-mark as complete */
const AGENT_COMPLETABLE_TYPES = new Set(['custom_task', 'training']);

/** Requirement types where the agent can increment completed_count */
const AGENT_INCREMENTABLE_TYPES = new Set(['live_attendance']);

export function AgentCoachingPlanView() {
  const { effectiveAgencyId, effectiveWritingNumber, profile } = useEffectiveAuth();
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
    // Show active plans only — but also show recently resolved (last 30d)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    setPlans(data.filter(p => {
      if (!['resolved', 'escalated'].includes(p.stage)) return true;
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
            profileId={profile?.id ?? null}
            onRequirementUpdated={loadPlans}
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
  profileId,
  onRequirementUpdated,
}: {
  plan: CoachingCard;
  isExpanded: boolean;
  isTerminal: boolean;
  onToggle: () => void;
  profileId: string | null;
  onRequirementUpdated: () => void;
}) {
  // Multi-flag: derive active flags and use first for border color
  const activeFlags = plan.active_flag_types.length > 0 ? plan.active_flag_types : (plan.flag_type ? [plan.flag_type] : []);
  const primaryFlagType = activeFlags[0] || 'production';
  const flagColors = FLAG_TYPE_COLORS[primaryFlagType];
  const days = daysRemaining(plan.deadline);
  const isOverdue = days < 0;
  const progress = plan.requirements_total > 0
    ? Math.round((plan.requirements_completed / plan.requirements_total) * 100)
    : 0;

  // Track in-flight self-completions
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const handleSelfComplete = async (req: CoachingRequirement) => {
    if (!profileId || req.is_completed || completing.has(req.id)) return;

    setCompleting(prev => new Set(prev).add(req.id));
    try {
      await completeRequirement(req.id, profileId);
      onRequirementUpdated();
    } finally {
      setCompleting(prev => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
    }
  };

  const handleIncrementAttendance = async (req: CoachingRequirement) => {
    if (!profileId || completing.has(req.id)) return;
    const newCount = (req.completed_count || 0) + 1;
    const isNowComplete = req.required_count ? newCount >= req.required_count : false;

    setCompleting(prev => new Set(prev).add(req.id));
    try {
      await updateRequirement(req.id, {
        completed_count: newCount,
        ...(isNowComplete ? {
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: profileId,
        } : {}),
      });
      onRequirementUpdated();
    } finally {
      setCompleting(prev => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
    }
  };

  return (
    <Card className={`border ${isTerminal ? 'border-border opacity-75' : flagColors.border}`}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {activeFlags.map(ft => (
                <Badge key={ft} variant="outline" className={`text-xs ${FLAG_TYPE_COLORS[ft].badge}`}>
                  {FLAG_TYPE_COLORS[ft].icon} {FLAG_TYPE_LABELS[ft]}
                </Badge>
              ))}
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
              {activeFlags.includes('production') && 'Your production is below the required threshold. '}
              {activeFlags.includes('quality') && 'Your at-risk or terminated policy percentage is too high. '}
              {activeFlags.includes('rts_watch') && 'You\'ve been moved to RTS — this is your observation period. '}
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
          {isTerminal && (plan.resolved_at || plan.escalated_at) && (
            <div className="text-right text-muted-foreground">
              <p className="text-xs">
                {plan.stage === 'resolved' ? 'Resolved' : 'Escalated'}{' '}
                {new Date(plan.resolved_at || plan.escalated_at || '').toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
              </p>
            </div>
          )}
        </div>

        {/* Trigger context */}
        {/* Per-flag trigger & target context */}
        {plan.flags.filter(f => !f.resolved).map((flag, idx) => {
          const fc = FLAG_TYPE_COLORS[flag.type];
          return (
            <div key={`${flag.type}-${idx}`} className="mb-4">
              <div className={`p-3 rounded-lg border ${fc.border} ${fc.bg}`}>
                <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={12} className={fc.text} />
                  {fc.icon} {FLAG_TYPE_LABELS[flag.type]} — Why you were flagged
                </p>
                <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                  {Object.entries(flag.trigger_metric || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-medium text-foreground">
                        {typeof v === 'number' ? (k.includes('pct') ? `${v}%` : v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
                {flag.target_metric && Object.keys(flag.target_metric).length > 0 && !isTerminal && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="text-[10px] font-medium text-foreground mb-1 flex items-center gap-1">
                      <Target size={10} className="text-primary" />
                      Target to resolve
                    </p>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                      {Object.entries(flag.target_metric).map(([k, v]) => (
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
              </div>
            </div>
          );
        })}

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

        {/* Requirements list — with self-completion for eligible types */}
        {plan.requirements.length > 0 && (
          <div className="space-y-1.5">
            {plan.requirements.map(req => {
              const canSelfComplete = !isTerminal
                && !req.is_completed
                && AGENT_COMPLETABLE_TYPES.has(req.requirement_type);
              const canIncrement = !isTerminal
                && !req.is_completed
                && AGENT_INCREMENTABLE_TYPES.has(req.requirement_type)
                && req.required_count
                && req.completed_count < req.required_count;
              const isProcessing = completing.has(req.id);

              return (
                <div
                  key={req.id}
                  className={`flex items-center gap-2 p-2 rounded border text-sm ${
                    req.is_completed
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-muted-foreground'
                      : 'border-border text-foreground'
                  }`}
                >
                  {/* Self-complete button or status icon */}
                  {canSelfComplete ? (
                    <button
                      onClick={() => handleSelfComplete(req)}
                      disabled={isProcessing}
                      className="flex-shrink-0 text-muted-foreground hover:text-emerald-400 transition-colors disabled:opacity-50"
                      title="Mark as complete"
                    >
                      {isProcessing
                        ? <Loader2 size={14} className="animate-spin" />
                        : <CheckCircle2 size={14} />
                      }
                    </button>
                  ) : (
                    <CheckCircle2
                      size={14}
                      className={`flex-shrink-0 ${req.is_completed ? 'text-emerald-400 fill-emerald-500/20' : 'text-muted-foreground'}`}
                    />
                  )}

                  <span className={`flex-1 ${req.is_completed ? 'line-through' : ''}`}>
                    {REQUIREMENT_TYPE_ICONS[req.requirement_type]} {req.title}
                  </span>

                  {/* Live attendance: show count + increment button */}
                  {req.requirement_type === 'live_attendance' && req.required_count && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-muted-foreground font-mono">
                        {req.completed_count}/{req.required_count}
                      </span>
                      {canIncrement && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleIncrementAttendance(req)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? <Loader2 size={10} className="animate-spin" /> : '+1 Attended'}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Coaching meeting: show scheduled date */}
                  {req.requirement_type === 'coaching_meeting' && req.meeting_scheduled_at && !req.is_completed && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(req.meeting_scheduled_at).toLocaleDateString('en-US', {
                        timeZone: 'America/Chicago',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })} CT
                    </span>
                  )}

                  {req.is_completed && req.completed_at && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(req.completed_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                    </span>
                  )}
                </div>
              );
            })}
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
          {isExpanded ? 'Hide details' : `Notes & history${plan.notes_count > 0 ? ` (${plan.notes_count})` : ''}`}
        </button>

        {/* Expanded detail section — now with agent note posting */}
        {isExpanded && (
          <PlanDetail
            planId={plan.id}
            profileId={profileId}
            isTerminal={isTerminal}
            onNoteAdded={onRequirementUpdated}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── Expandable Detail: Notes (two-way) + History ──────────────────────────

function PlanDetail({
  planId,
  profileId,
  isTerminal,
  onNoteAdded,
}: {
  planId: string;
  profileId: string | null;
  isTerminal: boolean;
  onNoteAdded: () => void;
}) {
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [history, setHistory] = useState<CoachingStageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');
  const [sendingNote, setSendingNote] = useState(false);

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

  const handleSendNote = async () => {
    if (!profileId || !noteDraft.trim() || sendingNote) return;
    setSendingNote(true);
    try {
      await addCoachingNote(planId, profileId, noteDraft.trim());
      setNoteDraft('');
      // Refresh notes
      const updatedNotes = await fetchCoachingNotes(planId);
      setNotes(updatedNotes);
      onNoteAdded();
    } finally {
      setSendingNote(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendNote();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="animate-spin text-muted-foreground" size={16} />
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border/30 pt-4 space-y-5">
      {/* Two-way notes thread */}
      <div>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <MessageSquare size={13} />
          Coaching Notes
        </h4>
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground italic mb-3">No coaching notes yet. Start the conversation below.</p>
        )}
        {notes.length > 0 && (
          <div className="space-y-2 mb-3">
            {notes.map(note => {
              const isOwnNote = note.author_id === profileId;
              return (
                <div
                  key={note.id}
                  className={`p-2.5 rounded-lg border ${
                    isOwnNote
                      ? 'border-primary/30 bg-primary/5 ml-4'
                      : 'border-border bg-secondary/30 mr-4'
                  }`}
                >
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                    {isOwnNote ? 'You' : 'Manager'}
                    {' · '}
                    {new Date(note.created_at).toLocaleString('en-US', {
                      timeZone: 'America/Chicago',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })} CT
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Agent note input — always visible unless terminal */}
        {!isTerminal && profileId && (
          <div className="flex gap-2">
            <Textarea
              placeholder="Reply to your manager…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] text-sm resize-none flex-1"
              rows={2}
            />
            <Button
              size="sm"
              onClick={handleSendNote}
              disabled={!noteDraft.trim() || sendingNote}
              className="self-end h-8 px-3"
            >
              {sendingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        )}
        {!isTerminal && profileId && (
          <p className="text-[10px] text-muted-foreground mt-1">⌘+Enter to send</p>
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
