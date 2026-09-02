import { useCallback, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ScrollText, KanbanSquare, GitBranch,
  Workflow, BarChart3, Target, Users, Headphones, Settings, Database, ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { supabase } from '@/lib/supabase';
import { CrmManagementView } from './crm-command/CrmManagementView';
import { useCrmViewStore } from '@/store/crm-view-store';
import {
  ensurePortalAuth,
  portalConfigured,
} from '@/lib/crm/portal-client';

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
import { CcAgencyAccessTab } from './crm-command/CcAgencyAccessTab';

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
  | 'agency-access'
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
  { id: 'agency-access', label: 'Agency Access', icon: ShieldCheck },
  { id: 'backfill', label: 'FYM APP Backfill', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const VALID_TABS = new Set<string>(tabs.map((t) => t.id));

export function CrmCommandPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || '';
  const activeTab: CrmCommandTab = VALID_TABS.has(rawTab) ? (rawTab as CrmCommandTab) : 'dashboard';
  const { isFymAdmin, effectiveAgencyId, isViewingAs } = useEffectiveAuth();
  const { viewingAgency, clearView } = useCrmViewStore();

  // Portal auth — page-level gate (Step 2: gating before locking)
  const [portalReady, setPortalReady] = useState(!portalConfigured);

  useEffect(() => {
    if (!portalConfigured) return;
    let cancelled = false;
    const init = async () => {
      await ensurePortalAuth();
      if (!cancelled) setPortalReady(true);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Track whether to show the CRM Management view (for agency admins or FYM admin "View As")
  const [agencyCrmEnabled, setAgencyCrmEnabled] = useState<boolean | null>(null);
  const [agencyName, setAgencyName] = useState<string>('');

  // For agency admins: check if their agency is CRM-enabled
  useEffect(() => {
    if (isFymAdmin && !isViewingAs) {
      // FYM admin in normal mode — show admin tabs
      setAgencyCrmEnabled(false);
      return;
    }
    if (!effectiveAgencyId || !supabase) {
      setAgencyCrmEnabled(false);
      return;
    }
    supabase
      .from('agencies')
      .select('crm_enabled, name')
      .eq('id', effectiveAgencyId)
      .maybeSingle()
      .then(({ data }) => {
        setAgencyCrmEnabled(data?.crm_enabled ?? false);
        setAgencyName(data?.name ?? '');
      });
  }, [effectiveAgencyId, isFymAdmin, isViewingAs]);

  const setActiveTab = useCallback((tab: CrmCommandTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'dashboard') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Portal auth loading gate — blocks child rendering until ensurePortalAuth resolves
  if (!portalReady) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-navy-600 mr-2" />
        <span className="text-muted-foreground">Connecting to CRM…</span>
      </div>
    );
  }

  // FYM admin clicked "View CRM" on a specific agency from CRM Ops
  if (viewingAgency) {
    return (
      <CrmManagementView
        agencyName={viewingAgency.name}
        agencyId={viewingAgency.id}
        onBack={clearView}
      />
    );
  }

  // Agency admin with CRM-enabled agency → show CRM Management view
  if (!isFymAdmin && agencyCrmEnabled && effectiveAgencyId) {
    return (
      <CrmManagementView
        agencyName={agencyName}
        agencyId={effectiveAgencyId}
      />
    );
  }

  // FYM admin in View As mode with CRM-enabled agency → show CRM Management view
  if (isFymAdmin && isViewingAs && agencyCrmEnabled && effectiveAgencyId) {
    return (
      <CrmManagementView
        agencyName={agencyName}
        agencyId={effectiveAgencyId}
      />
    );
  }

  // Default: FYM admin view with 13 tabs
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
        {activeTab === 'agency-access' && <CcAgencyAccessTab />}
        {activeTab === 'backfill' && <CcBackfillTab />}
        {activeTab === 'settings' && <CcSettingsTab />}
      </div>
    </div>
  );
}
