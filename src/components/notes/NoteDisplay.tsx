/**
 * NoteDisplay — Renders a manager note inline on Needs Attention cards,
 * Agent Detail pages, and policy detail views.
 *
 * Per PRD prototype:
 * - Italic body text with author name and relative timestamp
 * - "Acknowledge" button for agents
 * - Acknowledged state shown as "✓ agent acknowledged <date>"
 * - Subtle background strip below the parent card
 */
import { useState } from 'react';
import { MessageSquare, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type ManagerNote, acknowledgeNote, formatNoteTime } from '@/lib/notes-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { toast } from 'sonner';

interface NoteDisplayProps {
  note: ManagerNote;
  /** Compact mode for inline display on attention cards */
  compact?: boolean;
  /** Called after acknowledgement */
  onAcknowledged?: () => void;
}

export function NoteDisplay({ note, compact = false, onAcknowledged }: NoteDisplayProps) {
  const { isAgent } = useEffectiveAuth();
  const [acknowledging, setAcknowledging] = useState(false);
  const isAcknowledged = !!note.acknowledged_at;

  async function handleAcknowledge() {
    setAcknowledging(true);
    try {
      const ok = await acknowledgeNote(note.id);
      if (ok) {
        toast.success('Note acknowledged');
        onAcknowledged?.();
      } else {
        toast.error('Failed to acknowledge');
      }
    } catch {
      toast.error('Failed to acknowledge');
    } finally {
      setAcknowledging(false);
    }
  }

  if (compact) {
    return (
      <div className="flex items-start gap-2.5 px-4 py-2 bg-secondary/30 border-t border-border/30">
        <MessageSquare size={14} className="text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs italic text-muted-foreground leading-relaxed">
            "{note.body}"
            {' — '}
            <span className="font-semibold text-foreground not-italic">
              {note.author_name || 'Manager'}
            </span>
            {' · '}
            <span className="not-italic">{formatNoteTime(note.created_at)}</span>
          </p>
          {isAcknowledged && (
            <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
              <Check size={10} />
              agent acknowledged {formatNoteTime(note.acknowledged_at!)}
            </p>
          )}
        </div>
        {isAgent && !isAcknowledged && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 px-2 flex-shrink-0"
            onClick={handleAcknowledge}
            disabled={acknowledging}
          >
            Acknowledge
          </Button>
        )}
      </div>
    );
  }

  // Full display mode (Agent Detail, policy detail)
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded bg-primary/10 flex-shrink-0">
          <MessageSquare size={14} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-foreground">
              {note.author_name || 'Manager'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatNoteTime(note.created_at)}
            </span>
            {note.policy_number && (
              <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                {note.policy_number}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            "{note.body}"
          </p>
          {isAcknowledged && (
            <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1">
              <Check size={10} />
              Acknowledged {formatNoteTime(note.acknowledged_at!)}
            </p>
          )}
          {isAgent && !isAcknowledged && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-6 px-2 mt-2"
              onClick={handleAcknowledge}
              disabled={acknowledging}
            >
              Acknowledge
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders a list of notes with an optional "Add note" trigger */
interface NoteListProps {
  notes: ManagerNote[];
  compact?: boolean;
  onRefresh?: () => void;
  emptyMessage?: string;
}

export function NoteList({ notes, compact = false, onRefresh, emptyMessage }: NoteListProps) {
  if (notes.length === 0 && !emptyMessage) return null;

  if (notes.length === 0 && emptyMessage) {
    return (
      <div className={compact ? 'px-4 py-2 bg-secondary/20 border-t border-border/30' : 'p-3'}>
        <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
          <MessageSquare size={12} />
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? 'divide-y divide-border/20' : 'space-y-2'}>
      {notes.map(note => (
        <NoteDisplay
          key={note.id}
          note={note}
          compact={compact}
          onAcknowledged={onRefresh}
        />
      ))}
    </div>
  );
}
