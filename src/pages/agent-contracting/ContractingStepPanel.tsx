/**
 * ContractingStepPanel — shows the current stage's checklist steps
 * with agent-side completion + pending/declined status.
 *
 * Charlie (2026-08-20): agent can mark a step complete on their side
 * but needs to be approved on the admin side. If declined, marked
 * incomplete again on the agent's side.
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalPipelineRecord, PortalPipelineStageStep } from '@/lib/contracting/types';
import type { StepCompletion } from '@/hooks/useAgentPipeline';
import type { StepProgress } from '@/pages/contracting/pipeline/pipelineProgress';
import { AGENT_STAGES } from '@/hooks/useAgentPipeline';

interface ContractingStepPanelProps {
  pipelineRecord: PortalPipelineRecord;
  _stageSteps?: PortalPipelineStageStep[];
  stepCompletions: StepCompletion[];
  progress: StepProgress;
  onSubmitStep: (stepId: string) => Promise<boolean>;
}

type StepStatus = 'completed' | 'pending_review' | 'declined' | 'available' | 'locked';

function getStepStatus(
  step: PortalPipelineStageStep,
  completedSteps: Record<string, string>,
  stepCompletions: StepCompletion[],
): StepStatus {
  const completionValue = completedSteps[step.id];

  // Admin-approved completion
  if (completionValue && !completionValue.startsWith('pending:')) {
    return 'completed';
  }

  // Agent submitted, pending admin review
  if (completionValue?.startsWith('pending:')) {
    return 'pending_review';
  }

  // Check if there's a declined completion
  const declined = stepCompletions.find(
    (c) => c.step_id === step.id && c.status === 'declined'
  );
  if (declined) return 'declined';

  return 'available';
}

export function ContractingStepPanel({
  pipelineRecord,
  stepCompletions,
  progress,
  onSubmitStep,
}: ContractingStepPanelProps) {
  const [submittingStep, setSubmittingStep] = useState<string | null>(null);

  const stageLabel =
    AGENT_STAGES.find((s) => s.key === pipelineRecord.stage)?.label ??
    pipelineRecord.stage;

  const handleMarkComplete = async (stepId: string) => {
    setSubmittingStep(stepId);
    await onSubmitStep(stepId);
    setSubmittingStep(null);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
          Current Step: {stageLabel}
        </p>
        {/* Progress summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-full max-w-[200px] h-2 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progress.fraction * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {progress.completedCount}/{progress.total}
            </span>
          </div>
          {progress.allComplete && (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All steps complete
            </span>
          )}
        </div>

        {/* Step checklist */}
        <div className="space-y-2">
          {progress.steps.map((step) => {
            const status = getStepStatus(
              step,
              pipelineRecord.completed_steps || {},
              stepCompletions
            );

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all',
                  status === 'completed' &&
                    'border-emerald-500/20 bg-emerald-500/5',
                  status === 'pending_review' &&
                    'border-amber-500/20 bg-amber-500/5',
                  status === 'declined' &&
                    'border-red-500/20 bg-red-500/5',
                  status === 'available' &&
                    'border-border/30 bg-card hover:border-primary/30 hover:bg-primary/5',
                  status === 'locked' &&
                    'border-border/20 bg-muted/10 opacity-50'
                )}
              >
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : status === 'pending_review' ? (
                    <Clock className="w-5 h-5 text-amber-400" />
                  ) : status === 'declined' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40" />
                  )}
                </div>

                {/* Step label + status text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      status === 'completed' && 'text-emerald-400',
                      status === 'pending_review' && 'text-amber-300',
                      status === 'declined' && 'text-red-400',
                      status === 'available' && 'text-foreground',
                      status === 'locked' && 'text-muted-foreground/40'
                    )}
                  >
                    {step.label}
                  </p>
                  {status === 'pending_review' && (
                    <p className="text-[11px] text-amber-400/70 mt-0.5">
                      Submitted — awaiting admin confirmation
                    </p>
                  )}
                  {status === 'declined' && (
                    <p className="text-[11px] text-red-400/70 mt-0.5">
                      Declined — please review and resubmit
                    </p>
                  )}
                </div>

                {/* Action button */}
                {(status === 'available' || status === 'declined') && (
                  <button
                    onClick={() => handleMarkComplete(step.id)}
                    disabled={submittingStep === step.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    {submittingStep === step.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    {status === 'declined' ? 'Resubmit' : 'Mark Complete'}
                  </button>
                )}
              </div>
            );
          })}

          {progress.steps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No checklist items for this stage yet. Your admin is setting things up.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
