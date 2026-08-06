/**
 * DroppableColumn — pipeline stage column with @dnd-kit droppable support.
 * Extracted from PipelineBoard for touch + pointer + keyboard drag-and-drop.
 */
import { useDroppable } from '@dnd-kit/core';
import { CheckCircle2 } from 'lucide-react';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { DraggableCard } from './DraggableCard';

interface DroppableColumnProps {
  stageKey: AgentPipelineStage;
  label: string;
  color: string;
  records: PortalPipelineRecord[];
  readyCount: number;
  stageSteps: PortalPipelineStageStep[];
  pushingIds: Set<string>;
  onCardClick: (record: PortalPipelineRecord) => void;
}

export function DroppableColumn({
  stageKey,
  label,
  color,
  records,
  readyCount,
  stageSteps,
  pushingIds,
  onCardClick,
}: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stageKey });

  return (
    <div
      ref={setNodeRef}
      className={`w-[220px] flex-shrink-0 rounded-xl border ${color} flex flex-col transition-all ${
        isOver ? 'ring-2 ring-blue-400 ring-offset-1 scale-[1.01]' : ''
      }`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80 truncate pr-2">
            {label}
          </h3>
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              stageKey === 'terminated'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-card/80 text-muted-foreground border border-border'
            }`}
          >
            {records.length}
          </span>
        </div>
        {readyCount > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> {readyCount} ready
          </div>
        )}
      </div>

      {/* Cards */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-2"
        style={{ maxHeight: 'var(--pipeline-col-height, min(calc(100vh - 380px), 540px))' }}
      >
        {records.map((record) => (
          <DraggableCard
            key={record.id}
            record={record}
            stageSteps={stageSteps}
            stageKey={stageKey}
            isPushing={pushingIds.has(record.id)}
            onClick={() => onCardClick(record)}
          />
        ))}
        {records.length === 0 && (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No agents
          </div>
        )}
      </div>
    </div>
  );
}
