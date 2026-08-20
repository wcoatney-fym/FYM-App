/**
 * Test View Store — tracks whether the admin is in test-agent mode.
 *
 * When active, the floating toolbar appears on the agent contracting
 * page. All data is REAL — reads and writes hit the actual DB through
 * the normal useAgentPipeline hook. The toolbar provides stage
 * navigation by updating the real pipeline record.
 */
import { create } from 'zustand';

interface TestViewState {
  /** Whether test view mode is active */
  active: boolean;

  activate: () => void;
  deactivate: () => void;
}

export const useTestViewStore = create<TestViewState>((set) => ({
  active: false,

  activate: () => set({ active: true }),
  deactivate: () => set({ active: false }),
}));
