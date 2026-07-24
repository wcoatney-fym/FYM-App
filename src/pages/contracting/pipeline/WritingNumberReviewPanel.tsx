/**
 * WritingNumberReviewPanel — inline review panel for verifying/rejecting
 * agent-submitted writing numbers. Embedded in the detail modal.
 * Ported from CRM Portal.
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
  onReviewComplete: (remainingPending: number) => void;
}

export function WritingNumberReviewPanel({
  agentId,
  pendingCount,
  onReviewComplete,
}: WritingNumberReviewPanelProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  const handleVerify = async (sub: Submission) => {
    if (!portalSupabase) return;
    setActionLoading(sub.id);
    setError('');
    try {
      const { error: e1 } = await portalSupabase
        .from('agent_writing_number_submissions')
        .update({
          status: 'verified',
          reviewed_by: 'FYM App',
          reviewed_at: new Date().toISOString(),
          review_note: null,
        })
        .eq('id', sub.id);
      if (e1) throw e1;

      const { error: e2 } = await portalSupabase
        .from('agent_lob_assignments')
        .upsert(
          {
            agent_id: agentId,
            carrier: sub.carrier,
            lob: 'HI',
            writing_number: sub.writing_number,
            verified: true,
            verified_at: new Date().toISOString(),
            verified_by: 'FYM App',
            submitted_by_agent: true,
            ai_extracted: sub.submission_method === 'image',
            source_submission_id: sub.id,
          },
          { onConflict: 'agent_id,carrier,lob' }
        );
      if (e2) throw e2;

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
                status: 'verified' as const,
                reviewed_by: 'FYM App',
                reviewed_at: new Date().toISOString(),
              }
            : s
        )
      );
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
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-bold text-amber-800">
            Writing Number Review
          </span>
          {pendingSubs.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {pendingSubs.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-600" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-2 text-sm text-amber-700">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading submissions…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          {pendingSubs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Pending Review
              </p>
              {pendingSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-white rounded-lg border border-amber-100 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {sub.submission_method === 'image' ? (
                        <Upload className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      ) : (
                        <PenLine className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {sub.carrier}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-slate-600 font-mono">
                            {sub.writing_number || '—'}
                          </span>
                          {sub.ai_extracted_number &&
                            sub.ai_extracted_number !== sub.writing_number && (
                              <span className="text-[10px] text-slate-400">
                                (AI read: {sub.ai_extracted_number})
                              </span>
                            )}
                          <span className="text-[10px] text-slate-400">
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
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {reviewingId !== sub.id && (
                        <>
                          <button
                            onClick={() => handleVerify(sub)}
                            disabled={!!actionLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === sub.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Verify
                          </button>
                          <button
                            onClick={() => {
                              setReviewingId(sub.id);
                              setRejectNote('');
                              setError('');
                            }}
                            disabled={!!actionLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {reviewingId === sub.id && (
                    <div className="px-3 pb-3 pt-0 border-t border-amber-100 bg-red-50/50 space-y-2">
                      <p className="text-xs text-red-700 font-medium pt-2">
                        Rejection reason (sent to agent):
                      </p>
                      <textarea
                        value={rejectNote}
                        onChange={(e) => {
                          setRejectNote(e.target.value);
                          setError('');
                        }}
                        rows={2}
                        placeholder="e.g. Writing number not found in carrier system"
                        className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setReviewingId(null);
                            setRejectNote('');
                            setError('');
                          }}
                          className="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                History
              </p>
              {resolvedSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100 text-xs"
                >
                  {sub.status === 'verified' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-slate-700">
                    {sub.carrier}
                  </span>
                  <span className="font-mono text-slate-500">
                    {sub.writing_number || '—'}
                  </span>
                  <span
                    className={`ml-auto font-semibold ${
                      sub.status === 'verified'
                        ? 'text-emerald-600'
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
            <div className="flex items-center gap-2 py-2 text-xs text-amber-700">
              <Clock className="w-3.5 h-3.5" /> No submissions found yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
