import { create } from 'zustand';
import { TeamMember, Task, SkillCategoryKey } from '@/lib/command-center/types';
import { mockTeamMembers } from '@/lib/command-center/mock-data';
import { fetchTeam, persistMemberUpdate, createMember, recalculateSkills } from '@/lib/command-center/task-hq';

interface TeamState {
  members: TeamMember[];
  mockDataLoaded: boolean;
  loading: boolean;
  source: 'live' | 'seed' | 'mock' | null;
  loadMockData: () => void;
  clearMockData: () => void;
  /** Load the real team from the task-HQ DB (falls back to the low-conf seed). */
  loadLive: () => Promise<void>;
  updateMember: (id: string, updates: Partial<TeamMember>) => void;
  /** Add a new team member to the DB and local state. */
  addMember: (member: { name: string; role: string; capacity: number }) => Promise<boolean>;
  /** Recalculate a member's skill scores from completed task history. */
  recalculate: (memberId: string, allTasks: Task[]) => Promise<boolean>;
}

export const useTeamStore = create<TeamState>((set) => ({
  members: [],
  mockDataLoaded: false,
  loading: false,
  source: null,
  loadMockData: () => set({ members: mockTeamMembers, mockDataLoaded: true, source: 'mock' }),
  clearMockData: () => set({ members: [], mockDataLoaded: false, source: null }),
  loadLive: async () => {
    set({ loading: true });
    const { members, source } = await fetchTeam();
    set({ members, source, loading: false });
  },
  updateMember: (id, updates) => {
    set((state) => ({
      members: state.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
    // Persist role/capacity changes to DB (other fields are computed, not stored directly)
    const dbUpdates: { role?: string; capacity?: number } = {};
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.workload !== undefined) dbUpdates.capacity = updates.workload;
    if (Object.keys(dbUpdates).length > 0) void persistMemberUpdate(id, dbUpdates);
  },
  addMember: async (member) => {
    const result = await createMember(member);
    if (!result) return false;
    const SKILL_KEYS: SkillCategoryKey[] = ['marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl'];
    const skills = {} as TeamMember['skills'];
    const proficiency = {} as NonNullable<TeamMember['proficiency']>;
    for (const k of SKILL_KEYS) {
      skills[k] = 0;
      proficiency[k] = { level: 0, confidence: 'low' };
    }
    const newMember: TeamMember = {
      id: result.id,
      name: member.name,
      avatar: member.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2),
      role: member.role,
      skills,
      proficiency,
      workload: member.capacity,
      performanceScore: 0,
    };
    set((state) => ({ members: [...state.members, newMember] }));
    return true;
  },
  recalculate: async (memberId, allTasks) => {
    const result = await recalculateSkills(memberId, allTasks);
    if (!result) return false;
    set((state) => ({
      members: state.members.map((m) => {
        if (m.id !== memberId) return m;
        const proficiency = { ...m.proficiency } as NonNullable<TeamMember['proficiency']>;
        const skills = { ...m.skills };
        for (const key of Object.keys(result) as SkillCategoryKey[]) {
          proficiency[key] = { ...proficiency[key], level: result[key].level, confidence: result[key].confidence, stale: false };
          skills[key] = Math.round(result[key].level / 10);
        }
        return { ...m, proficiency, skills };
      }),
    }));
    return true;
  },
}));
