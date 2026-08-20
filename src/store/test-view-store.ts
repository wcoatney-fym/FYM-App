/**
 * Test View Store — controls the stage override for the agent
 * contracting test/demo mode.
 *
 * When active, useAgentContractingStage and AgentContractingPage
 * use the overridden stage instead of querying the DB.
 *
 * Only used by FYM admins in View As mode to walk through the
 * agent contracting experience at each pipeline stage.
 */
import { create } from 'zustand';
import type { AgentPipelineStage } from '@/lib/contracting/types';

interface TestViewState {
  /** Whether test view stage override is active */
  active: boolean;
  /** The overridden pipeline stage */
  stage: AgentPipelineStage | null;
  /** Stage index for progress display */
  stageIndex: number;

  activate: (stage: AgentPipelineStage, stageIndex: number) => void;
  setStage: (stage: AgentPipelineStage, stageIndex: number) => void;
  deactivate: () => void;
}

export const useTestViewStore = create<TestViewState>((set) => ({
  active: false,
  stage: null,
  stageIndex: 0,

  activate: (stage, stageIndex) =>
    set({ active: true, stage, stageIndex }),

  setStage: (stage, stageIndex) =>
    set({ stage, stageIndex }),

  deactivate: () =>
    set({ active: false, stage: null, stageIndex: 0 }),
}));
