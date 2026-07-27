import { create } from 'zustand';
import { Workflow } from '@/lib/command-center/types';
import { mockWorkflows } from '@/lib/command-center/mock-data';

interface WorkflowState {
  workflows: Workflow[];
  activeWorkflowId: string | null;
  mockDataLoaded: boolean;
  loadMockData: () => void;
  clearMockData: () => void;
  addWorkflow: (workflow: Workflow) => void;
  setActiveWorkflow: (id: string | null) => void;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: [],
  activeWorkflowId: null,
  mockDataLoaded: false,
  loadMockData: () => set({ workflows: mockWorkflows, mockDataLoaded: true }),
  clearMockData: () => set({ workflows: [], mockDataLoaded: false }),
  addWorkflow: (workflow) =>
    set((state) => ({ workflows: [...state.workflows, workflow] })),
  setActiveWorkflow: (id) => set({ activeWorkflowId: id }),
  updateWorkflow: (id, updates) =>
    set((state) => ({
      workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    })),
  deleteWorkflow: (id) =>
    set((state) => ({ workflows: state.workflows.filter((w) => w.id !== id) })),
}));
