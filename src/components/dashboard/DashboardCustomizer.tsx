/**
 * DashboardCustomizer — Slide-out panel for toggling and reordering
 * dashboard widgets.
 *
 * Per PRD spec:
 * - Toggle switches for each widget (except locked ones)
 * - Locked widgets show "Always shown" badge
 * - Drag handle (grip dots) for reordering
 * - Info callout: "Locked widgets cannot be removed..."
 * - Reset to defaults button
 */
import { useState, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { LayoutDashboard, Lock, GripVertical, Info, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardWidget } from '@/hooks/useDashboardLayout';

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: DashboardWidget[];
  onToggle: (widgetId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onReset: () => void;
}

export function DashboardCustomizer({
  open,
  onOpenChange,
  widgets,
  onToggle,
  onReorder,
  onReset,
}: DashboardCustomizerProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  function handleDragStart(index: number) {
    setDragIndex(index);
    dragRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragRef.current !== null && dragRef.current !== index) {
      onReorder(dragRef.current, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragRef.current = null;
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
    dragRef.current = null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} className="text-primary" />
            <SheetTitle className="text-base">Home dashboard layout</SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            Choose what appears on your home dashboard. Drag to reorder. Toggles apply immediately.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-border">
            {widgets.map((widget, index) => (
              <div
                key={widget.id}
                draggable={!widget.locked}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-center gap-3 px-5 py-3.5 transition-colors',
                  widget.locked && 'bg-primary/5',
                  dragIndex === index && 'opacity-50',
                  dragOverIndex === index && dragIndex !== index && 'bg-primary/10',
                )}
              >
                {/* Drag handle */}
                <div className={cn(
                  'flex-shrink-0 cursor-grab active:cursor-grabbing',
                  widget.locked && 'opacity-0 pointer-events-none',
                )}>
                  <GripVertical size={16} className="text-muted-foreground/40" />
                </div>

                {/* Widget info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {widget.locked && (
                      <Lock size={12} className="text-primary flex-shrink-0" />
                    )}
                    <span className={cn(
                      'text-sm font-semibold',
                      widget.locked ? 'text-primary' : 'text-foreground',
                    )}>
                      {widget.label}
                    </span>
                  </div>
                  <p className={cn(
                    'text-[11px] mt-0.5',
                    widget.locked ? 'text-primary/60' : 'text-muted-foreground/60',
                  )}>
                    {widget.description}
                  </p>
                </div>

                {/* Toggle / locked badge */}
                {widget.locked ? (
                  <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                    Always shown
                  </span>
                ) : (
                  <Switch
                    checked={widget.visible}
                    onCheckedChange={() => onToggle(widget.id)}
                    className="flex-shrink-0"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Info callout */}
          <div className="mx-5 mt-4 p-3 rounded-lg bg-secondary/50 flex items-start gap-2.5">
            <Info size={14} className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Locked widgets cannot be removed. They surface the work and quality signals
              FYM monitors most closely at the management tier.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw size={12} /> Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
