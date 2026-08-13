import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ScrollText, KanbanSquare, GitBranch,
  Workflow, BarChart3, Target, Users, Headphones, Settings
} from 'lucide-react';

// Tab components
import { CcDashboardTab } from './crm-command/CcDashboardTab';
import { CcChatTab } from './crm-command/CcChatTab';
import { CcTasksTab } from './crm-command/CcTasksTab';
import { CcPipelinesTab } from './crm-command/CcPipelinesTab';
import { CcWorkflowsTab } from './crm-command/CcWorkflowsTab';
import { CcAnalyticsTab } from './crm-command/CcAnalyticsTab';
import { CcAgencyHealthTab } from './crm-command/CcAgencyHealthTab';
import { CcTeamTab } from './crm-command/CcTeamTab';
import { CrmOpsPage } from './CrmOpsPage';
import { CcSettingsTab } from './crm-command/CcSettingsTab';
import { CcBackfillTab } from './crm-command/CcBackfillTab';
import { CcRecruitingLogTab } from './crm-command/CcRecruitingLogTab';

type CrmCommandTab =
  | 'dashboard'
  | 'chat'
  | 'tasks'
  | 'pipelines'
  | 'workflows'
  | 'analytics'
  | 'tyler'
  | 'team'
  | 'crm-ops'
  | 'recruiting-log'
  | 'backfill'
  | 'settings';

const tabs: { id: CrmCommandTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Command Log', icon: ScrollText },
  { id: 'tasks', label: 'Task Board', icon: KanbanSquare },
  { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'tyler', label: 'Tyler Board', icon: Target },
  { id: 'team', label: 'Team & Roles', icon: Users },
  { id: 'crm-ops', label: 'CRM Ops', icon: Headphones },
  { id: 'recruiting-log' as CrmCommandTab, label: 'Recruiting Log', icon: GitBranch },
  { id: 'backfill', label: 'FYM APP Backfill', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const VALID_TABS = new Set<string>(tabs.map((t) => t.id));

export function CrmCommandPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || '';
  const activeTab: CrmCommandTab = VALID_TABS.has(rawTab) ? (rawTab as CrmCommandTab) : 'dashboard';

  const setActiveTab = useCallback((tab: CrmCommandTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'dashboard') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 border-b border-border/40 scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium whitespace-nowrap transition-all border-b-2',
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <CcDashboardTab />}
        {activeTab === 'chat' && <CcChatTab />}
        {activeTab === 'tasks' && <CcTasksTab />}
        {activeTab === 'pipelines' && <CcPipelinesTab />}
        {activeTab === 'workflows' && <CcWorkflowsTab />}
        {activeTab === 'analytics' && <CcAnalyticsTab />}
        {activeTab === 'tyler' && <CcAgencyHealthTab />}
        {activeTab === 'team' && <CcTeamTab />}
        {activeTab === 'crm-ops' && <CrmOpsPage />}
        {activeTab === 'recruiting-log' && <CcRecruitingLogTab />}
        {activeTab === 'backfill' && <CcBackfillTab />}
        {activeTab === 'settings' && <CcSettingsTab />}
      </div>
    </div>
  );
}
