/**
 * ContractingProgressBar — visual stepper showing the agent's position
 * in the contracting pipeline.
 *
 * Completed stages: green check
 * Current stage: pulsing blue
 * Locked stages: gray lock
 *
 * Charlie (2026-08-20): steps unlock as they make it through the process.
 */
import { cn } from '@/lib/utils';
import { Check, Lock, Circle, Badge } from 'lucide-react';
import {
  AGENT_STAGES,
} from '@/hooks/useAgentPipeline';
import type { AgentPipelineStage } from '@/lib/contracting/types';

/** Agent-visible stages for the progress bar (excludes terminated) */
const PROGRESS_STAGES = AGENT_STAGES.filter((s) => s.key !== 'terminated');

interface ContractingProgressBarProps {
  currentStage: AgentPipelineStage;
  currentStageIndex: number;
  isAdditionalContracting?: boolean;
  earnedStatusLabel?: string | null;
}

export function ContractingProgressBar({
  currentStage: _currentStage,
  currentStageIndex,
  isAdditionalContracting,
  earnedStatusLabel,
}: ContractingProgressBarProps) {
  // Build the visible stages for the progress bar:
  // - Show the agent's entry stage (hip_broker OR hip_career), not both
  // - Exclude terminated (not part of forward progress)
  // Determine the agent's entry path (broker vs career).
  // If currently in hip_career, use it; otherwise default to hip_broker.
  const resolvedEntry: 'hip_broker' | 'hip_career' =
    _currentStage === 'hip_career' ? 'hip_career' : 'hip_broker';

  const visibleStages = PROGRESS_STAGES.filter((s) => {
    // Show only the agent's entry stage, not the other
    if (s.key === 'hip_broker' && resolvedEntry === 'hip_career') return false;
    if (s.key === 'hip_career' && resolvedEntry === 'hip_broker') return false;
    return true;
  });

  // Recalculate index within visible stages
  const visibleIndex = visibleStages.findIndex((s) => s.key === _currentStage);
  const effectiveIndex = visibleIndex >= 0 ? visibleIndex : currentStageIndex;

  return (
    <div className="relative">
      {/* Additional contracting banner */}
      {isAdditionalContracting && earnedStatusLabel && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Badge className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-400">
            {earnedStatusLabel} Agent
          </span>
          <span className="text-xs text-muted-foreground">
            — requesting additional carrier contracting
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between relative">
          {/* Connecting line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-border/30 z-0" />
          <div
            className="absolute top-5 left-0 h-0.5 bg-emerald-500/60 z-0 transition-all duration-700"
            style={{
              width: `${Math.max(0, (effectiveIndex / (visibleStages.length - 1)) * 100)}%`,
            }}
          />

          {visibleStages.map((stage, idx) => {
            const isCompleted = idx < effectiveIndex;
            const isCurrent = idx === effectiveIndex;
            const isLocked = idx > effectiveIndex;

            return (
              <div
                key={stage.key}
                className="flex flex-col items-center relative z-10"
              >
                {/* Step indicator */}
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2',
                    isCompleted &&
                      'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
                    isCurrent &&
                      'bg-primary/20 border-primary/60 text-primary animate-pulse shadow-[0_0_12px_hsl(199_89%_48%_/_0.3)]',
                    isLocked &&
                      'bg-muted/20 border-border/30 text-muted-foreground/40'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Circle className="w-5 h-5 fill-current" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-[11px] font-medium mt-2 text-center whitespace-nowrap',
                    isCompleted && 'text-emerald-400',
                    isCurrent && 'text-primary font-bold',
                    isLocked && 'text-muted-foreground/40'
                  )}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
