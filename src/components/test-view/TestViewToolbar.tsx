/**
 * TestViewToolbar — floating stage control bar for the test agent view.
 *
 * Advances/resets the REAL pipeline record for Tester Mitchell.
 * Changes are visible on the admin pipeline board in real time.
 *
 * Features:
 * - Stage indicator showing current position
 * - Previous / Next buttons (update real DB)
 * - Reset to hip_broker button
 * - Close button (exits test mode)
 */
import { useState } from 'react';
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  X,
  Loader2,
} from 'lucide-react';
import { AGENT_STAGES, getStageIndex } from '@/hooks/useAgentPipeline';
import { useTestViewStore } from '@/store/test-view-store';
import { useViewAsStore } from '@/store/view-as-store';
import type { AgentPipelineStage } from '@/lib/contracting/types';

interface TestViewToolbarProps {
  currentStage: AgentPipelineStage | undefined;
  onAdvanceStage: (newStage: AgentPipelineStage) => Promise<void>;
}

export function TestViewToolbar({ currentStage, onAdvanceStage }: TestViewToolbarProps) {
  const { active, deactivate } = useTestViewStore();
  const viewAs = useViewAsStore();
  const [updating, setUpdating] = useState(false);

  if (!active) return null;

  const stageIndex = currentStage ? getStageIndex(currentStage) : 0;

  const handlePrev = async () => {
    const newIdx = Math.max(0, stageIndex - 1);
    if (newIdx === stageIndex) return;
    setUpdating(true);
    await onAdvanceStage(AGENT_STAGES[newIdx].key);
    setUpdating(false);
  };

  const handleNext = async () => {
    const newIdx = Math.min(AGENT_STAGES.length - 1, stageIndex + 1);
    if (newIdx === stageIndex) return;
    setUpdating(true);
    await onAdvanceStage(AGENT_STAGES[newIdx].key);
    setUpdating(false);
  };

  const handleReset = async () => {
    setUpdating(true);
    await onAdvanceStage('hip_broker');
    setUpdating(false);
  };

  const handleJump = async (idx: number) => {
    if (idx === stageIndex) return;
    setUpdating(true);
    await onAdvanceStage(AGENT_STAGES[idx].key);
    setUpdating(false);
  };

  const handleClose = () => {
    deactivate();
    viewAs.deactivate();
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]">
      <div className="bg-card/95 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-2xl px-4 py-3 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-purple-300">Test View — Tester Mitchell</span>
            <span className="text-[10px] text-muted-foreground">
              Stage {stageIndex + 1}/{AGENT_STAGES.length}
            </span>
            {updating && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReset}
              disabled={updating || stageIndex === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-bold hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              title="Exit test view"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stage pills + nav */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            disabled={stageIndex === 0 || updating}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 overflow-x-auto">
            {AGENT_STAGES.map((stage, idx) => (
              <button
                key={stage.key}
                onClick={() => handleJump(idx)}
                disabled={updating}
                className={`px-2 py-1 rounded text-[10px] font-semibold whitespace-nowrap transition-colors disabled:cursor-wait ${
                  idx === stageIndex
                    ? 'bg-primary text-primary-foreground'
                    : idx < stageIndex
                      ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {stage.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleNext}
            disabled={stageIndex >= AGENT_STAGES.length - 1 || updating}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
