import type { TeamMember, SkillCategoryKey } from './types';

export interface AssignmentCandidate {
  memberId: string;
  name: string;
  score: number;
  proficiency: number;
  openTasks: number;
  capacity: number;
  rationale: string;
}

export interface AssignmentInput {
  skillCategory: SkillCategoryKey;
  difficulty: number;
  members: TeamMember[];
  openTaskCounts?: Record<string, number>;
  capacityById?: Record<string, number>;
}

const DEFAULT_CAPACITY = 10;

function proficiencyOf(m: TeamMember, cat: SkillCategoryKey): number {
  const p = m.proficiency?.[cat]?.level;
  if (typeof p === 'number') return p;
  return (m.skills?.[cat] ?? 0) * 10;
}

export function scoreCandidates(input: AssignmentInput): AssignmentCandidate[] {
  const { skillCategory, difficulty, members } = input;
  const diffScore = Math.min(10, Math.max(1, difficulty)) * 10;

  return members
    .map((m) => {
      const proficiency = proficiencyOf(m, skillCategory);
      const capacity = input.capacityById?.[m.id] ?? DEFAULT_CAPACITY;
      const openTasks = input.openTaskCounts?.[m.id] ?? 0;
      const load = capacity > 0 ? openTasks / capacity : 1;

      let score = proficiency;
      const gap = diffScore - proficiency;
      if (gap > 0) score -= gap * 0.5;
      else score += Math.min(10, -gap * 0.1);

      score -= load * 25;
      if (openTasks >= capacity) score -= 20;

      const rationale =
        `${Math.round(proficiency)} in ${skillCategory}, ` +
        `${openTasks}/${capacity} load` +
        (gap > 0 ? `, stretch (+${Math.round(gap)})` : '');

      return { memberId: m.id, name: m.name, score: Math.round(score * 10) / 10, proficiency, openTasks, capacity, rationale };
    })
    .sort((a, b) => b.score - a.score);
}

export function suggestAssignee(input: AssignmentInput): AssignmentCandidate | null {
  const ranked = scoreCandidates(input);
  if (ranked.length === 0) return null;
  const withRoom = ranked.filter((c) => c.openTasks < c.capacity);
  return (withRoom[0] ?? ranked[0]) ?? null;
}
