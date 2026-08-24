/**
 * PipelineDetailModal — detail/edit modal for a single agent pipeline record.
 * Ported from CRM Portal's AgentPipelineDetailModal.
 */
import { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  Building2,
  Clock,
  PenLine,
  StickyNote,
  Save,
  Loader2,
  ArrowRightLeft,
  Tag,
  FileText,
  ListChecks,
  Check,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { portalSupabase } from '@/lib/portal-supabase';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { STAGES } from './PipelineBoard';
import { computeProgress } from './pipelineProgress';
import { WritingNumberReviewPanel } from './WritingNumberReviewPanel';
import { AgentStepReviewPanel } from './AgentStepReviewPanel';

interface PipelineDetailModalProps {
  record: PortalPipelineRecord;
  stageSteps: PortalPipelineStageStep[];
  onClose: () => void;
  onRecordUpdated: (updated: PortalPipelineRecord) => void;
  onStageChange: (recordId: string, newStage: AgentPipelineStage) => Promise<void>;
}

export function PipelineDetailModal({
  record,
  stageSteps,
  onClose,
  onRecordUpdated,
  onStageChange,
}: PipelineDetailModalProps) {
  const [togglingStep, setTogglingStep] = useState<string | null>(null);
  const progress = computeProgress(record, stageSteps);

  const [writingNumbers, setWritingNumbers] = useState(record.writing_numbers || '');
  const [notes, setNotes] = useState(record.notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [pendingStage, setPendingStage] = useState<AgentPipelineStage>(record.stage);
  const [wnPendingCount, setWnPendingCount] = useState(record.wn_pending_count ?? 0);
  const [agentActionPending, setAgentActionPending] = useState(record.agent_action_pending ?? false);

  const isReadyStage = record.stage === 'hip_broker_ready' || record.stage === 'hip_career_ready';
  const hasChanges =
    writingNumbers !== (record.writing_numbers || '') ||
    notes !== (record.notes || '');

  const toggleStep = async (stepId: string) => {
    if (!portalSupabase) return;
    setTogglingStep(stepId);
    const current = { ...(record.completed_steps || {}) };
    if (current[stepId]) {
      delete current[stepId];
    } else {
      current[stepId] = new Date().toISOString();
    }
    const { error } = await portalSupabase
      .from('agent_pipeline')
      .update({ completed_steps: current, updated_at: new Date().toISOString() })
      .eq('id', record.id);
    if (!error) {
      onRecordUpdated({ ...record, completed_steps: current });
    }
    setTogglingStep(null);
  };

  const handleSave = async () => {
    if (!portalSupabase) return;
    setSaving(true);
    const { error } = await portalSupabase
      .from('agent_pipeline')
      .update({
        writing_numbers: writingNumbers || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (!error) {
      onRecordUpdated({
        ...record,
        writing_numbers: writingNumbers || null,
        notes: notes || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleStageSelect = async (newStage: AgentPipelineStage) => {
    if (newStage === record.stage) return;
    setPendingStage(newStage);
    setMovingStage(true);
    await onStageChange(record.id, newStage);
    setMovingStage(false);
  };

  const stageEnteredDate = new Date(record.stage_entered_at).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
  );

  const stageLabel = STAGES.find((s) => s.key === record.stage)?.label || record.stage;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border-border p-0">
        {/* Header */}
        <DialogHeader className="sticky top-0 bg-card z-10 px-6 py-4 border-b border-border rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {record.agent_name || 'Unnamed Agent'}
              </DialogTitle>
              <DialogDescription asChild>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    record.stage === 'terminated'
                      ? 'bg-red-500/10 text-red-400'
                      : record.stage === 'actively_selling'
                        ? 'bg-amber-500/10 text-amber-400'
                        : record.stage.includes('ready')
                          ? 'bg-green-500/10 text-emerald-400'
                          : 'bg-blue-500/10 text-primary'
                  }`}
                >
                  {stageLabel}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Move Stage */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <ArrowRightLeft className="w-3.5 h-3.5" /> Move to Stage
            </label>
            <div className="relative">
              <select
                value={pendingStage}
                onChange={(e) =>
                  handleStageSelect(e.target.value as AgentPipelineStage)
                }
                disabled={movingStage}
                className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent appearance-none bg-card disabled:opacity-50"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                    {s.key === record.stage ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              {movingStage && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          </div>

          {/* Step Checklist */}
          {progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="w-3.5 h-3.5" /> Steps
                </h3>
                <span
                  className={`text-xs font-semibold ${
                    progress.allComplete ? 'text-emerald-400' : 'text-muted-foreground'
                  }`}
                >
                  {progress.completedCount}/{progress.total} complete
                </span>
              </div>
              <div className="h-1.5 w-full bg-secondary/40 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progress.allComplete ? 'bg-emerald-500/100' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                />
              </div>
              <div className="space-y-1.5 pt-1">
                {progress.steps.map((step) => {
                  const doneAt = record.completed_steps?.[step.id];
                  return (
                    <button
                      key={step.id}
                      onClick={() => toggleStep(step.id)}
                      disabled={togglingStep === step.id}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                        doneAt
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-card border-border hover:bg-background'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${
                          doneAt
                            ? 'bg-emerald-500/100 border-emerald-500'
                            : 'border-border'
                        }`}
                      >
                        {togglingStep === step.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : doneAt ? (
                          <Check className="w-3.5 h-3.5 text-white" />
                        ) : null}
                      </span>
                      <span
                        className={`text-sm flex-1 ${
                          doneAt ? 'text-foreground/80' : 'text-foreground'
                        }`}
                      >
                        {step.label}
                      </span>
                      {doneAt && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {new Date(doneAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags — with clear carrier request display */}
          {record.tags && record.tags.length > 0 && (() => {
            const carrierTags = record.tags.filter((t) => t.startsWith('carrier:'));
            const statusTag = record.tags.find(
              (t) => t === 'active_agent_request' || t === 'rts_agent_request'
            );
            const otherTags = record.tags.filter(
              (t) => !t.startsWith('carrier:') && t !== 'active_agent_request' && t !== 'rts_agent_request'
            );
            const statusLabel = statusTag === 'active_agent_request'
              ? 'Active Agent'
              : statusTag === 'rts_agent_request'
                ? 'RTS Agent'
                : null;

            return (
              <div className="space-y-3">
                {/* Carrier request banner — the most important info */}
                {(statusLabel || carrierTags.length > 0) && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                      <Tag className="w-3.5 h-3.5" /> Contracting Request
                    </h3>
                    {statusLabel && (
                      <p className="text-sm text-foreground">
                        <span className="font-bold text-amber-400">{statusLabel}</span>
                        {carrierTags.length > 0
                          ? ' requesting additional contracting:'
                          : ' — returned to contracting'}
                      </p>
                    )}
                    {carrierTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {carrierTags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20"
                          >
                            {t.replace('carrier:', '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Other tags */}
                {otherTags.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Tag className="w-3.5 h-3.5" /> Tags
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {otherTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-primary border border-blue-500/20"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Custom Fields */}
          {record.custom_fields &&
            Object.keys(record.custom_fields).length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <FileText className="w-3.5 h-3.5" /> Intake Information
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(record.custom_fields)
                    .filter(
                      ([, v]) => v !== null && v !== '' && v !== undefined
                    )
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-3 p-3 bg-background rounded-lg"
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {key}
                        </span>
                        <span className="text-sm text-foreground text-right break-words">
                          {typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Contact Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Contact Information
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {record.email && (
                <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground/80">{record.email}</span>
                </div>
              )}
              {record.phone && (
                <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground/80">{record.phone}</span>
                </div>
              )}
              {record.agency && (
                <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground/80">
                    {record.agency}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground/80">
                  In stage since {stageEnteredDate}
                </span>
              </div>
              {record.last_updated_by_display && (
                <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground/80">
                    Last updated by: <span className="font-medium text-foreground">{record.last_updated_by_display}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stage History */}
          <StageHistorySection pipelineId={record.id} />

          {/* Agent Step Completions Review */}
          {agentActionPending && (
            <AgentStepReviewPanel
              record={record}
              stageSteps={stageSteps}
              onReviewComplete={(remaining) => {
                const stillPending = remaining > 0;
                setAgentActionPending(stillPending);
                onRecordUpdated({
                  ...record,
                  agent_action_pending: stillPending,
                  agent_action_at: stillPending ? record.agent_action_at : undefined,
                });
              }}
            />
          )}

          {/* Writing Number Review */}
          {record.agent_id && (wnPendingCount > 0 || record.wn_pending_review) && (
            <WritingNumberReviewPanel
              agentId={record.agent_id}
              agentName={record.agent_name}
              pendingCount={wnPendingCount}
              pipelineTags={record.tags || []}
              pipelineRecordId={record.id}
              onReviewComplete={(remaining) => {
                setWnPendingCount(remaining);
                const isActiveRequest = (record.tags || []).includes('active_agent_request');
                const updatedRecord = {
                  ...record,
                  wn_pending_review: remaining > 0,
                  wn_pending_count: remaining,
                };
                // If active_agent_request and no pending left, reflect stage move
                if (isActiveRequest && remaining === 0) {
                  updatedRecord.stage = 'actively_selling';
                  updatedRecord.stage_entered_at = new Date().toISOString();
                  updatedRecord.tags = (record.tags || []).filter((t) => t !== 'active_agent_request');
                }
                onRecordUpdated(updatedRecord);
              }}
            />
          )}

          {/* Writing Numbers — READY stages only */}
          {isReadyStage && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <PenLine className="w-3.5 h-3.5" /> Writing Numbers
              </label>
              <input
                type="text"
                value={writingNumbers}
                onChange={(e) => setWritingNumbers(e.target.value)}
                placeholder="Enter writing numbers..."
                className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <StickyNote className="w-3.5 h-3.5" /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              rows={4}
              className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="text-sm text-emerald-400 font-medium">
                Saved!
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Stage History Section ────────────────────────────────────────────────────

interface StageHistoryEntry {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by_name: string;
  source: string;
  created_at: string;
}

function StageHistorySection({ pipelineId }: { pipelineId: string }) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || loaded || !portalSupabase) return;
    setLoading(true);
    portalSupabase
      .from('pipeline_stage_history')
      .select('id, from_stage, to_stage, changed_by_name, source, created_at')
      .eq('pipeline_id', pipelineId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setHistory((data as StageHistoryEntry[]) || []);
        setLoaded(true);
        setLoading(false);
      });
  }, [expanded, loaded, pipelineId]);

  const getStageLabel = (stage: string | null) => {
    if (!stage) return '—';
    return STAGES.find((s) => s.key === stage)?.label || stage;
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <History className="w-3.5 h-3.5" />
        Stage History
        {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {expanded && (
        <div className="space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No stage changes recorded yet.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg text-xs"
                >
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDate(entry.created_at)}
                  </span>
                  <span className="text-foreground/60">
                    {getStageLabel(entry.from_stage)}
                  </span>
                  <ArrowRightLeft className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground font-medium">
                    {getStageLabel(entry.to_stage)}
                  </span>
                  <span className="ml-auto text-muted-foreground whitespace-nowrap">
                    by {entry.changed_by_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
