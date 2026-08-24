/**
 * Coaching Pipeline — Supabase API helpers
 *
 * CRUD operations for coaching plans, requirements, notes, and stage transitions.
 * All reads/writes go to the FYM App Supabase (rcbzag).
 */

import { supabase } from '@/lib/supabase';
import type {
  CoachingFlagType,
  CoachingStage,
  CoachingRequirementType,
  CoachingPlan,
  CoachingRequirement,
  CoachingNote,
  CoachingStageHistoryEntry,
  CoachingCard,
  CoachingThresholds,
} from './types';
import { calculateDeadline, validNextStages } from './types';

// ── Thresholds ────────────────────────────────────────────────────────────

export async function fetchCoachingThresholds(): Promise<CoachingThresholds | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('coaching_thresholds')
    .select('*')
    .eq('id', 1)
    .single();
  return (data as unknown as CoachingThresholds) ?? null;
}

export async function updateCoachingThresholds(
  updates: Partial<Omit<CoachingThresholds, 'id' | 'updated_at'>>,
  updatedBy?: string,
): Promise<CoachingThresholds | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('coaching_thresholds')
    .update({ ...updates, updated_by: updatedBy } as any)
    .eq('id', 1)
    .select()
    .single();
  return (data as unknown as CoachingThresholds) ?? null;
}

// ── Plans (CRUD) ──────────────────────────────────────────────────────────

export async function fetchCoachingPlans(params: {
  agencyId?: string;
  stage?: CoachingStage | CoachingStage[];
  flagType?: CoachingFlagType;
  assignedTo?: string;
  rosterAgentId?: string;
}): Promise<CoachingCard[]> {
  if (!supabase) return [];

  let query = supabase
    .from('coaching_plans')
    .select(`
      *,
      agency_rosters!inner (
        first_name,
        last_name,
        email,
        agent_npn,
        unl_writing_number
      ),
      profiles:assigned_to (
        full_name
      ),
      coaching_requirements (
        id,
        is_completed
      ),
      coaching_notes (
        id
      )
    `)
    .order('flagged_at', { ascending: false });

  if (params.agencyId) {
    query = query.eq('agency_id', params.agencyId);
  }
  if (params.stage) {
    if (Array.isArray(params.stage)) {
      query = query.in('stage', params.stage);
    } else {
      query = query.eq('stage', params.stage);
    }
  }
  if (params.flagType) {
    query = query.eq('flag_type', params.flagType);
  }
  if (params.assignedTo) {
    query = query.eq('assigned_to', params.assignedTo);
  }
  if (params.rosterAgentId) {
    query = query.eq('roster_agent_id', params.rosterAgentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchCoachingPlans error:', error);
    return [];
  }

  return ((data as any[]) || []).map((row) => {
    const agent = row.agency_rosters || {};
    const reqs = row.coaching_requirements || [];
    const notes = row.coaching_notes || [];
    const assignedProfile = row.profiles;

    return {
      id: row.id,
      agency_id: row.agency_id,
      roster_agent_id: row.roster_agent_id,
      flag_type: row.flag_type,
      stage: row.stage,
      assigned_to: row.assigned_to,
      assigned_at: row.assigned_at,
      flagged_at: row.flagged_at,
      deadline: row.deadline,
      resolved_at: row.resolved_at,
      escalated_at: row.escalated_at,
      trigger_metric: row.trigger_metric,
      target_metric: row.target_metric,
      resolution_note: row.resolution_note,
      resolution_type: row.resolution_type,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Agent info
      agent_first_name: agent.first_name || '',
      agent_last_name: agent.last_name || '',
      agent_email: agent.email || null,
      agent_npn: agent.agent_npn || null,
      agent_writing_number: agent.unl_writing_number || null,
      // Aggregates
      requirements: [],  // populated on detail fetch
      notes_count: notes.length,
      requirements_total: reqs.length,
      requirements_completed: reqs.filter((r: any) => r.is_completed).length,
      assigned_to_name: assignedProfile?.full_name || null,
    } as CoachingCard;
  });
}

export async function fetchCoachingPlanDetail(planId: string): Promise<CoachingCard | null> {
  if (!supabase) return null;

  const { data: row, error } = await supabase
    .from('coaching_plans')
    .select(`
      *,
      agency_rosters!inner (
        first_name,
        last_name,
        email,
        agent_npn,
        unl_writing_number
      ),
      profiles:assigned_to (
        full_name
      ),
      coaching_requirements (
        *
      ),
      coaching_notes (
        id
      )
    `)
    .eq('id', planId)
    .single();

  if (error || !row) return null;

  const agent = (row as any).agency_rosters || {};
  const reqs = ((row as any).coaching_requirements || []) as CoachingRequirement[];
  const notes = ((row as any).coaching_notes || []);
  const assignedProfile = (row as any).profiles;

  return {
    ...(row as unknown as CoachingPlan),
    agent_first_name: agent.first_name || '',
    agent_last_name: agent.last_name || '',
    agent_email: agent.email || null,
    agent_npn: agent.agent_npn || null,
    agent_writing_number: agent.unl_writing_number || null,
    requirements: reqs.sort((a, b) => a.sort_order - b.sort_order),
    notes_count: notes.length,
    requirements_total: reqs.length,
    requirements_completed: reqs.filter((r) => r.is_completed).length,
    assigned_to_name: assignedProfile?.full_name || null,
  } as CoachingCard;
}

export async function createCoachingPlan(params: {
  agencyId: string;
  rosterAgentId: string;
  flagType: CoachingFlagType;
  triggerMetric?: Record<string, unknown>;
  targetMetric?: Record<string, unknown>;
  thresholds?: CoachingThresholds;
}): Promise<CoachingPlan | null> {
  if (!supabase) return null;

  const deadline = calculateDeadline(new Date(), params.flagType, params.thresholds);

  const { data, error } = await supabase
    .from('coaching_plans')
    .insert({
      agency_id: params.agencyId,
      roster_agent_id: params.rosterAgentId,
      flag_type: params.flagType,
      stage: 'flagged',
      deadline: deadline.toISOString(),
      trigger_metric: params.triggerMetric || null,
      target_metric: params.targetMetric || null,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('createCoachingPlan error:', error);
    return null;
  }

  // Record initial stage history
  if (data) {
    await supabase.from('coaching_stage_history').insert({
      plan_id: (data as any).id,
      from_stage: null,
      to_stage: 'flagged',
      note: `Auto-flagged: ${params.flagType}`,
    } as any);
  }

  return (data as unknown as CoachingPlan) ?? null;
}

// ── Stage transitions ─────────────────────────────────────────────────────

export async function advanceCoachingStage(
  planId: string,
  toStage: CoachingStage,
  changedBy: string,
  note?: string,
): Promise<CoachingPlan | null> {
  if (!supabase) return null;

  // Fetch current stage
  const { data: current } = await supabase
    .from('coaching_plans')
    .select('stage')
    .eq('id', planId)
    .single();

  if (!current) return null;
  const currentStage = (current as any).stage as CoachingStage;

  // Validate transition
  const allowed = validNextStages(currentStage);
  if (!allowed.includes(toStage)) {
    console.error(`Invalid stage transition: ${currentStage} → ${toStage}`);
    return null;
  }

  // Build update payload
  const updates: Record<string, unknown> = { stage: toStage };
  if (toStage === 'assigned') {
    updates.assigned_to = changedBy;
    updates.assigned_at = new Date().toISOString();
  } else if (toStage === 'resolved') {
    updates.resolved_at = new Date().toISOString();
  } else if (toStage === 'escalated') {
    updates.escalated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('coaching_plans')
    .update(updates as any)
    .eq('id', planId)
    .select()
    .single();

  if (error) {
    console.error('advanceCoachingStage error:', error);
    return null;
  }

  // Record stage history
  await supabase.from('coaching_stage_history').insert({
    plan_id: planId,
    from_stage: currentStage,
    to_stage: toStage,
    changed_by: changedBy,
    note: note || null,
  } as any);

  return (data as unknown as CoachingPlan) ?? null;
}

// ── Requirements ──────────────────────────────────────────────────────────

export async function addRequirement(params: {
  planId: string;
  type: CoachingRequirementType;
  title: string;
  description?: string;
  trainingContentId?: string;
  meetingScheduledAt?: string;
  requiredCount?: number;
  sortOrder?: number;
}): Promise<CoachingRequirement | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('coaching_requirements')
    .insert({
      plan_id: params.planId,
      requirement_type: params.type,
      title: params.title,
      description: params.description || null,
      training_content_id: params.trainingContentId || null,
      meeting_scheduled_at: params.meetingScheduledAt || null,
      required_count: params.requiredCount || null,
      sort_order: params.sortOrder ?? 0,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('addRequirement error:', error);
    return null;
  }
  return (data as unknown as CoachingRequirement) ?? null;
}

export async function updateRequirement(
  requirementId: string,
  updates: Partial<Pick<CoachingRequirement,
    'is_completed' | 'completed_at' | 'completed_by' |
    'meeting_attended' | 'meeting_notes' |
    'completed_count' | 'title' | 'description' | 'sort_order'
  >>,
): Promise<CoachingRequirement | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('coaching_requirements')
    .update(updates as any)
    .eq('id', requirementId)
    .select()
    .single();

  if (error) {
    console.error('updateRequirement error:', error);
    return null;
  }
  return (data as unknown as CoachingRequirement) ?? null;
}

export async function deleteRequirement(requirementId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('coaching_requirements')
    .delete()
    .eq('id', requirementId);
  return !error;
}

export async function completeRequirement(
  requirementId: string,
  completedBy: string,
): Promise<CoachingRequirement | null> {
  return updateRequirement(requirementId, {
    is_completed: true,
    completed_at: new Date().toISOString(),
    completed_by: completedBy,
  });
}

// ── Notes ─────────────────────────────────────────────────────────────────

export async function fetchCoachingNotes(planId: string): Promise<CoachingNote[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('coaching_notes')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });
  return ((data as unknown as CoachingNote[]) || []);
}

export async function addCoachingNote(
  planId: string,
  authorId: string,
  body: string,
): Promise<CoachingNote | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('coaching_notes')
    .insert({ plan_id: planId, author_id: authorId, body } as any)
    .select()
    .single();
  if (error) {
    console.error('addCoachingNote error:', error);
    return null;
  }
  return (data as unknown as CoachingNote) ?? null;
}

// ── Stage history ─────────────────────────────────────────────────────────

export async function fetchStageHistory(planId: string): Promise<CoachingStageHistoryEntry[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('coaching_stage_history')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });
  return ((data as unknown as CoachingStageHistoryEntry[]) || []);
}

// ── Summary / counts ──────────────────────────────────────────────────────

export interface CoachingSummary {
  total: number;
  by_flag: Record<CoachingFlagType, number>;
  by_stage: Record<CoachingStage, number>;
  overdue: number;
  due_this_week: number;
}

export async function fetchCoachingSummary(agencyId?: string): Promise<CoachingSummary> {
  const plans = await fetchCoachingPlans({
    agencyId,
    stage: ['flagged', 'assigned', 'action_plan', 'in_progress', 'review'],
  });

  const now = new Date();
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const summary: CoachingSummary = {
    total: plans.length,
    by_flag: { production: 0, quality: 0, rts_watch: 0 },
    by_stage: {
      flagged: 0, assigned: 0, action_plan: 0,
      in_progress: 0, review: 0, resolved: 0, escalated: 0,
    },
    overdue: 0,
    due_this_week: 0,
  };

  for (const plan of plans) {
    summary.by_flag[plan.flag_type]++;
    summary.by_stage[plan.stage]++;

    const dl = new Date(plan.deadline);
    if (dl < now) summary.overdue++;
    else if (dl <= weekFromNow) summary.due_this_week++;
  }

  return summary;
}

// ── Trigger API ────────────────────────────────────────────────────────

export interface CoachingTriggerResult {
  dry_run: boolean;
  agents_scanned: number;
  agents_flagged: number;
  flags_total: number;
  flags_by_type: Record<CoachingFlagType, number>;
  roster_coverage: number;
  thresholds: CoachingThresholds;
  elapsed_ms: number;
  actions?: {
    created: number;
    skipped: number;
    auto_resolved: number;
    no_roster_match: number;
  };
  details?: Array<{
    action: string;
    writing_number: string;
    flag_type: string;
    plan_id?: string;
    reason?: string;
  }>;
}

/**
 * Invoke the coaching-trigger edge function.
 * Pass dryRun=true to preview without writing.
 */
export async function runCoachingTrigger(params?: {
  dryRun?: boolean;
  agencyId?: string;
}): Promise<CoachingTriggerResult | null> {
  if (!supabase) return null;

  const queryParams = new URLSearchParams();
  if (params?.dryRun) queryParams.set('dry_run', 'true');
  if (params?.agencyId) queryParams.set('agency_id', params.agencyId);

  const qs = queryParams.toString();
  const { data, error } = await supabase.functions.invoke(
    `coaching-trigger${qs ? `?${qs}` : ''}`,
    { method: 'POST' },
  );

  if (error) {
    console.error('runCoachingTrigger error:', error);
    return null;
  }
  return data as CoachingTriggerResult;
}

// ── Pipeline Summary (from DB view) ───────────────────────────────────

export interface CoachingPipelineSummaryRow {
  agency_id: string;
  agency_name: string;
  agency_writing_number: string | null;
  flag_type: CoachingFlagType;
  stage: CoachingStage;
  plan_count: number;
  overdue_count: number;
  due_this_week_count: number;
  active_count: number;
}

export async function fetchPipelineSummary(
  agencyId?: string,
): Promise<CoachingPipelineSummaryRow[]> {
  if (!supabase) return [];

  let query = supabase
    .from('coaching_pipeline_summary')
    .select('*');

  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchPipelineSummary error:', error);
    return [];
  }
  return (data as unknown as CoachingPipelineSummaryRow[]) || [];
}
