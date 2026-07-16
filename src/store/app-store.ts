import { create } from 'zustand';

interface AppState {
  useMockData: boolean;
  sidebarCollapsed: boolean;
  toggleMockData: () => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Default to mock data only when Supabase isn't configured
  useMockData: !import.meta.env.VITE_SUPABASE_URL,
  sidebarCollapsed: false,
  toggleMockData: () =>
    set((state) => {
      const next = !state.useMockData;
      localStorage.setItem('fym_mock_data', String(next));
      return { useMockData: next };
    }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
