import { create } from 'zustand';
import { TeamMember } from '@/lib/command-center/types';
import { mockTeamMembers } from '@/lib/command-center/mock-data';
import { fetchTeam, persistMemberUpdate } from '@/lib/command-center/task-hq';

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
}));
