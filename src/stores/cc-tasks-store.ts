import { create } from 'zustand';
import type { EngineRunResult } from '@/lib/command-center/engine-run';
export type EngineRunSummary = Pick<EngineRunResult, 'totalUpserted' | 'ranAt' | 'reconciliation' | 'activation'>;
import { Task, TaskStatus } from '@/lib/command-center/types';
import { mockTasks } from '@/lib/command-center/mock-data';
import { fetchTasks, persistTaskStatus, createTask, persistTaskUpdate } from '@/lib/command-center/task-hq';
import { runIdleRebalance } from '@/lib/command-center/rebalance-run';
import { runAllEngines } from '@/lib/command-center/engine-run';

interface TasksState {
  tasks: Task[];
  mockDataLoaded: boolean;
  loading: boolean;
  source: 'live' | 'seed' | 'mock' | null;
  loadMockData: () => void;
  clearMockData: () => void;
  /** Load tasks from the task-HQ DB (empty board when unconfigured). */
  loadLive: () => Promise<void>;
  /** Trigger all task-generation engines (reconciliation + activation-aging), then reload. */
  runEngines: () => Promise<EngineRunSummary>;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  deleteTask: (id: string) => void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  mockDataLoaded: false,
  loading: false,
  source: null,
  loadMockData: () => set({ tasks: mockTasks, mockDataLoaded: true, source: 'mock' }),
  clearMockData: () => set({ tasks: [], mockDataLoaded: false, source: null }),
  loadLive: async () => {
    set({ loading: true });
    const { tasks, source } = await fetchTasks();
    set({ tasks, source, loading: false });
  },
  runEngines: async () => {
    set({ loading: true });
    const result = await runAllEngines();
    // Reload tasks so newly-generated ones appear immediately.
    const { tasks, source } = await fetchTasks();
    set({ tasks, source, loading: false });
    return result;
  },
  addTask: (task) => {
    set((state) => ({ tasks: [...state.tasks, task] }));
    void createTask(task);
  },
  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    void persistTaskUpdate(id, updates);
  },
  moveTask: (id, status) => {
    const prev = get().tasks.find((t) => t.id === id);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
    void persistTaskStatus(id, status);
    // Work-stealing: when a task is completed, pull its owner onto remaining work.
    if (status === 'done' && prev && prev.status !== 'done' && prev.assigneeId) {
      void runIdleRebalance(prev.assigneeId);
    }
  },
  deleteTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
}));
