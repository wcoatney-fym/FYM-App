import { create } from 'zustand';

interface AppState {
  useMockData: boolean;
  sidebarCollapsed: boolean;
  toggleMockData: () => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  useMockData: localStorage.getItem('fym_mock_data') !== 'false',
  sidebarCollapsed: false,
  toggleMockData: () =>
    set((state) => {
      const next = !state.useMockData;
      localStorage.setItem('fym_mock_data', String(next));
      return { useMockData: next };
    }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
