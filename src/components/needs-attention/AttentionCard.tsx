/**
 * AttentionCard — Compact at-risk policy row with urgency color bar and tri-state actions.
 *
 * Redesigned from bloated cards to dense, scannable table rows.
 * Urgency is conveyed via a left color bar (red → amber → muted) instead of
 * repeated banners. Actions are inline pill buttons. Premium is prominent.
 */
import { useState, useEffect } from 'react';
import { MessageSquarePlus, ChevronDown, ChevronUp } from 'lucide-react';
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
  action_state: ActionState;
}

interface AttentionCardProps {
  policy: AttentionPolicy;
  showAgent?: boolean;
  onActionChange: (policyNumber: string, state: ActionState) => void;
  notes?: ManagerNote[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function urgencyLevel(daysIdle: number): 'final' | 'critical' | 'warning' | 'watch' {
  if (daysIdle >= 38) return 'final';
  if (daysIdle >= 30) return 'critical';
  if (daysIdle >= 14) return 'warning';
  return 'watch';
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

const urgencyBarColor = {
  final: 'bg-red-500',
  critical: 'bg-red-500/70',
  warning: 'bg-amber-500',
  watch: 'bg-blue-500/50',
} as const;

const urgencyDayColor = {
  final: 'text-red-400',
  critical: 'text-red-400/80',
  warning: 'text-amber-400',
  watch: 'text-muted-foreground',
} as const;

const urgencyBgHover = {
  final: 'hover:bg-red-500/[0.03]',
  critical: 'hover:bg-red-500/[0.02]',
  warning: 'hover:bg-amber-500/[0.02]',
  watch: 'hover:bg-muted/30',
} as const;

// ── Component ──────────────────────────────────────────────────────────────

export function AttentionCard({ policy, showAgent = false, onActionChange, notes: externalNotes }: AttentionCardProps) {
  const [localState, setLocalState] = useState<ActionState>(policy.action_state);
  const { isAgent } = useEffectiveAuth();
  const [noteOpen, setNoteOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<ManagerNote[]>(externalNotes ?? []);
  const urgency = urgencyLevel(policy.days_idle);
  const daysLeft = Math.max(0, 45 - policy.days_idle);
  const annualPremium = policy.plan_premium * 12;

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
    <div className={cn(
      'group border-b border-border/40 transition-colors',
      urgencyBgHover[urgency],
    )}>
      {/* Main row */}
      <div className="flex items-center gap-0 py-2.5 px-0">
        {/* Urgency color bar */}
        <div className={cn('w-1 self-stretch rounded-full flex-shrink-0', urgencyBarColor[urgency])} />

        {/* Days counter */}
        <div className={cn(
          'w-[60px] flex-shrink-0 text-center pl-3',
          urgencyDayColor[urgency],
        )}>
          <div className="text-sm font-bold font-mono leading-tight">
            {policy.days_idle >= 45 ? '45+' : policy.days_idle}
          </div>
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">
            {daysLeft === 0 ? 'past due' : `${daysLeft}d left`}
          </div>
        </div>

        {/* Flag pill */}
        <div className="w-[80px] flex-shrink-0 px-1">
          <span className={cn(
            'inline-block px-2 py-0.5 rounded text-[10px] font-semibold leading-tight',
            urgency === 'final' || urgency === 'critical'
              ? 'bg-red-500/10 text-red-400'
              : urgency === 'warning'
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-muted text-muted-foreground',
          )}>
            {flagLabel(policy.flag_type)}
          </span>
        </div>

        {/* Client name + meta */}
        <div className="flex-1 min-w-0 px-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] text-foreground truncate">
              {policy.client_name || 'Unknown'}
            </span>
            {notes.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                {notes.length} note{notes.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {policy.product_type}
            {showAgent && policy.agent_writing_number && (
              <> · <span className="font-mono">{policy.agent_writing_number}</span></>
            )}
            {' · '}{policy.status}
          </div>
        </div>

        {/* Premium — prominent */}
        <div className="w-[90px] flex-shrink-0 text-right pr-3">
          <div className={cn(
            'font-bold font-mono text-sm',
            urgency === 'final' ? 'text-red-400' : 'text-foreground',
          )}>
            ${annualPremium >= 1000
              ? `${(annualPremium / 1000).toFixed(1)}k`
              : Math.round(annualPremium).toLocaleString()
            }
          </div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide">annual</div>
        </div>

        {/* Action pills — compact inline */}
        <div className="flex items-center gap-1 flex-shrink-0 pr-2">
          {(['got_it', 'working', 'done'] as const).map((action) => {
            const isActive = localState === action;
            const labels = { got_it: 'Got it', working: 'Working', done: 'Done' };
            const activeColors = {
              got_it: 'bg-slate-600 text-white border-slate-600',
              working: 'bg-amber-500 text-white border-amber-500',
              done: 'bg-emerald-500 text-white border-emerald-500',
            };
            return (
              <button
                key={action}
                onClick={() => handleAction(action)}
                className={cn(
                  'px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all leading-tight',
                  isActive
                    ? activeColors[action]
                    : 'border-border/60 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {isActive && action !== 'working' ? '✓ ' : ''}{labels[action]}
              </button>
            );
          })}

          {/* Note + expand */}
          {!isAgent && (
            <button
              onClick={() => setNoteOpen(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
              title="Add note"
            >
              <MessageSquarePlus size={13} />
            </button>
          )}

          {notes.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={expanded ? 'Collapse notes' : 'Expand notes'}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Expandable notes section */}
      {expanded && notes.length > 0 && (
        <div className="ml-[61px] mr-4 pb-2 border-l-2 border-border/20 pl-4">
          {notes.map(note => (
            <NoteDisplay
              key={note.id}
              note={note}
              compact
              onAcknowledged={() => fetchNotesForPolicy(policy.policy_number).then(setNotes)}
            />
          ))}
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
