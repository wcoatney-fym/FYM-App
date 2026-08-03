/**
 * Goals API — CRUD for agent_goals table in FYM App DB (rcbzag)
 */
import { supabase } from './supabase';

export interface AgentGoal {
  id: string;
  user_id: string;
  writing_number: string;
  agency_id: string | null;
  period: string;
  month: number;
  year: number;
  target_ap: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface UpsertGoalParams {
  user_id: string;
  writing_number: string;
  agency_id?: string | null;
  month: number;
  year: number;
  target_ap: number;
  notes?: string | null;
}

/**
 * Get the goal for a specific user + month + year.
 * Returns null if no goal is set.
 */
export async function getGoal(
  userId: string,
  month: number,
  year: number
): Promise<AgentGoal | null> {
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from('agent_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();

  if (error) {
    console.error('[Goals] fetch error:', error.message);
    return null;
  }

  return data as AgentGoal | null;
}

/**
 * Get all goals for a user in a given year.
 */
export async function getYearGoals(
  userId: string,
  year: number
): Promise<AgentGoal[]> {
  if (!supabase) return [];

  const { data, error } = await (supabase as any)
    .from('agent_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('month', { ascending: true });

  if (error) {
    console.error('[Goals] year fetch error:', error.message);
    return [];
  }

  return (data || []) as AgentGoal[];
}

/**
 * Set or update a goal for a specific month.
 * Uses upsert on (user_id, month, year) unique constraint.
 */
export async function upsertGoal(params: UpsertGoalParams): Promise<AgentGoal | null> {
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from('agent_goals')
    .upsert(
      {
        user_id: params.user_id,
        writing_number: params.writing_number,
        agency_id: params.agency_id ?? null,
        period: 'monthly',
        month: params.month,
        year: params.year,
        target_ap: params.target_ap,
        notes: params.notes ?? null,
      },
      { onConflict: 'user_id,month,year' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('[Goals] upsert error:', error.message);
    throw new Error(error.message);
  }

  return data as AgentGoal;
}

/**
 * Delete a goal.
 */
export async function deleteGoal(goalId: string): Promise<void> {
  if (!supabase) return;

  const { error } = await (supabase as any)
    .from('agent_goals')
    .delete()
    .eq('id', goalId);

  if (error) {
    console.error('[Goals] delete error:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Bulk set a yearly goal — applies the same target_ap to every month
 * in the year that doesn't already have a goal.
 */
export async function setYearlyGoal(
  params: Omit<UpsertGoalParams, 'month'> & { overwriteExisting?: boolean }
): Promise<AgentGoal[]> {
  if (!supabase) return [];

  const results: AgentGoal[] = [];
  const existing = params.overwriteExisting
    ? []
    : await getYearGoals(params.user_id, params.year);
  const existingMonths = new Set(existing.map(g => g.month));

  for (let m = 1; m <= 12; m++) {
    if (!params.overwriteExisting && existingMonths.has(m)) continue;
    const goal = await upsertGoal({ ...params, month: m });
    if (goal) results.push(goal);
  }

  return results;
}
