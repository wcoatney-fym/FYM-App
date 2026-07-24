/**
 * PipelineDetailModal — detail/edit modal for a single agent pipeline record.
 * Ported from CRM Portal's AgentPipelineDetailModal.
 */
import { useState } from 'react';
import {
  X,
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
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { STAGES } from './PipelineBoard';
import { computeProgress } from './pipelineProgress';
// WritingNumberReviewPanel — commented out until agent_pipeline.agent_id exists
// import { WritingNumberReviewPanel } from './WritingNumberReviewPanel';

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
  // wnPendingCount — commented out until agent_pipeline.agent_id exists
  // and WritingNumberReviewPanel can be re-enabled
  // const [wnPendingCount, setWnPendingCount] = useState(record.wn_pending_count ?? 0);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-slate-200 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <User className="w-5 h-5 text-[#1e3a5f]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {record.agent_name || 'Unnamed Agent'}
              </h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  record.stage === 'terminated'
                    ? 'bg-red-100 text-red-700'
                    : record.stage === 'actively_selling'
                      ? 'bg-amber-100 text-amber-700'
                      : record.stage.includes('ready')
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-[#1e3a5f]'
                }`}
              >
                {stageLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Move Stage */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ArrowRightLeft className="w-3.5 h-3.5" /> Move to Stage
            </label>
            <div className="relative">
              <select
                value={pendingStage}
                onChange={(e) =>
                  handleStageSelect(e.target.value as AgentPipelineStage)
                }
                disabled={movingStage}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent appearance-none bg-white disabled:opacity-50"
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
                  <Loader2 className="w-4 h-4 animate-spin text-[#1e3a5f]" />
                </div>
              )}
            </div>
          </div>

          {/* Step Checklist */}
          {progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <ListChecks className="w-3.5 h-3.5" /> Steps
                </h3>
                <span
                  className={`text-xs font-semibold ${
                    progress.allComplete ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {progress.completedCount}/{progress.total} complete
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progress.allComplete ? 'bg-emerald-500' : 'bg-[#1e3a5f]'
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
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${
                          doneAt
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300'
                        }`}
                      >
                        {togglingStep === step.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                        ) : doneAt ? (
                          <Check className="w-3.5 h-3.5 text-white" />
                        ) : null}
                      </span>
                      <span
                        className={`text-sm flex-1 ${
                          doneAt ? 'text-slate-700' : 'text-slate-800'
                        }`}
                      >
                        {step.label}
                      </span>
                      {doneAt && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
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

          {/* Tags */}
          {record.tags && record.tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Tag className="w-3.5 h-3.5" /> Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {record.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#1e3a5f] border border-blue-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Custom Fields */}
          {record.custom_fields &&
            Object.keys(record.custom_fields).length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                        className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-lg"
                      >
                        <span className="text-xs font-medium text-slate-500">
                          {key}
                        </span>
                        <span className="text-sm text-slate-800 text-right break-words">
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Contact Information
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {record.email && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{record.email}</span>
                </div>
              )}
              {record.phone && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{record.phone}</span>
                </div>
              )}
              {record.agency && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">
                    {record.agency}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-700">
                  In stage since {stageEnteredDate}
                </span>
              </div>
            </div>
          </div>

          {/* Writing Number Review
           * TODO: agent_id will be added to agent_pipeline during the
           * portal → rcbzag migration. Until then, WritingNumberReviewPanel
           * is gated behind a pipeline_agent_id that doesn't exist yet.
           * Uncomment when agent_pipeline.agent_id is available.
           */}
          {/* (wnPendingCount > 0 || record.wn_pending_review) && (
              <WritingNumberReviewPanel
                agentId={???}
                agentName={record.agent_name}
                pendingCount={wnPendingCount}
                onReviewComplete={(remaining) => {
                  setWnPendingCount(remaining);
                  onRecordUpdated({
                    ...record,
                    wn_pending_review: remaining > 0,
                    wn_pending_count: remaining,
                  });
                }}
              />
            )}

          {/* Writing Numbers — READY stages only */}
          {isReadyStage && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <PenLine className="w-3.5 h-3.5" /> Writing Numbers
              </label>
              <input
                type="text"
                value={writingNumbers}
                onChange={(e) => setWritingNumbers(e.target.value)}
                placeholder="Enter writing numbers..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <StickyNote className="w-3.5 h-3.5" /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              rows={4}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="text-sm text-emerald-600 font-medium">
                Saved!
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium text-sm hover:bg-[#162d4a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
}
