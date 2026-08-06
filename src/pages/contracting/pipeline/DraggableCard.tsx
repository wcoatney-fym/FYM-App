/**
 * DraggableCard — pipeline agent card with @dnd-kit draggable support.
 * Extracted from PipelineBoard for touch + pointer + keyboard drag-and-drop.
 *
 * When rendered inside <DragOverlay>, pass `isOverlay` to apply the ghost
 * styling (rotated, scaled, ring highlight) and skip the useDraggable hook.
 */
import { useDraggable } from '@dnd-kit/core';
import {
  Clock,
  User,
  Building2,
  PenLine,
  Loader2,
  CheckCircle2,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { timeAgo } from '@/lib/contracting/helpers';
import { ProgressRing } from './ProgressRing';
import { computeProgress, stageHealth } from './pipelineProgress';

const HEALTH_BORDER: Record<string, string> = {
  fresh: 'border-border',
  aging: 'border-amber-500/30',
  stalled: 'border-red-500/30',
};

interface DraggableCardProps {
  record: PortalPipelineRecord;
  stageSteps: PortalPipelineStageStep[];
  stageKey: AgentPipelineStage;
  isPushing: boolean;
  onClick: () => void;
  /** True when rendered inside DragOverlay (ghost card) */
  isOverlay?: boolean;
}

export function DraggableCard({
  record,
  stageSteps,
  stageKey,
  isPushing,
  onClick,
  isOverlay = false,
}: DraggableCardProps) {
  // Only use the draggable hook for the real card, not the overlay clone
  const { attributes, listeners, setNodeRef, isDragging } = isOverlay
    ? { attributes: {}, listeners: {}, setNodeRef: undefined, isDragging: false }
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useDraggable({ id: record.id });

  const progress = computeProgress(record, stageSteps);
  const health = stageHealth(record);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Don't open modal if we're starting a drag
        if (!isDragging) onClick();
        e.stopPropagation();
      }}
      className={`w-full text-left bg-card rounded-lg border p-3 glow-sm hover:glow-primary transition-all touch-none ${
        isOverlay
          ? 'rotate-2 scale-105 ring-2 ring-blue-400 shadow-xl opacity-90'
          : 'cursor-grab active:cursor-grabbing'
      } ${
        progress.allComplete
          ? 'border-emerald-500/30 ring-1 ring-emerald-200 shadow-emerald-100'
          : HEALTH_BORDER[health]
      } ${isDragging ? 'opacity-50 scale-95' : ''} ${
        isPushing ? 'animate-pulse' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground line-clamp-2 leading-tight flex-1">
          {record.agent_name || 'Unnamed'}
        </span>
        {progress.total > 0 && (
          <ProgressRing
            fraction={progress.fraction}
            completed={progress.completedCount}
            total={progress.total}
            complete={progress.allComplete}
          />
        )}
      </div>

      {progress.total > 0 &&
        (progress.allComplete ? (
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Ready to advance
          </div>
        ) : progress.nextStep ? (
          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="w-3 h-3 text-blue-400 flex-shrink-0" />
            <span className="truncate">Next: {progress.nextStep.label}</span>
          </div>
        ) : null)}

      {record.agency && (
        <div className="flex items-center gap-1.5 mt-2">
          <Building2 className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground truncate">
            {record.agency}
          </span>
        </div>
      )}

      {record.tags && record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {record.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-primary border border-blue-500/20 truncate max-w-[90px]"
            >
              {tag}
            </span>
          ))}
          {record.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{record.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 flex-wrap gap-y-0.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {timeAgo(record.stage_entered_at)}
          </span>
          {record.updated_by_source && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                record.updated_by_source === 'training_hub'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : record.updated_by_source === 'contracting_portal'
                    ? 'bg-cyan-500/10 text-cyan-400 border-blue-500/20'
                    : record.updated_by_source === 'ghl_webhook'
                      ? 'bg-amber-500/10 text-amber-400 border-orange-500/20'
                      : 'bg-secondary text-muted-foreground border-border'
              }`}
            >
              {record.updated_by_source === 'training_hub'
                ? 'Training'
                : record.updated_by_source === 'contracting_portal'
                  ? 'Contracting'
                  : record.updated_by_source === 'ghl_webhook'
                    ? 'GHL'
                    : record.updated_by_source}
            </span>
          )}
        </div>
        {isPushing ? (
          <Loader2 className="w-3 h-3 text-primary animate-spin" />
        ) : record.wn_pending_review ? (
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
            <FileCheck className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-amber-400 font-bold">
              {record.wn_pending_count > 0
                ? `${record.wn_pending_count} WN`
                : 'WN'}
            </span>
          </div>
        ) : (stageKey === 'hip_broker_ready' ||
            stageKey === 'hip_career_ready') &&
          record.writing_numbers ? (
          <div className="flex items-center gap-1">
            <PenLine className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] text-emerald-400 font-medium truncate max-w-[60px]">
              {record.writing_numbers}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
