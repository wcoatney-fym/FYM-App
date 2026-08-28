import { create } from 'zustand';
import type { UserRole } from '@/contexts/AuthContext';

/**
 * viewSource distinguishes where the View As pivot originated:
 * - 'fym-direct': FYM's own agency quick-pivot (LOCKED — do not modify without explicit request)
 * - 'dev': Dev View toggle (active development surface)
 * - 'downline': Downline Agency View (troubleshooting)
 * - null: not active
 */
export type ViewSource = 'fym-direct' | 'dev' | 'downline' | null;

interface ViewAsState {
  active: boolean;
  role: UserRole | null;
  viewSource: ViewSource;
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
    viewSource?: ViewSource;
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
  viewSource: null,
  agencyId: null,
  agencyName: null,
  agentId: null,
  agentName: null,
  writingNumber: null,

  activate: ({ role, agencyId, agencyName, viewSource, agentId, agentName, writingNumber }) =>
    set({
      active: true,
      role,
      viewSource: viewSource ?? null,
      agencyId,
      agencyName,
      agentId: agentId ?? null,
      agentName: agentName ?? null,
      writingNumber: writingNumber ?? null,
    }),

  deactivate: () =>
    set({ active: false, role: null, viewSource: null, agencyId: null, agencyName: null, agentId: null, agentName: null, writingNumber: null }),
}));
