/**
 * CRM View Store — controls which agency's CRM Management view is shown
 * inside CRM Command for FYM admins.
 *
 * Separate from the global View As store (view-as-store.ts) because this
 * only switches the CRM Command tab content — it doesn't change the
 * app-wide effective role/agency.
 *
 * Usage:
 *   - CRM Ops → Agencies tab: "View CRM" button calls viewAgency()
 *   - CRM Command: if viewingAgency is set, render CrmManagementView
 *   - "Back" button in CrmManagementView calls clearView()
 */
import { create } from 'zustand';

interface CrmViewState {
  /** Agency currently being viewed in CRM Management mode */
  viewingAgency: { id: string; name: string } | null;

  /** Enter CRM Management view for a specific agency */
  viewAgency: (id: string, name: string) => void;

  /** Return to normal CRM Command admin view */
  clearView: () => void;
}

export const useCrmViewStore = create<CrmViewState>((set) => ({
  viewingAgency: null,

  viewAgency: (id, name) => set({ viewingAgency: { id, name } }),

  clearView: () => set({ viewingAgency: null }),
}));
