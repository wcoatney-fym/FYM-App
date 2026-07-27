import type { TeamMember, SkillCategoryKey, Priority } from './types';

export interface BalancerTask {
  id: string;
  title: string;
  skillCategory: SkillCategoryKey;
  difficulty: number;
  priority: Priority;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  primaryId: string | null;
  collaboratorIds: string[];
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { P1: 100, P2: 60, P3: 30, P4: 10 };
export const RETENTION_BUMP = 15;
export const MAX_COLLABORATORS = 2;
export const SKILL_FLOOR = 40;
export const SWITCH_THRESHOLD = 25;

export interface AddCollaboratorAction {
  kind: 'add_collaborator';
  taskId: string;
  memberId: string;
  reason: string;
}
export interface MoveAction {
  kind: 'move';
  memberId: string;
  fromTaskId: string;
  toTaskId: string;
  reason: string;
}
export type RebalanceAction = AddCollaboratorAction | MoveAction;

function proficiencyOf(m: TeamMember, cat: SkillCategoryKey): number {
  const p = m.proficiency?.[cat]?.level;
  return typeof p === 'number' ? p : (m.skills?.[cat] ?? 0) * 10;
}

export function taskValue(t: BalancerTask): number {
  return PRIORITY_WEIGHT[t.priority] + (t.skillCategory === 'retention' ? RETENTION_BUMP : 0);
}

const isOpen = (t: BalancerTask) => t.status !== 'done';
const memberOn = (t: BalancerTask, id: string) => t.primaryId === id || t.collaboratorIds.includes(id);

export function rebalanceOnIdle(
  idleMemberId: string,
  tasks: BalancerTask[],
  members: TeamMember[],
): AddCollaboratorAction | null {
  const idle = members.find((m) => m.id === idleMemberId);
  if (!idle) return null;

  const candidates = tasks
    .filter((t) => isOpen(t)
      && !memberOn(t, idleMemberId)
      && t.collaboratorIds.length < MAX_COLLABORATORS)
    .map((t) => {
      const prof = proficiencyOf(idle, t.skillCategory);
      const fitBonus = prof >= SKILL_FLOOR ? prof * 0.5 : prof * 0.1;
      return { t, prof, score: taskValue(t) + fitBonus };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) return null;
  return {
    kind: 'add_collaborator',
    taskId: best.t.id,
    memberId: idleMemberId,
    reason: `Idle after completing work; ${Math.round(best.prof)} in ${best.t.skillCategory}, `
      + `joining "${best.t.title}" (value ${Math.round(taskValue(best.t))}) to divide-and-conquer.`,
  };
}

export function rebalanceOnNewTask(
  newTask: BalancerTask,
  tasks: BalancerTask[],
  members: TeamMember[],
  openTaskCounts: Record<string, number>,
  capacity = 10,
): MoveAction | null {
  const hasFreeQualified = members.some((m) =>
    proficiencyOf(m, newTask.skillCategory) >= SKILL_FLOOR
    && (openTaskCounts[m.id] ?? 0) < capacity);
  if (hasFreeQualified) return null;

  const newVal = taskValue(newTask);

  let bestDonor: { memberId: string; fromTaskId: string; gain: number; prof: number } | null = null;
  for (const t of tasks) {
    if (!isOpen(t) || t.id === newTask.id) continue;
    const gain = newVal - taskValue(t);
    if (gain < SWITCH_THRESHOLD) continue;
    for (const memberId of t.collaboratorIds) {
      const m = members.find((x) => x.id === memberId);
      if (!m) continue;
      const prof = proficiencyOf(m, newTask.skillCategory);
      if (prof < SKILL_FLOOR) continue;
      if (!bestDonor || gain + prof * 0.1 > bestDonor.gain + bestDonor.prof * 0.1) {
        bestDonor = { memberId, fromTaskId: t.id, gain, prof };
      }
    }
  }

  if (!bestDonor) return null;
  return {
    kind: 'move',
    memberId: bestDonor.memberId,
    fromTaskId: bestDonor.fromTaskId,
    toTaskId: newTask.id,
    reason: `All qualified members busy; pulling off a lower-value task `
      + `(value gap ${Math.round(bestDonor.gain)} ≥ ${SWITCH_THRESHOLD}) to swarm "${newTask.title}".`,
  };
}
