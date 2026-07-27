/**
 * CRM Ops Page — FYM App standard tab layout
 *
 * Ported from OpenClaw-Dashboard CrmOpsPage.tsx.
 * Uses standard FYM App tab layout (no custom sidebar, no password gate).
 *
 * Tab groups:
 *   Command Center: Dashboard, Pipeline, History
 *   Work: Work Queue, Agencies, Rosters
 *   Tools: Contact Import, Templates, Testing
 *
 * All reads/writes go through portal-supabase (akhojh…) via @/lib/crm.
 */
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart3,
  GitBranchPlus,
  ScrollText,
  ClipboardList,
  Building2,
  BookUser,
  Upload,
  FileSpreadsheet,
  FlaskConical,
  Database,
  Loader2,
} from 'lucide-react';
import {
  supabase,
  ensurePortalAuth,
  portalConfigured,
} from '@/lib/crm/portal-client';
import type { CrmAgency } from '@/lib/crm/types';

// Tab components
import { KpiDashboardTab } from './crm-ops/KpiDashboardTab';
import { PipelineTab } from './crm-ops/PipelineTab';
import { ActivityHistoryTab } from './crm-ops/ActivityHistoryTab';
import { TaskboardCurrentTab } from './crm-ops/TaskboardCurrentTab';
import { TaskboardOnboardingTab } from './crm-ops/TaskboardOnboardingTab';
import { AgenciesTab } from './crm-ops/AgenciesTab';
import { RosterTab } from './crm-ops/RosterTab';
import { ContactImportTab } from './crm-ops/ContactImportTab';
import { TemplateManagementTab } from './crm-ops/TemplateManagementTab';
import { TestingTab } from './crm-ops/TestingTab';

type CrmView =
  | 'dashboard'
  | 'pipeline'
  | 'history'
  | 'work-queue'
  | 'agencies'
  | 'roster'
  | 'contact-import'
  | 'templates'
  | 'testing';

export function CrmOpsPage() {
  const [activeTab, setActiveTab] = useState<CrmView>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [workQueueMode, setWorkQueueMode] = useState<
    'tickets' | 'onboarding'
  >('tickets');

  useEffect(() => {
    if (!portalConfigured) {
      setLoading(false);
      return;
    }
    const init = async () => {
      await ensurePortalAuth();
      setLoading(false);
    };
    init();
  }, []);

  const handleNavigate = useCallback((tab: string) => {
    setActiveTab(tab as CrmView);
  }, []);

  if (!portalConfigured) {
    return (
      <div>
        <Header title="CRM Ops" />
        <div className="text-center py-12 text-gray-500">
          <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Portal connection not configured</p>
          <p className="text-sm mt-1">
            Set VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_KEY to
            enable CRM Ops.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <Header title="CRM Ops" />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-navy-600 mr-2" />
          <span className="text-gray-600">Connecting to CRM…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="CRM Ops" />
      <div className="p-6 space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as CrmView)}
        >
          <div className="overflow-x-auto">
            <TabsList className="bg-slate-100 p-1 inline-flex min-w-max">
              {/* Command Center group */}
              <TabsTrigger value="dashboard" className="gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="gap-1.5">
                <GitBranchPlus className="w-3.5 h-3.5" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5">
                <ScrollText className="w-3.5 h-3.5" />
                History
              </TabsTrigger>

              {/* Separator */}
              <div className="w-px h-6 bg-slate-300 mx-1 self-center" />

              {/* Work group */}
              <TabsTrigger value="work-queue" className="gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" />
                Work Queue
              </TabsTrigger>
              <TabsTrigger value="agencies" className="gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Agencies
              </TabsTrigger>
              <TabsTrigger value="roster" className="gap-1.5">
                <BookUser className="w-3.5 h-3.5" />
                Rosters
              </TabsTrigger>

              {/* Separator */}
              <div className="w-px h-6 bg-slate-300 mx-1 self-center" />

              {/* Tools group */}
              <TabsTrigger value="contact-import" className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Contact Import
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="testing" className="gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" />
                Testing
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Work Queue sub-toggle */}
          {activeTab === 'work-queue' && (
            <div className="flex items-center gap-2 mt-4">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setWorkQueueMode('tickets')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    workQueueMode === 'tickets'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Tickets
                </button>
                <button
                  onClick={() => setWorkQueueMode('onboarding')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    workQueueMode === 'onboarding'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Onboarding
                </button>
              </div>
            </div>
          )}

          <TabsContent value="dashboard">
            <KpiDashboardTab
              key={`dashboard-${refreshKey}`}
              onNavigate={handleNavigate}
            />
          </TabsContent>

          <TabsContent value="pipeline">
            <PipelineTab key={`pipeline-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="history">
            <ActivityHistoryTab key={`history-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="work-queue">
            {workQueueMode === 'tickets' ? (
              <TaskboardCurrentTab key={`tb-current-${refreshKey}`} />
            ) : (
              <TaskboardOnboardingTab key={`tb-onboarding-${refreshKey}`} />
            )}
          </TabsContent>

          <TabsContent value="agencies">
            <AgenciesTab key={`agencies-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="roster">
            <RosterTab key={`roster-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="contact-import">
            <ContactImportTab key={`contact-import-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="templates">
            <TemplateManagementTab key={`templates-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="testing">
            <TestingTab key={`testing-${refreshKey}`} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
