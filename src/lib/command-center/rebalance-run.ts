import { supabase as portalSupabase, ensurePortalAuth, portalConfigured } from '@/lib/crm/portal-client';
import { fetchTeam } from './task-hq';
import {
  rebalanceOnIdle, rebalanceOnNewTask,
  type BalancerTask, type RebalanceAction,
} from './rebalance';
import type { Priority, SkillCategoryKey } from './types';

interface CcTaskRow {
  id: string;
  title: string;
  skill_category: SkillCategoryKey | null;
  difficulty: number;
  priority: string | null;
  status: BalancerTask['status'];
  assignee_id: string | null;
}
interface CcAssigneeRow { task_id: string; member_id: string; role: 'primary' | 'collaborator' }

async function loadBalancerTasks(): Promise<BalancerTask[]> {
  const [{ data: taskRows }, { data: asgnRows }] = await Promise.all([
    portalSupabase.from('cc_tasks').select('id,title,skill_category,difficulty,priority,status,assignee_id'),
    portalSupabase.from('cc_task_assignees').select('task_id,member_id,role'),
  ]);
  const collabByTask = new Map<string, string[]>();
  for (const a of (asgnRows as CcAssigneeRow[] | null) ?? []) {
    if (a.role !== 'collaborator') continue;
    collabByTask.set(a.task_id, [...(collabByTask.get(a.task_id) ?? []), a.member_id]);
  }
  return ((taskRows as CcTaskRow[] | null) ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    skillCategory: (t.skill_category ?? 'retention') as SkillCategoryKey,
    difficulty: t.difficulty,
    priority: (t.priority as Priority) || 'P3',
    status: t.status,
    primaryId: t.assignee_id,
    collaboratorIds: collabByTask.get(t.id) ?? [],
  }));
}

async function openTaskCounts(tasks: BalancerTask[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status === 'done') continue;
    for (const id of [t.primaryId, ...t.collaboratorIds]) {
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

async function apply(action: RebalanceAction): Promise<void> {
  if (action.kind === 'add_collaborator') {
    await portalSupabase.from('cc_task_assignees').upsert(
      { task_id: action.taskId, member_id: action.memberId, role: 'collaborator', added_reason: action.reason },
      { onConflict: 'task_id,member_id' },
    );
  } else {
    await portalSupabase.from('cc_task_assignees')
      .delete().eq('task_id', action.fromTaskId).eq('member_id', action.memberId);
    await portalSupabase.from('cc_task_assignees').upsert(
      { task_id: action.toTaskId, member_id: action.memberId, role: 'collaborator', added_reason: action.reason },
      { onConflict: 'task_id,member_id' },
    );
  }
}

export async function runIdleRebalance(idleMemberId: string): Promise<RebalanceAction | null> {
  if (!portalConfigured || !idleMemberId) return null;
  try {
    await ensurePortalAuth();
    const [tasks, { members }] = await Promise.all([loadBalancerTasks(), fetchTeam()]);
    const action = rebalanceOnIdle(idleMemberId, tasks, members);
    if (action) await apply(action);
    return action;
  } catch {
    return null;
  }
}

export async function runNewTaskRebalance(newTaskId: string): Promise<RebalanceAction | null> {
  if (!portalConfigured || !newTaskId) return null;
  try {
    await ensurePortalAuth();
    const [tasks, { members }] = await Promise.all([loadBalancerTasks(), fetchTeam()]);
    const newTask = tasks.find((t) => t.id === newTaskId);
    if (!newTask) return null;
    const counts = await openTaskCounts(tasks);
    const action = rebalanceOnNewTask(newTask, tasks, members, counts);
    if (action) await apply(action);
    return action;
  } catch {
    return null;
  }
}
