/**
 * AgentStepReviewPanel — admin panel inside PipelineDetailModal to review
 * agent-submitted step completions. Agents mark steps done on their side,
 * which creates a `pending_review` entry in `agent_step_completions`.
 * Admin approves or declines with an optional note.
 *
 * Charlie (2026-08-20): agent completions create a pending_review flag that
 * pushes agent to top of admin pipeline stage view. Admin decline marks step
 * incomplete on agent side with reason.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  MessageSquare,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import type { PortalPipelineRecord, PortalPipelineStageStep } from '@/lib/contracting/types';

interface StepCompletion {
  id: string;
  pipeline_id: string;
  step_id: string;
  stage: string;
  completed_at: string | null;
  completed_by: string | null;
  status: 'incomplete' | 'pending_review' | 'approved' | 'declined';
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentStepReviewPanelProps {
  record: PortalPipelineRecord;
  stageSteps: PortalPipelineStageStep[];
  onReviewComplete: (pendingRemaining: number) => void;
}

export function AgentStepReviewPanel({
  record,
  stageSteps,
  onReviewComplete,
}: AgentStepReviewPanelProps) {
  const [completions, setCompletions] = useState<StepCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [declineNoteId, setDeclineNoteId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  const loadCompletions = useCallback(async () => {
    if (!portalSupabase) return;
    const { data } = await portalSupabase
      .from('agent_step_completions')
      .select('*')
      .eq('pipeline_id', record.id)
      .order('created_at', { ascending: true });
    if (data) setCompletions(data as StepCompletion[]);
    setLoading(false);
  }, [record.id]);

  useEffect(() => {
    loadCompletions();
  }, [loadCompletions]);

  const pendingCompletions = completions.filter((c) => c.status === 'pending_review');
  const recentlyReviewed = completions.filter(
    (c) => c.status === 'approved' || c.status === 'declined'
  );

  const getStepLabel = (stepId: string) => {
    const step = stageSteps.find((s) => s.id === stepId);
    return step?.label || 'Unknown step';
  };

  const handleApprove = async (completion: StepCompletion) => {
    if (!portalSupabase) return;
    setReviewingId(completion.id);

    // 1. Update step completion status
    await portalSupabase
      .from('agent_step_completions')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
      })
      .eq('id', completion.id);

    // 2. Update the pipeline record's completed_steps
    const currentSteps = { ...(record.completed_steps || {}) };
    currentSteps[completion.step_id] = completion.completed_at || new Date().toISOString();
    await portalSupabase
      .from('agent_pipeline')
      .update({
        completed_steps: currentSteps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    // 3. Check if any pending remain
    const remaining = pendingCompletions.length - 1;
    if (remaining === 0) {
      // Clear the agent_action_pending flag
      await portalSupabase
        .from('agent_pipeline')
        .update({
          agent_action_pending: false,
          agent_action_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
    }

    await loadCompletions();
    onReviewComplete(remaining);
    setReviewingId(null);
  };

  const handleDecline = async (completion: StepCompletion) => {
    if (!portalSupabase) return;
    setReviewingId(completion.id);

    // 1. Update step completion — mark declined with note
    await portalSupabase
      .from('agent_step_completions')
      .update({
        status: 'declined',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
        review_note: declineNote || null,
      })
      .eq('id', completion.id);

    // 2. Check if any pending remain
    const remaining = pendingCompletions.length - 1;
    if (remaining === 0) {
      // Clear the agent_action_pending flag
      await portalSupabase
        .from('agent_pipeline')
        .update({
          agent_action_pending: false,
          agent_action_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
    }

    await loadCompletions();
    onReviewComplete(remaining);
    setReviewingId(null);
    setDeclineNoteId(null);
    setDeclineNote('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (completions.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Pending Reviews */}
      {pendingCompletions.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <UserCheck className="w-3.5 h-3.5" />
            Agent Completions — Pending Review ({pendingCompletions.length})
          </h3>
          <div className="space-y-2">
            {pendingCompletions.map((completion) => (
              <div
                key={completion.id}
                className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-foreground">
                      {getStepLabel(completion.step_id)}
                    </span>
                  </div>
                  {completion.completed_at && (
                    <span className="text-[10px] text-muted-foreground">
                      Submitted{' '}
                      {new Date(completion.completed_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>

                {/* Decline note input */}
                {declineNoteId === completion.id && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={declineNote}
                      onChange={(e) => setDeclineNote(e.target.value)}
                      placeholder="Reason for declining (optional)..."
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent bg-card"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDecline(completion);
                        if (e.key === 'Escape') {
                          setDeclineNoteId(null);
                          setDeclineNote('');
                        }
                      }}
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(completion)}
                    disabled={reviewingId === completion.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {reviewingId === completion.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Approve
                  </button>
                  {declineNoteId === completion.id ? (
                    <button
                      onClick={() => handleDecline(completion)}
                      disabled={reviewingId === completion.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {reviewingId === completion.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      Confirm Decline
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeclineNoteId(completion.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/5 border border-red-500/10 text-red-400/70 text-xs font-semibold hover:bg-red-500/10 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Decline
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Reviewed */}
      {recentlyReviewed.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            Recently Reviewed
          </h3>
          <div className="space-y-1.5">
            {recentlyReviewed.slice(0, 5).map((completion) => (
              <div
                key={completion.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border ${
                  completion.status === 'approved'
                    ? 'bg-emerald-500/5 border-emerald-500/10'
                    : 'bg-red-500/5 border-red-500/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  {completion.status === 'approved' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className="text-sm text-foreground/80">
                    {getStepLabel(completion.step_id)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {completion.review_note && (
                    <span className="text-[10px] text-muted-foreground italic max-w-[120px] truncate">
                      {completion.review_note}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-semibold ${
                      completion.status === 'approved'
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {completion.status === 'approved' ? 'Approved' : 'Declined'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
