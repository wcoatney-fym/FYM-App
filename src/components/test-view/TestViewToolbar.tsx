/**
 * TestViewToolbar — floating stage control bar that overlays the agent
 * contracting page when an admin is using the Test Agent View.
 *
 * Lets the admin walk through pipeline stages to demo what agents see
 * at each step. Only visible when the test view store is active.
 *
 * Features:
 * - Stage selector pills
 * - Previous / Next buttons
 * - Reset to start button
 * - Post-RTS toggle
 */
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  X,
} from 'lucide-react';
import { AGENT_STAGES } from '@/hooks/useAgentPipeline';
import { useTestViewStore } from '@/store/test-view-store';

export function TestViewToolbar() {
  const { active, stageIndex, setStage, deactivate } = useTestViewStore();

  if (!active) return null;

  const handlePrev = () => {
    const newIdx = Math.max(0, stageIndex - 1);
    setStage(AGENT_STAGES[newIdx].key, newIdx);
  };

  const handleNext = () => {
    const newIdx = Math.min(AGENT_STAGES.length - 1, stageIndex + 1);
    setStage(AGENT_STAGES[newIdx].key, newIdx);
  };

  const handleReset = () => {
    setStage(AGENT_STAGES[0].key, 0);
  };

  const handleJump = (idx: number) => {
    setStage(AGENT_STAGES[idx].key, idx);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]">
      <div className="bg-card/95 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-2xl px-4 py-3 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-purple-300">Test View</span>
            <span className="text-[10px] text-muted-foreground">
              Stage {stageIndex + 1}/{AGENT_STAGES.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-bold hover:bg-red-500/20 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={deactivate}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              title="Close test view controls"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stage pills + nav */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            disabled={stageIndex === 0}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 overflow-x-auto">
            {AGENT_STAGES.map((stage, idx) => (
              <button
                key={stage.key}
                onClick={() => handleJump(idx)}
                className={`px-2 py-1 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
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
            disabled={stageIndex >= AGENT_STAGES.length - 1}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
