import { create } from 'zustand';
import type { UserRole } from '@/contexts/AuthContext';

interface ViewAsState {
  active: boolean;
  role: UserRole | null;
  agencyId: string | null;
  agencyName: string | null;
  agentId: string | null;
  agentName: string | null;
  writingNumber: string | null;

  // Activate View As mode
  activate: (params: {
    role: UserRole;
    agencyId: string;
    agencyName: string;
    agentId?: string;
    agentName?: string;
    writingNumber?: string;
  }) => void;

  // Deactivate — return to FYM admin view
  deactivate: () => void;
}

export const useViewAsStore = create<ViewAsState>((set) => ({
  active: false,
  role: null,
  agencyId: null,
  agencyName: null,
  agentId: null,
  agentName: null,
  writingNumber: null,

  activate: ({ role, agencyId, agencyName, agentId, agentName, writingNumber }) =>
    set({ active: true, role, agencyId, agencyName, agentId: agentId ?? null, agentName: agentName ?? null, writingNumber: writingNumber ?? null }),

  deactivate: () =>
    set({ active: false, role: null, agencyId: null, agencyName: null, agentId: null, agentName: null, writingNumber: null }),
}));
