/**
 * Coaching Pipeline — Types & Constants
 *
 * Three flag types, one shared pipeline:
 *   🟡 production  — low production, 30-day window
 *   🔴 quality     — high at-risk/terminated %, 30-day window
 *   🟢 rts_watch   — moved to RTS in contracting, 7-day window
 *
 * Pipeline: flagged → assigned → action_plan → in_progress → review → resolved | escalated
 */

import type {
  CoachingFlagType,
  CoachingStage,
  CoachingRequirementType,
} from '@/lib/database.types';

export type { CoachingFlagType, CoachingStage, CoachingRequirementType };

// ── Stage metadata ────────────────────────────────────────────────────────

export const COACHING_STAGES: CoachingStage[] = [
  'flagged',
  'assigned',
  'action_plan',
  'in_progress',
  'review',
  'resolved',
  'escalated',
];

export const COACHING_STAGE_LABELS: Record<CoachingStage, string> = {
  flagged: 'Flagged',
  assigned: 'Assigned',
  action_plan: 'Action Plan',
  in_progress: 'In Progress',
  review: 'Review',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

export const COACHING_STAGE_DESCRIPTIONS: Record<CoachingStage, string> = {
  flagged: 'Agent flagged by system — awaiting manager assignment',
  assigned: 'Manager assigned — build the action plan',
  action_plan: 'Action plan set — ready to activate',
  in_progress: 'Agent working the plan — track progress',
  review: 'Deadline reached or early review requested',
  resolved: 'Agent met targets — coaching complete',
  escalated: 'Agent did not meet targets — escalated for review',
};

/** Active stages (shown on Kanban board) */
export const ACTIVE_COACHING_STAGES: CoachingStage[] = [
  'flagged',
  'assigned',
  'action_plan',
  'in_progress',
  'review',
];

/** Terminal stages */
export const TERMINAL_COACHING_STAGES: CoachingStage[] = [
  'resolved',
  'escalated',
];

// ── Flag type metadata ────────────────────────────────────────────────────

export const FLAG_TYPE_LABELS: Record<CoachingFlagType, string> = {
  production: 'Production',
  quality: 'Quality',
  rts_watch: 'RTS Watch',
};

export const FLAG_TYPE_DESCRIPTIONS: Record<CoachingFlagType, string> = {
  production: 'Below minimum production threshold',
  quality: 'At-risk and/or terminated percentage too high',
  rts_watch: 'Agent moved to RTS — observation period',
};

/** Color tokens per flag type (Tailwind classes) */
export const FLAG_TYPE_COLORS: Record<
  CoachingFlagType,
  {
    badge: string;
    border: string;
    bg: string;
    dot: string;
    text: string;
    icon: string;
  }
> = {
  production: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/5',
    dot: 'bg-amber-500',
    text: 'text-amber-400',
    icon: '🟡',
  },
  quality: {
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    border: 'border-red-500/40',
    bg: 'bg-red-500/5',
    dot: 'bg-red-500',
    text: 'text-red-400',
    icon: '🔴',
  },
  rts_watch: {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/5',
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    icon: '🟢',
  },
};

/** Stage color tokens */
export const COACHING_STAGE_COLORS: Record<
  CoachingStage,
  { badge: string; dot: string }
> = {
  flagged: { badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
  assigned: { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30', dot: 'bg-blue-500' },
  action_plan: { badge: 'bg-violet-500/10 text-violet-400 border-violet-500/30', dot: 'bg-violet-500' },
  in_progress: { badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30', dot: 'bg-cyan-500' },
  review: { badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30', dot: 'bg-orange-500' },
  resolved: { badge: 'bg-green-500/10 text-green-400 border-green-500/30', dot: 'bg-green-500' },
  escalated: { badge: 'bg-red-500/10 text-red-400 border-red-500/30', dot: 'bg-red-500' },
};

// ── Requirement type metadata ─────────────────────────────────────────────

export const REQUIREMENT_TYPE_LABELS: Record<CoachingRequirementType, string> = {
  training: 'Required Training',
  coaching_meeting: 'Coaching Meeting',
  live_attendance: 'Live Training Attendance',
  custom_task: 'Custom Task',
};

export const REQUIREMENT_TYPE_ICONS: Record<CoachingRequirementType, string> = {
  training: '📚',
  coaching_meeting: '🤝',
  live_attendance: '🎓',
  custom_task: '✅',
};

// ── Composite types for UI ────────────────────────────────────────────────

export interface CoachingPlan {
  id: string;
  agency_id: string;
  roster_agent_id: string;
  flag_type: CoachingFlagType;
  stage: CoachingStage;
  assigned_to: string | null;
  assigned_at: string | null;
  flagged_at: string;
  deadline: string;
  resolved_at: string | null;
  escalated_at: string | null;
  trigger_metric: Record<string, unknown> | null;
  target_metric: Record<string, unknown> | null;
  resolution_note: string | null;
  resolution_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachingRequirement {
  id: string;
  plan_id: string;
  requirement_type: CoachingRequirementType;
  training_content_id: string | null;
  meeting_scheduled_at: string | null;
  meeting_attended: boolean;
  meeting_notes: string | null;
  required_count: number | null;
  completed_count: number;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CoachingNote {
  id: string;
  plan_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface CoachingStageHistoryEntry {
  id: string;
  plan_id: string;
  from_stage: CoachingStage | null;
  to_stage: CoachingStage;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

/** Enriched plan with agent info + requirements for UI rendering */
export interface CoachingCard extends CoachingPlan {
  agent_first_name: string;
  agent_last_name: string;
  agent_email: string | null;
  agent_npn: string | null;
  agent_writing_number: string | null;
  requirements: CoachingRequirement[];
  notes_count: number;
  requirements_total: number;
  requirements_completed: number;
  /** Manager name (if assigned) */
  assigned_to_name: string | null;
}

/** Coaching thresholds (extended) */
export interface CoachingThresholds {
  id: number;
  retention_pct_min: number;
  at_risk_pct_max: number;
  terminated_pct_max: number;
  min_eligible_policies: number;
  production_min_policies: number;
  production_window_days: number;
  quality_window_days: number;
  rts_window_days: number;
  updated_at: string;
  updated_by: string | null;
}

/** Default window in days per flag type */
export function getDefaultWindowDays(
  flagType: CoachingFlagType,
  thresholds?: CoachingThresholds,
): number {
  if (thresholds) {
    switch (flagType) {
      case 'production': return thresholds.production_window_days;
      case 'quality': return thresholds.quality_window_days;
      case 'rts_watch': return thresholds.rts_window_days;
    }
  }
  // Defaults if thresholds not loaded yet
  switch (flagType) {
    case 'production': return 30;
    case 'quality': return 30;
    case 'rts_watch': return 7;
  }
}

/** Calculate deadline from flagged date + window */
export function calculateDeadline(
  flaggedAt: string | Date,
  flagType: CoachingFlagType,
  thresholds?: CoachingThresholds,
): Date {
  const d = new Date(flaggedAt);
  d.setDate(d.getDate() + getDefaultWindowDays(flagType, thresholds));
  return d;
}

/** Days remaining until deadline (negative = overdue) */
export function daysRemaining(deadline: string | Date): number {
  const now = new Date();
  const dl = new Date(deadline);
  return Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Is plan in a terminal stage? */
export function isTerminal(stage: CoachingStage): boolean {
  return stage === 'resolved' || stage === 'escalated';
}

/** Valid next stages from a given stage */
export function validNextStages(stage: CoachingStage): CoachingStage[] {
  switch (stage) {
    case 'flagged': return ['assigned'];
    case 'assigned': return ['action_plan', 'resolved']; // can resolve early (false positive)
    case 'action_plan': return ['in_progress'];
    case 'in_progress': return ['review', 'resolved']; // early resolve if metrics met
    case 'review': return ['resolved', 'escalated', 'in_progress']; // can cycle back
    case 'resolved': return []; // terminal
    case 'escalated': return ['flagged']; // can restart
    default: return [];
  }
}
