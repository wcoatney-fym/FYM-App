import { create } from 'zustand';
import { ActivityItem } from '@/lib/command-center/types';
import { mockActivities } from '@/lib/command-center/mock-data';

interface SettingsState {
  mockDataEnabled: boolean;
  sidebarCollapsed: boolean;
  activities: ActivityItem[];
  toggleMockData: () => void;
  enableMockData: () => void;
  disableMockData: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  addActivity: (activity: ActivityItem) => void;
  loadMockActivities: () => void;
  clearMockActivities: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  mockDataEnabled: false,
  sidebarCollapsed: false,
  activities: [],
  toggleMockData: () => set((state) => ({ mockDataEnabled: !state.mockDataEnabled })),
  enableMockData: () => set({ mockDataEnabled: true }),
  disableMockData: () => set({ mockDataEnabled: false }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  addActivity: (activity) =>
    set((state) => ({ activities: [activity, ...state.activities].slice(0, 20) })),
  loadMockActivities: () => set({ activities: mockActivities }),
  clearMockActivities: () => set({ activities: [] }),
}));
