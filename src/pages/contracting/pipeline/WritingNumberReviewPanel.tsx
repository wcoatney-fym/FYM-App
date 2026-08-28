/**
 * WritingNumberReviewPanel — inline review panel for verifying/rejecting
 * agent-submitted writing numbers. Embedded in the detail modal.
 *
 * Charlie (2026-08-28): Agents no longer type WNs themselves. They upload
 * screenshots of the carrier email. Admins view the screenshot and manually
 * enter the writing number, then verify or reject.
 *
 * For additional contracting (active agents), manual typed submissions
 * are still possible — admin just approves those.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  PenLine,
  Upload,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ExternalLink,
  ImageIcon,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';

type Submission = {
  id: string;
  agent_id: string;
  carrier: string;
  writing_number: string | null;
  ai_extracted_number: string | null;
  source_image_url: string | null;
  submission_method: 'typed' | 'image';
  status: 'pending' | 'verified' | 'rejected';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

interface WritingNumberReviewPanelProps {
  agentId: string;
  agentName: string;
  pendingCount: number;
  /** Current tags on the pipeline record */
  pipelineTags?: string[];
  /** Pipeline record ID (for stage updates) */
  pipelineRecordId?: string;
  onReviewComplete: (remainingPending: number) => void;
}

export function WritingNumberReviewPanel({
  agentId,
  pendingCount,
  pipelineTags = [],
  pipelineRecordId,
  onReviewComplete,
}: WritingNumberReviewPanelProps) {
  const isActiveAgentRequest = pipelineTags.includes('active_agent_request');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Admin-entered writing numbers per submission (for image submissions)
  const [adminWNInputs, setAdminWNInputs] = useState<Record<string, string>>({});
  // Expanded screenshot previews
  const [expandedScreenshots, setExpandedScreenshots] = useState<Set<string>>(new Set());

  const loadSubmissions = useCallback(async () => {
    if (!portalSupabase) return;
    setLoading(true);
    const { data } = await portalSupabase
      .from('agent_writing_number_submissions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
    if (data) setSubmissions(data as Submission[]);
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    if (pendingCount > 0) loadSubmissions();
  }, [agentId, pendingCount, loadSubmissions]);

  const toggleScreenshot = (subId: string) => {
    setExpandedScreenshots((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const handleVerify = async (sub: Submission) => {
    if (!portalSupabase) return;

    // For image submissions, admin must enter the WN
    const adminEnteredWN = sub.submission_method === 'image'
      ? (adminWNInputs[sub.id] || '').trim()
      : null;

    // For image submissions, require admin to enter a WN
    if (sub.submission_method === 'image' && !adminEnteredWN) {
      setError('Enter the writing number from the screenshot before verifying.');
      return;
    }

    // The verified writing number: admin-entered for images, agent-typed for manual
    const verifiedWN = adminEnteredWN || sub.writing_number || '';

    setActionLoading(sub.id);
    setError('');
    try {
      // Update the submission with the admin-entered WN (if image)
      const submissionUpdate: Record<string, unknown> = {
        status: 'verified',
        reviewed_by: 'FYM App',
        reviewed_at: new Date().toISOString(),
        review_note: null,
      };
      if (sub.submission_method === 'image' && adminEnteredWN) {
        submissionUpdate.writing_number = adminEnteredWN;
      }

      const { error: e1 } = await portalSupabase
        .from('agent_writing_number_submissions')
        .update(submissionUpdate)
        .eq('id', sub.id);
      if (e1) throw e1;

      const { error: e2 } = await portalSupabase
        .from('agent_lob_assignments')
        .upsert(
          {
            agent_id: agentId,
            carrier: sub.carrier,
            line_of_business: 'HIP',
            writing_number: verifiedWN,
            verified: true,
            verified_at: new Date().toISOString(),
            verified_by: 'FYM App',
            submitted_by_agent: true,
            ai_extracted: sub.submission_method === 'image',
            source_submission_id: sub.id,
          },
          { onConflict: 'agent_id,line_of_business,carrier' }
        );
      if (e2) throw e2;

      const remaining = submissions.filter(
        (s) => s.id !== sub.id && s.status === 'pending'
      ).length;

      // Phase B: If this was an active_agent_request and no pending submissions
      // remain, auto-move agent back to actively_selling and remove the tag
      const pipelineUpdate: Record<string, unknown> = {
        wn_pending_review: remaining > 0,
        wn_pending_count: remaining,
      };

      if (isActiveAgentRequest && remaining === 0) {
        pipelineUpdate.stage = 'actively_selling';
        pipelineUpdate.stage_entered_at = new Date().toISOString();
        pipelineUpdate.last_updated_by = 'FYM App';
        pipelineUpdate.updated_by_source = 'contracting_portal';
        pipelineUpdate.tags = pipelineTags.filter((t) => t !== 'active_agent_request');
      }

      await portalSupabase
        .from('agent_pipeline')
        .update(pipelineUpdate)
        .eq('agent_id', agentId);

      // Push stage change to GHL if auto-moving back
      const wnAppUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const wnAppKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      if (isActiveAgentRequest && remaining === 0 && pipelineRecordId && wnAppUrl && wnAppKey) {
        fetch(`${wnAppUrl}/functions/v1/push-contracting-stage`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${wnAppKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'push',
            record_id: pipelineRecordId,
            new_stage: 'actively_selling',
            updated_by: 'FYM App',
            updated_by_source: 'fym_app',
          }),
        }).catch(() => {}); // Best-effort GHL sync
      }

      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === sub.id
            ? {
                ...s,
                status: 'verified' as const,
                writing_number: verifiedWN,
                reviewed_by: 'FYM App',
                reviewed_at: new Date().toISOString(),
              }
            : s
        )
      );

      // Clear admin WN input
      setAdminWNInputs((prev) => {
        const next = { ...prev };
        delete next[sub.id];
        return next;
      });

      onReviewComplete(remaining);
    } catch {
      setError('Verify failed — please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (sub: Submission) => {
    if (!portalSupabase) return;
    if (!rejectNote.trim()) {
      setError('Add a note for the agent before rejecting.');
      return;
    }
    setActionLoading(sub.id);
    setError('');
    try {
      const { error: e1 } = await portalSupabase
        .from('agent_writing_number_submissions')
        .update({
          status: 'rejected',
          reviewed_by: 'FYM App',
          reviewed_at: new Date().toISOString(),
          review_note: rejectNote.trim(),
        })
        .eq('id', sub.id);
      if (e1) throw e1;

      const remaining = submissions.filter(
        (s) => s.id !== sub.id && s.status === 'pending'
      ).length;
      await portalSupabase
        .from('agent_pipeline')
        .update({ wn_pending_review: remaining > 0, wn_pending_count: remaining })
        .eq('agent_id', agentId);

      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === sub.id
            ? {
                ...s,
                status: 'rejected' as const,
                review_note: rejectNote.trim(),
                reviewed_by: 'FYM App',
                reviewed_at: new Date().toISOString(),
              }
            : s
        )
      );
      setRejectNote('');
      setReviewingId(null);
      onReviewComplete(remaining);
    } catch {
      setError('Reject failed — please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  if (pendingCount === 0 && submissions.length === 0) return null;

  const pendingSubs = submissions.filter((s) => s.status === 'pending');
  const resolvedSubs = submissions.filter((s) => s.status !== 'pending');

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-amber-300">
            Writing Number Review
          </span>
          {pendingSubs.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/100 text-white text-[10px] font-bold">
              {pendingSubs.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-2 text-sm text-amber-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading submissions…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          {pendingSubs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Pending Review
              </p>
              {pendingSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-card rounded-lg border border-amber-500/20 glow-sm overflow-hidden"
                >
                  <div className="px-3 py-2.5 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {sub.submission_method === 'image' ? (
                          <Upload className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <PenLine className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {sub.carrier}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {sub.submission_method === 'typed' && sub.writing_number && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {sub.writing_number}
                              </span>
                            )}
                            {sub.submission_method === 'image' && (
                              <span className="text-[10px] text-amber-400 font-medium">
                                Screenshot — enter WN below
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              ·{' '}
                              {new Date(sub.created_at).toLocaleDateString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Screenshot preview for image submissions */}
                    {sub.submission_method === 'image' && sub.source_image_url && (
                      <div className="space-y-2">
                        <button
                          onClick={() => toggleScreenshot(sub.id)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          {expandedScreenshots.has(sub.id) ? 'Hide' : 'View'} Screenshot
                          <a
                            href={sub.source_image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-1 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </button>
                        {expandedScreenshots.has(sub.id) && (
                          <div className="rounded-lg border border-border overflow-hidden bg-black/20">
                            <img
                              src={sub.source_image_url}
                              alt={`${sub.carrier} writing number screenshot`}
                              className="w-full max-h-64 object-contain"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Admin WN input for image submissions */}
                    {sub.submission_method === 'image' && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Writing Number (from screenshot)
                        </label>
                        <input
                          value={adminWNInputs[sub.id] || ''}
                          onChange={(e) =>
                            setAdminWNInputs((prev) => ({
                              ...prev,
                              [sub.id]: e.target.value,
                            }))
                          }
                          placeholder="Enter the writing number you see"
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    {reviewingId !== sub.id && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleVerify(sub)}
                          disabled={!!actionLoading}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === sub.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          {sub.submission_method === 'image' ? 'Verify & Save' : 'Approve'}
                        </button>
                        <button
                          onClick={() => {
                            setReviewingId(sub.id);
                            setRejectNote('');
                            setError('');
                          }}
                          disabled={!!actionLoading}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </div>

                  {reviewingId === sub.id && (
                    <div className="px-3 pb-3 pt-0 border-t border-amber-500/20 bg-red-500/50 space-y-2">
                      <p className="text-xs text-red-400 font-medium pt-2">
                        Rejection reason (sent to agent):
                      </p>
                      <textarea
                        value={rejectNote}
                        onChange={(e) => {
                          setRejectNote(e.target.value);
                          setError('');
                        }}
                        rows={2}
                        placeholder="e.g. Screenshot is blurry — please retake"
                        className="w-full px-3 py-2 border border-red-500/20 rounded-lg text-xs focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none bg-card"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setReviewingId(null);
                            setRejectNote('');
                            setError('');
                          }}
                          className="flex-1 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-background transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReject(sub)}
                          disabled={!!actionLoading || !rejectNote.trim()}
                          className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                        >
                          {actionLoading === sub.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          Confirm Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {resolvedSubs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                History
              </p>
              {resolvedSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border/50 text-xs"
                >
                  {sub.status === 'verified' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-foreground/80">
                    {sub.carrier}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {sub.writing_number || '—'}
                  </span>
                  {sub.submission_method === 'image' && (
                    <span className="text-[10px] text-muted-foreground">(screenshot)</span>
                  )}
                  <span
                    className={`ml-auto font-semibold ${
                      sub.status === 'verified'
                        ? 'text-emerald-400'
                        : 'text-red-500'
                    }`}
                  >
                    {sub.status === 'verified' ? 'Verified' : 'Rejected'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loading && submissions.length === 0 && (
            <div className="flex items-center gap-2 py-2 text-xs text-amber-400">
              <Clock className="w-3.5 h-3.5" /> No submissions found yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
