import { supabase as portalSupabase, ensurePortalAuth, portalConfigured } from '@/lib/crm/portal-client';
import { fymTeamSeed } from './mock-data';
import type {
  TeamMember, Task, SkillCategoryKey, SkillScore, TaskCategory, Priority, TaskStatus,
} from './types';

const SKILL_KEYS: SkillCategoryKey[] = [
  'marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl',
];

interface CcSkillRow {
  category: string;
  level: number | string;
  confidence: 'low' | 'medium' | 'high';
  last_evidence_at: string | null;
  stale: boolean;
}
interface CcMemberRow {
  id: string;
  name: string;
  role: string;
  avatar: string;
  active: boolean;
  capacity: number;
  cc_team_member_skills: CcSkillRow[];
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function mapMember(row: CcMemberRow): TeamMember {
  const proficiency = {} as TeamMember['proficiency'] & Record<SkillCategoryKey, SkillScore>;
  const skills = {} as TeamMember['skills'];
  for (const key of SKILL_KEYS) {
    const s = row.cc_team_member_skills?.find((x) => x.category === key);
    const level = s ? num(s.level) : 0;
    proficiency[key] = {
      level,
      confidence: s?.confidence ?? 'low',
      lastEvidenceAt: s?.last_evidence_at ?? undefined,
      stale: s?.stale ?? false,
    };
    skills[key] = Math.round(level / 10);
  }
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || row.name.slice(0, 2).toUpperCase(),
    role: row.role,
    skills,
    proficiency,
    workload: 0,
    performanceScore: 0,
  };
}

export async function fetchTeam(): Promise<{ members: TeamMember[]; source: 'live' | 'seed' }> {
  if (!portalConfigured) {
    return { members: fymTeamSeed, source: 'seed' };
  }
  try {
    await ensurePortalAuth();
    const { data, error } = await portalSupabase
      .from('cc_team_members')
      .select('id,name,role,avatar,active,capacity,cc_team_member_skills(category,level,confidence,last_evidence_at,stale)')
      .eq('active', true)
      .order('name');
    if (error || !data || data.length === 0) {
      return { members: fymTeamSeed, source: 'seed' };
    }
    return { members: (data as CcMemberRow[]).map(mapMember), source: 'live' };
  } catch {
    return { members: fymTeamSeed, source: 'seed' };
  }
}

const CATEGORY_FROM_SKILL: Record<SkillCategoryKey, TaskCategory> = {
  marketing: 'Lead Gen',
  sales: 'Revenue',
  tech: 'Admin',
  recruiting: 'Recruiting',
  retention: 'Retention',
  ghl: 'Admin',
};

interface CcTaskRow {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  source: 'flag' | 'optimization' | 'manual';
  skill_category: SkillCategoryKey | null;
  difficulty: number;
  priority: string | null;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  on_time: boolean | null;
  reopened_count: number;
  created_at: string;
}

function mapTask(row: CcTaskRow): Task {
  const skillCategory = row.skill_category ?? undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    assigneeId: row.assignee_id ?? '',
    priority: (row.priority as Priority) || 'P3',
    category: skillCategory ? CATEGORY_FROM_SKILL[skillCategory] : 'Admin',
    status: row.status,
    difficulty: row.difficulty,
    dueDate: row.due_at ?? row.created_at,
    createdAt: row.created_at,
    aiGenerated: row.source !== 'manual',
    skillCategory,
    source: row.source,
    dueAt: row.due_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    onTime: row.on_time ?? undefined,
    reopenedCount: row.reopened_count,
  };
}

export async function fetchTasks(): Promise<{ tasks: Task[]; source: 'live' | 'seed' }> {
  if (!portalConfigured) return { tasks: [], source: 'seed' };
  try {
    await ensurePortalAuth();
    const { data, error } = await portalSupabase
      .from('cc_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return { tasks: [], source: 'seed' };
    return { tasks: (data as CcTaskRow[]).map(mapTask), source: 'live' };
  } catch {
    return { tasks: [], source: 'seed' };
  }
}

export async function createTask(task: Task): Promise<void> {
  if (!portalConfigured) return;
  try {
    await ensurePortalAuth();
    const row = {
      id: task.id,
      title: task.title,
      description: task.description || null,
      assignee_id: task.assigneeId || null,
      source: 'manual' as const,
      skill_category: task.skillCategory ?? null,
      difficulty: task.difficulty,
      priority: task.priority,
      status: task.status,
      due_at: task.dueDate ? new Date(task.dueDate).toISOString() : null,
      completed_at: null,
      on_time: null,
      reopened_count: 0,
      created_at: task.createdAt,
    };
    await portalSupabase.from('cc_tasks').insert(row);
  } catch {
    /* best-effort; optimistic UI already shows the task */
  }
}

export async function persistTaskUpdate(id: string, updates: Partial<Task>): Promise<void> {
  if (!portalConfigured) return;
  try {
    await ensurePortalAuth();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.description !== undefined) row.description = updates.description || null;
    if (updates.assigneeId !== undefined) row.assignee_id = updates.assigneeId || null;
    if (updates.priority !== undefined) row.priority = updates.priority;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.difficulty !== undefined) row.difficulty = updates.difficulty;
    if (updates.skillCategory !== undefined) row.skill_category = updates.skillCategory ?? null;
    if (updates.dueDate !== undefined) row.due_at = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;
    if (updates.completedAt !== undefined) row.completed_at = updates.completedAt ?? null;
    if (updates.onTime !== undefined) row.on_time = updates.onTime ?? null;
    await portalSupabase.from('cc_tasks').update(row).eq('id', id);
  } catch {
    /* best-effort */
  }
}

export async function createMember(member: { name: string; role: string; capacity: number }): Promise<{ id: string } | null> {
  if (!portalConfigured) return null;
  try {
    await ensurePortalAuth();
    const avatar = member.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    const { data, error } = await portalSupabase
      .from('cc_team_members')
      .insert({ name: member.name, role: member.role, avatar, capacity: member.capacity, active: true })
      .select('id')
      .single();
    if (error || !data) return null;
    // Seed skill rows at level 0 / low confidence
    const skillRows = SKILL_KEYS.map((cat) => ({
      member_id: data.id,
      category: cat,
      level: 0,
      confidence: 'low' as const,
      stale: false,
    }));
    await portalSupabase.from('cc_team_member_skills').insert(skillRows);
    return { id: data.id };
  } catch {
    return null;
  }
}

export async function recalculateSkills(memberId: string, tasks: import('./types').Task[]): Promise<Record<SkillCategoryKey, { level: number; confidence: 'low' | 'medium' | 'high' }> | null> {
  // Derive skill scores from completed task history
  const doneTasks = tasks.filter((t) => t.assigneeId === memberId && t.status === 'done' && t.skillCategory);
  const bySkill: Partial<Record<SkillCategoryKey, { count: number; diffSum: number; onTimeCount: number }>> = {};
  for (const t of doneTasks) {
    const cat = t.skillCategory!;
    if (!bySkill[cat]) bySkill[cat] = { count: 0, diffSum: 0, onTimeCount: 0 };
    bySkill[cat]!.count++;
    bySkill[cat]!.diffSum += t.difficulty;
    if (t.onTime) bySkill[cat]!.onTimeCount++;
  }
  const result = {} as Record<SkillCategoryKey, { level: number; confidence: 'low' | 'medium' | 'high' }>;
  for (const key of SKILL_KEYS) {
    const s = bySkill[key];
    if (!s || s.count === 0) {
      result[key] = { level: 0, confidence: 'low' };
    } else {
      // level = avg difficulty * 10 * on-time bonus (max 100)
      const avgDiff = s.diffSum / s.count;
      const onTimeRate = s.onTimeCount / s.count;
      const level = Math.min(100, Math.round(avgDiff * 10 * (0.8 + 0.2 * onTimeRate)));
      const confidence: 'low' | 'medium' | 'high' = s.count >= 5 ? 'high' : s.count >= 2 ? 'medium' : 'low';
      result[key] = { level, confidence };
    }
  }
  // Persist to DB
  if (portalConfigured) {
    try {
      await ensurePortalAuth();
      const now = new Date().toISOString();
      for (const key of SKILL_KEYS) {
        await portalSupabase
          .from('cc_team_member_skills')
          .update({ level: result[key].level, confidence: result[key].confidence, last_evidence_at: now, stale: false })
          .eq('member_id', memberId)
          .eq('category', key);
      }
    } catch {
      /* best-effort */
    }
  }
  return result;
}

export async function persistMemberUpdate(id: string, updates: { role?: string; capacity?: number; active?: boolean }): Promise<void> {
  if (!portalConfigured) return;
  try {
    await ensurePortalAuth();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.role !== undefined) row.role = updates.role;
    if (updates.capacity !== undefined) row.capacity = updates.capacity;
    if (updates.active !== undefined) row.active = updates.active;
    await portalSupabase.from('cc_team_members').update(row).eq('id', id);
  } catch {
    /* best-effort */
  }
}

export async function deleteTaskFromDb(id: string): Promise<void> {
  if (!portalConfigured) return;
  try {
    await ensurePortalAuth();
    await portalSupabase.from('cc_tasks').delete().eq('id', id);
  } catch {
    /* best-effort; optimistic UI already removed the task */
  }
}

export async function persistTaskStatus(id: string, status: TaskStatus): Promise<void> {
  if (!portalConfigured) return;
  try {
    await ensurePortalAuth();
    await portalSupabase
      .from('cc_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    /* best-effort; UI already updated optimistically */
  }
}
