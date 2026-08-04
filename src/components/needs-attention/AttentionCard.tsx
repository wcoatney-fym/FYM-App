/**
 * AttentionCard — Individual at-risk policy card with tri-state action buttons.
 *
 * Displays urgency-ranked policy info with Got it / Working / Done buttons.
 * Action state is persisted to `atrisk_tasks` in the FYM App DB.
 */
import { useState, useEffect } from 'react';
import { ChevronRight, Zap, AlertTriangle, PauseCircle, MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManagerNoteComposer } from '@/components/notes/ManagerNoteComposer';
import { NoteDisplay } from '@/components/notes/NoteDisplay';
import { fetchNotesForPolicy, type ManagerNote } from '@/lib/notes-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActionState = 'none' | 'got_it' | 'working' | 'done';

export interface AttentionPolicy {
  policy_number: string;
  client_name: string | null;
  product_type: string;
  plan_premium: number;
  flag_type: string | null;
  days_idle: number;
  status: string;
  paid_to_date: string | null;
  policy_effective_date: string | null;
  draft_count: number;
  agent_writing_number: string | null;
  agency_id: string;
  /** Current action state from atrisk_tasks */
  action_state: ActionState;
}

interface AttentionCardProps {
  policy: AttentionPolicy;
  showAgent?: boolean;
  onActionChange: (policyNumber: string, state: ActionState) => void;
  /** Pre-loaded notes for this policy (optional — fetches own if not provided) */
  notes?: ManagerNote[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function urgencyLevel(daysIdle: number): 'final7' | 'critical' | 'warning' | 'watch' {
  if (daysIdle >= 38) return 'final7';
  if (daysIdle >= 30) return 'critical';
  if (daysIdle >= 14) return 'warning';
  return 'watch';
}

function daysRemaining(daysIdle: number): number {
  return Math.max(0, 45 - daysIdle);
}

function flagLabel(flagType: string | null): string {
  if (!flagType) return 'At Risk';
  switch (flagType.toLowerCase()) {
    case 'future_term': return 'Future Term';
    case 'pended': return 'Pended';
    case 'suspended': return 'Suspended';
    case 'at_risk': return 'At Risk';
    default: return flagType;
  }
}

function flagIcon(flagType: string | null) {
  switch (flagType?.toLowerCase()) {
    case 'future_term': return AlertTriangle;
    case 'pended': return PauseCircle;
    default: return AlertTriangle;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function AttentionCard({ policy, showAgent = false, onActionChange, notes: externalNotes }: AttentionCardProps) {
  const [localState, setLocalState] = useState<ActionState>(policy.action_state);
  const { isAgent } = useEffectiveAuth();
  const [noteOpen, setNoteOpen] = useState(false);
  const [notes, setNotes] = useState<ManagerNote[]>(externalNotes ?? []);
  const urgency = urgencyLevel(policy.days_idle);
  const remaining = daysRemaining(policy.days_idle);
  const isFinal7 = urgency === 'final7';
  const FlagIcon = flagIcon(policy.flag_type);

  // Load notes for this policy if not provided externally
  useEffect(() => {
    if (externalNotes) { setNotes(externalNotes); return; }
    fetchNotesForPolicy(policy.policy_number).then(setNotes);
  }, [policy.policy_number, externalNotes]);

  const handleAction = (state: ActionState) => {
    const newState = localState === state ? 'none' : state;
    setLocalState(newState);
    onActionChange(policy.policy_number, newState);
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-colors',
        isFinal7 && 'border-l-[3px] border-l-red-500 border-red-500/30',
        urgency === 'critical' && 'border-l-[3px] border-l-red-500/60',
        urgency === 'warning' && 'border-l-[3px] border-l-amber-500/60',
        urgency === 'watch' && 'border-border',
      )}
    >
      {/* Final 7 days banner */}
      {isFinal7 && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-red-500/10 border-b border-red-500/20 rounded-t-xl">
          <Zap size={12} className="text-red-400" />
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-red-400">
            Final {remaining} days of grace · highest urgency
          </span>
        </div>
      )}

      <div className="p-4 flex items-center gap-4">
        {/* Flag info */}
        <div className="w-[100px] flex-shrink-0">
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',
            urgency === 'final7' || urgency === 'critical'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-amber-500/10 text-amber-400',
          )}>
            <FlagIcon size={10} />
            {flagLabel(policy.flag_type)}
          </span>
          <div className={cn(
            'text-[10.5px] font-bold font-mono mt-1',
            urgency === 'final7' || urgency === 'critical' ? 'text-red-400' : 'text-amber-400',
          )}>
            Day {policy.days_idle}/45
          </div>
        </div>

        {/* Client & policy info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground truncate">
              {policy.client_name || 'Unknown'}
            </span>
            {localState !== 'none' && (
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                localState === 'got_it' && 'bg-muted text-muted-foreground',
                localState === 'working' && 'bg-amber-500/10 text-amber-400',
                localState === 'done' && 'bg-emerald-500/10 text-emerald-400',
              )}>
                {localState === 'got_it' ? '✓ Got it' : localState === 'working' ? 'Working' : '✓ Done'}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            <span className="font-mono font-semibold text-foreground/70">{policy.product_type}</span>
            {' · '}
            {policy.status}
            {showAgent && policy.agent_writing_number && (
              <span className="text-muted-foreground/50"> · Agent {policy.agent_writing_number}</span>
            )}
          </div>
        </div>

        {/* Premium */}
        <div className="text-right flex-shrink-0 w-[80px]">
          <div className="font-bold font-mono text-sm">
            ${Math.round(policy.plan_premium * 12).toLocaleString()}
          </div>
          <div className="text-[10.5px] text-muted-foreground/50">annual</div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => handleAction('got_it')}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
              localState === 'got_it'
                ? 'bg-slate-600 text-white border-slate-600'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            {localState === 'got_it' ? '✓ Got it' : 'Got it'}
          </button>
          <button
            onClick={() => handleAction('working')}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
              localState === 'working'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            Working
          </button>
          <button
            onClick={() => handleAction('done')}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
              localState === 'done'
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            Done
          </button>
        </div>

        {/* Note button (managers/admins only) */}
        {!isAgent && (
          <button
            onClick={() => setNoteOpen(true)}
            className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-primary transition-colors flex-shrink-0"
            title="Add manager note"
          >
            <MessageSquarePlus size={14} />
          </button>
        )}

        <ChevronRight size={16} className="text-muted-foreground/30 flex-shrink-0" />
      </div>

      {/* Inline notes display */}
      {notes.length > 0 && (
        <div className="border-t border-border/30">
          {notes.slice(0, 2).map(note => (
            <NoteDisplay
              key={note.id}
              note={note}
              compact
              onAcknowledged={() => fetchNotesForPolicy(policy.policy_number).then(setNotes)}
            />
          ))}
          {notes.length > 2 && (
            <div className="px-4 py-1 text-[10px] text-muted-foreground/50">
              +{notes.length - 2} more notes
            </div>
          )}
        </div>
      )}

      {/* Note composer modal */}
      <ManagerNoteComposer
        open={noteOpen}
        onOpenChange={setNoteOpen}
        context={{
          subject: `${policy.client_name || 'Unknown'} · ${policy.product_type}`,
          policyNumber: policy.policy_number,
          agentWritingNumber: policy.agent_writing_number ?? undefined,
          agentName: policy.agent_writing_number ?? undefined,
        }}
        onNoteCreated={() => fetchNotesForPolicy(policy.policy_number).then(setNotes)}
      />
    </div>
  );
}
