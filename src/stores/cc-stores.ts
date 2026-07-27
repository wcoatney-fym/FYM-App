import { useTasksStore } from './cc-tasks-store';
import { useChatStore } from './cc-chat-store';
import { usePipelineStore } from './cc-pipeline-store';
import { useTeamStore } from './cc-team-store';
import { useWorkflowStore } from './cc-workflow-store';
import { useSettingsStore } from './cc-settings-store';

export function useLoadMockData() {
  const loadTasks = useTasksStore((s) => s.loadMockData);
  const loadChat = useChatStore((s) => s.loadMockData);
  const loadPipeline = usePipelineStore((s) => s.loadMockData);
  const loadTeam = useTeamStore((s) => s.loadMockData);
  const loadWorkflows = useWorkflowStore((s) => s.loadMockData);
  const loadActivities = useSettingsStore((s) => s.loadMockActivities);
  const enableMock = useSettingsStore((s) => s.enableMockData);

  return () => {
    loadTasks();
    loadChat();
    loadPipeline();
    loadTeam();
    loadWorkflows();
    loadActivities();
    enableMock();
  };
}

export function useClearMockData() {
  const clearTasks = useTasksStore((s) => s.clearMockData);
  const clearChat = useChatStore((s) => s.clearMockData);
  const clearPipeline = usePipelineStore((s) => s.clearMockData);
  const clearTeam = useTeamStore((s) => s.clearMockData);
  const clearWorkflows = useWorkflowStore((s) => s.clearMockData);
  const clearActivities = useSettingsStore((s) => s.clearMockActivities);
  const disableMock = useSettingsStore((s) => s.disableMockData);

  return () => {
    clearTasks();
    clearChat();
    clearPipeline();
    clearTeam();
    clearWorkflows();
    clearActivities();
    disableMock();
  };
}

export { useTasksStore } from './cc-tasks-store';
export { useChatStore } from './cc-chat-store';
export { usePipelineStore } from './cc-pipeline-store';
export { useTeamStore } from './cc-team-store';
export { useWorkflowStore } from './cc-workflow-store';
export { useSettingsStore } from './cc-settings-store';
