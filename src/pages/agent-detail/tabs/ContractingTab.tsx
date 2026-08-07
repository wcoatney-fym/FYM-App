/**
 * ContractingTab — Agent-facing contracting view (Phase A)
 *
 * FYM direct agents only. Two modes:
 * 1. Pre-RTS: Vertical stepper showing pipeline progress + training links
 * 2. Post-RTS (Actively Selling): Current carrier assignments + WN submission
 *    with contracting team approval workflow.
 *
 * Data source: Portal Supabase (akhojh…) — agent_pipeline, agent_lob_assignments,
 * agent_writing_number_submissions, agent_pipeline_stage_steps, agent_live_sessions.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Send,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  FileText,
  Plus,
  XCircle,
  Video,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { portalSupabase } from '@/lib/portal-supabase';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
  PortalLobAssignment,
  PortalLiveSession,
} from '@/lib/contracting/types';
import { HIP_CARRIERS } from '@/lib/contracting/types';

// ── Stage display order for stepper ────────────────────────────────────────
const STAGE_ORDER: { key: AgentPipelineStage; label: string }[] = [
  { key: 'hip_broker', label: 'HIP Broker' },
  { key: 'hip_career', label: 'HIP Career' },
  { key: 'iaa', label: 'IAA' },
  { key: 'signed_iaa', label: 'Signed IAA' },
  { key: 'bill_com', label: 'Bill.com' },
  { key: 'in_contracting', label: 'In Contracting' },
  { key: 'rts', label: 'Ready to Sell' },
  { key: 'crm', label: 'CRM Onboarding' },
  { key: 'actively_selling', label: 'Actively Selling' },
];

type WnSubmission = {
  id: string;
  carrier: string;
  writing_number: string | null;
  status: 'pending' | 'verified' | 'rejected';
  review_note: string | null;
  created_at: string;
};

// Post-RTS stages where agent can request new carrier contracting
const POST_RTS_STAGES: AgentPipelineStage[] = [
  'rts',
  'actively_selling',
  'hip_broker_ready',
  'hip_career_ready',
];

interface ContractingTabProps {
  /** Portal agent_pipeline record for this agent */
  pipelineRecord: PortalPipelineRecord | null;
  /** Portal agent ID (from agent_pipeline.agent_id) */
  portalAgentId: string | null;
  /** Whether data is still loading */
  loading: boolean;
}

export function ContractingTab({
  pipelineRecord,
  portalAgentId,
  loading: parentLoading,
}: ContractingTabProps) {
  const [stageSteps, setStageSteps] = useState<PortalPipelineStageStep[]>([]);
  const [lobAssignments, setLobAssignments] = useState<PortalLobAssignment[]>([]);
  const [wnSubmissions, setWnSubmissions] = useState<WnSubmission[]>([]);
  const [liveSessions, setLiveSessions] = useState<PortalLiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  // WN submission form state
  const [showWnForm, setShowWnForm] = useState(false);
  const [wnCarrier, setWnCarrier] = useState('');
  const [wnNumber, setWnNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Load portal data ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!portalSupabase || !portalAgentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [stepsRes, lobRes, wnRes, sessionsRes] = await Promise.all([
        portalSupabase
          .from('agent_pipeline_stage_steps')
          .select('*')
          .eq('active', true)
          .order('display_order', { ascending: true }),
        portalSupabase
          .from('agent_lob_assignments')
          .select('*')
          .eq('agent_id', portalAgentId)
          .order('carrier', { ascending: true }),
        portalSupabase
          .from('agent_writing_number_submissions')
          .select('id, carrier, writing_number, status, review_note, created_at')
          .eq('agent_id', portalAgentId)
          .order('created_at', { ascending: false }),
        portalSupabase
          .from('agent_live_sessions')
          .select('*')
          .eq('is_active', true)
          .order('session_datetime', { ascending: true }),
      ]);

      if (stepsRes.data) setStageSteps(stepsRes.data as PortalPipelineStageStep[]);
      if (lobRes.data) setLobAssignments(lobRes.data as PortalLobAssignment[]);
      if (wnRes.data) setWnSubmissions(wnRes.data as WnSubmission[]);
      if (sessionsRes.data) setLiveSessions(sessionsRes.data as PortalLiveSession[]);
    } catch (err) {
      console.error('ContractingTab load error:', err);
    } finally {
      setLoading(false);
    }
  }, [portalAgentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Submit writing number ─────────────────────────────────────────────────
  const handleSubmitWn = async () => {
    if (!portalSupabase || !portalAgentId || !wnCarrier.trim() || !wnNumber.trim()) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const { error } = await portalSupabase
        .from('agent_writing_number_submissions')
        .insert({
          agent_id: portalAgentId,
          carrier: wnCarrier.trim(),
          writing_number: wnNumber.trim(),
          submission_method: 'typed',
          status: 'pending',
        });

      if (error) throw error;

      // Bump pending count on pipeline record
      if (pipelineRecord) {
        await portalSupabase
          .from('agent_pipeline')
          .update({
            wn_pending_review: true,
            wn_pending_count: (pipelineRecord.wn_pending_count || 0) + 1,
          })
          .eq('id', pipelineRecord.id);
      }

      setSubmitMsg({ text: `Writing number submitted for ${wnCarrier}. The contracting team will review and approve.`, type: 'success' });
      setWnCarrier('');
      setWnNumber('');
      setShowWnForm(false);
      await loadData();
    } catch {
      setSubmitMsg({ text: 'Failed to submit — please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (parentLoading || loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── No pipeline record ────────────────────────────────────────────────────
  if (!pipelineRecord || !portalAgentId) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center space-y-3">
          <FileText size={28} className="text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            No contracting record found for this agent.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPostRts = POST_RTS_STAGES.includes(pipelineRecord.stage);
  const currentStageIdx = STAGE_ORDER.findIndex((s) => s.key === pipelineRecord.stage);
  const stepsForStage = (stageKey: AgentPipelineStage) =>
    stageSteps.filter((s) => s.internal_stage === stageKey);
  const isStepComplete = (stepId: string) =>
    pipelineRecord.completed_steps && pipelineRecord.completed_steps[stepId];

  // Carriers the agent already has assignments for
  const assignedCarriers = new Set(lobAssignments.map((a) => a.carrier));
  // Carriers with pending WN submissions
  const pendingCarriers = new Set(
    wnSubmissions.filter((s) => s.status === 'pending').map((s) => s.carrier)
  );

  return (
    <div className="space-y-6">
      {/* ── Pre-RTS: Pipeline Stepper ─────────────────────────────────── */}
      {!isPostRts && (
        <>
          {/* Status banner */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Onboarding In Progress
                </p>
                <p className="text-xs text-muted-foreground">
                  Current stage:{' '}
                  <span className="font-medium text-primary">
                    {STAGE_ORDER.find((s) => s.key === pipelineRecord.stage)?.label || pipelineRecord.stage}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Vertical stepper */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
                Contracting Progress
              </h3>
              <div className="relative">
                {STAGE_ORDER.map((stage, idx) => {
                  const isCurrent = stage.key === pipelineRecord.stage;
                  const isComplete = idx < currentStageIdx;
                  const isFuture = idx > currentStageIdx;
                  const steps = stepsForStage(stage.key);

                  return (
                    <div key={stage.key} className="flex gap-4 relative">
                      {/* Vertical line */}
                      {idx < STAGE_ORDER.length - 1 && (
                        <div
                          className={`absolute left-[15px] top-[32px] w-0.5 ${
                            isComplete ? 'bg-emerald-500' : 'bg-border'
                          }`}
                          style={{ height: 'calc(100% - 16px)' }}
                        />
                      )}

                      {/* Icon */}
                      <div className="flex-shrink-0 mt-1 z-10">
                        {isComplete ? (
                          <CheckCircle2 className="w-[30px] h-[30px] text-emerald-500" />
                        ) : isCurrent ? (
                          <div className="w-[30px] h-[30px] rounded-full border-[3px] border-primary bg-primary/10 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                          </div>
                        ) : (
                          <Circle className="w-[30px] h-[30px] text-muted-foreground/30" />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`flex-1 pb-6 ${isFuture ? 'opacity-40' : ''}`}>
                        <p
                          className={`text-sm font-semibold ${
                            isCurrent
                              ? 'text-primary'
                              : isComplete
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {stage.label}
                          {isCurrent && (
                            <Badge className="ml-2 bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0">
                              Current
                            </Badge>
                          )}
                        </p>

                        {/* Checklist items for current & completed stages */}
                        {(isCurrent || isComplete) && steps.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {steps.map((step) => {
                              const done = isComplete || isStepComplete(step.id);
                              return (
                                <div
                                  key={step.id}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  {done ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                  ) : (
                                    <Circle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                                  )}
                                  <span
                                    className={
                                      done
                                        ? 'text-muted-foreground line-through'
                                        : 'text-foreground'
                                    }
                                  >
                                    {step.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Next step callout */}
                        {isCurrent && idx < STAGE_ORDER.length - 1 && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-primary">
                            <ChevronRight className="w-3.5 h-3.5" />
                            <span>
                              Next: <span className="font-semibold">{STAGE_ORDER[idx + 1].label}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Post-RTS: Carrier Assignments + WN Submission ─────────────── */}
      {isPostRts && (
        <>
          {/* Status banner */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <ShieldCheck size={20} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Actively Selling
                </p>
                <p className="text-xs text-muted-foreground">
                  You can request contracting for additional carriers below.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Current carrier assignments */}
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Your Carriers
                </h3>
                <button
                  onClick={() => {
                    setShowWnForm(true);
                    setSubmitMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Request New Carrier
                </button>
              </div>

              {lobAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No carrier assignments yet. Request contracting for a new carrier to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {lobAssignments.map((lob) => (
                    <div
                      key={lob.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10">
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{lob.carrier}</p>
                          <p className="text-xs text-muted-foreground">
                            {lob.line_of_business} · WN: <span className="font-mono">{lob.writing_number}</span>
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={
                          lob.verified
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }
                      >
                        {lob.verified ? 'Verified' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* WN submission form */}
          {showWnForm && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Submit Writing Number
                </h3>
                <p className="text-xs text-muted-foreground">
                  Enter your writing number for the carrier you'd like to add. The contracting team
                  will review and approve before it goes active.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Carrier
                    </label>
                    <select
                      value={wnCarrier}
                      onChange={(e) => setWnCarrier(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">Select carrier…</option>
                      {HIP_CARRIERS.map((c) => (
                        <option key={c} value={c} disabled={assignedCarriers.has(c) || pendingCarriers.has(c)}>
                          {c}
                          {assignedCarriers.has(c) ? ' (already assigned)' : ''}
                          {pendingCarriers.has(c) ? ' (pending review)' : ''}
                        </option>
                      ))}
                      {/* Allow custom carrier entry */}
                      <option value="__other">Other…</option>
                    </select>
                    {wnCarrier === '__other' && (
                      <input
                        type="text"
                        placeholder="Enter carrier name"
                        onChange={(e) => setWnCarrier(e.target.value)}
                        className="w-full mt-2 px-3 py-2 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Writing Number
                    </label>
                    <input
                      type="text"
                      value={wnNumber}
                      onChange={(e) => setWnNumber(e.target.value)}
                      placeholder="e.g. 12345678"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSubmitWn}
                    disabled={submitting || !wnCarrier.trim() || wnCarrier === '__other' || !wnNumber.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Submit for Review
                  </button>
                  <button
                    onClick={() => {
                      setShowWnForm(false);
                      setWnCarrier('');
                      setWnNumber('');
                    }}
                    className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success / error message */}
          {submitMsg && (
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                submitMsg.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {submitMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              {submitMsg.text}
            </div>
          )}

          {/* Pending & past submissions */}
          {wnSubmissions.length > 0 && (
            <Card className="border-border">
              <CardContent className="p-6">
                <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
                  Submission History
                </h3>
                <div className="space-y-2">
                  {wnSubmissions.map((sub) => (
                    <div
                      key={sub.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                        sub.status === 'pending'
                          ? 'border-amber-500/20 bg-amber-500/5'
                          : sub.status === 'verified'
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-red-500/20 bg-red-500/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {sub.status === 'pending' ? (
                          <Clock className="w-4 h-4 text-amber-400" />
                        ) : sub.status === 'verified' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {sub.carrier}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            WN: <span className="font-mono">{sub.writing_number || '—'}</span>
                            {' · '}
                            {new Date(sub.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                          {sub.status === 'rejected' && sub.review_note && (
                            <p className="text-xs text-red-400 mt-0.5">
                              Reason: {sub.review_note}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        className={
                          sub.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : sub.status === 'verified'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }
                      >
                        {sub.status === 'pending'
                          ? 'Pending Review'
                          : sub.status === 'verified'
                          ? 'Approved'
                          : 'Rejected'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Training Links (both views) ───────────────────────────────── */}
      {liveSessions.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-6">
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Live Training Sessions
            </h3>
            <div className="space-y-2">
              {liveSessions.map((session) => {
                const dt = new Date(session.session_datetime);
                const isPast = dt < new Date();
                return (
                  <a
                    key={session.id}
                    href={session.join_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:bg-background transition-colors ${
                      isPast ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Video className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {session.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dt.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'America/Chicago',
                          })}{' '}
                          CT
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
