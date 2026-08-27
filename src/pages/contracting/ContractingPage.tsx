/**
 * Contracting Page — Stage 4 absorption
 *
 * Replaces the old redirect card with a full tabbed layout.
 * Each tab is wired to portal data via portal-supabase.ts.
 *
 * Tab layout:
 *   Dashboard  — KPI cards, agency perf, recent activity
 *   Intake     — New hires queue, form generator/sender
 *   Tracking   — Agent status table with search/filter/edit/export
 *   Pipeline   — Kanban board + list view of agent pipeline
 *   Training   — Content stats, quiz leaderboard, live sessions
 *   Database   — Complete agent database with actions
 *
 * Portal data flows through portal-supabase.ts (akhojh…) during the
 * parallel-run period. When contracting reaches full parity, data migrates
 * to rcbzag and portal-supabase.ts retires.
 *
 * Role scoping: FYM admins (org-wide) see every tab. Agency admins are
 * scoped to their own hierarchy and only see the Hierarchy tab.
 */
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExternalLink } from 'lucide-react';
import { ContractingDashboardTab } from './ContractingDashboardTab';
import { ContractingIntakeTab } from './ContractingIntakeTab';
import { ContractingTrackingTab } from './ContractingTrackingTab';
import { ContractingPipelineTab } from './ContractingPipelineTab';
import { ContractingTrainingTab } from './ContractingTrainingTab';
import { AgentDatabaseTab } from './database';
import { ContractingHierarchyTab } from './ContractingHierarchyTab';
import { ContractingRosterImportTab } from './ContractingRosterImportTab';
import { CarrierUploadTab } from './carrier-upload';
import { ContractingOnboardingTab } from './onboarding/ContractingOnboardingTab';
import { ContractingCoachingTab } from './ContractingCoachingTab';
import type { ContractingTab } from '@/lib/contracting/types';
// carrier-upload tab type added below
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

const ALL_TABS: ContractingTab[] = [
  'dashboard',
  'intake',
  'tracking',
  'pipeline',
  'training',
  'coaching',
  'database',
  'hierarchy',
  'onboarding',
  'roster-import',
  'carrier-upload',
];

const AGENCY_ADMIN_TABS: ContractingTab[] = ['hierarchy'];

const TAB_LABELS: Record<ContractingTab, string> = {
  dashboard: 'Dashboard',
  intake: 'Intake',
  tracking: 'Tracking',
  pipeline: 'Pipeline',
  training: 'Training',
  coaching: 'Coaching',
  database: 'Database',
  hierarchy: 'Hierarchy',
  onboarding: 'Onboarding',
  'roster-import': 'Roster Import',
  'carrier-upload': 'Carrier Upload',
};

export function ContractingPage() {
  const { isOrgWide, loading } = useEffectiveAuth();
  const availableTabs = isOrgWide ? ALL_TABS : AGENCY_ADMIN_TABS;
  const [activeTab, setActiveTab] = useState<ContractingTab>('dashboard');

  // Sync activeTab when auth resolves — default is 'dashboard' (FYM admin,
  // the common case). Agency admins only get the Hierarchy tab, so narrow
  // down after auth loads. This avoids the visible tab flash that happened
  // when defaulting to 'hierarchy' and bumping up to 'dashboard'.
  useEffect(() => {
    if (!loading && !isOrgWide && activeTab === 'dashboard') {
      setActiveTab('hierarchy');
    }
  }, [loading, isOrgWide]);

  // Don't render tabs until auth resolves — prevents flashing the wrong tab set
  if (loading) {
    return (
      <div>
        <Header title="Contracting" />
        <div className="p-6">
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Contracting" />
      <div className="p-6 space-y-6">
        {/* Portal bridge banner — visible during parallel-run period */}
        <div className="flex items-center justify-between bg-cyan-500/10 border border-blue-500/20 rounded-lg px-4 py-2.5">
          <p className="text-sm text-blue-300">
            <span className="font-medium">Parallel run:</span> These tabs read
            from the CRM Portal database. The original portal is still live at{' '}
            <a
              href="https://contracting.teamfym.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-200 font-medium"
            >
              contracting.teamfym.com
            </a>
            .
          </p>
          <a
            href="https://contracting.teamfym.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-blue-300 font-medium whitespace-nowrap ml-4"
          >
            Open Portal <ExternalLink size={12} />
          </a>
        </div>

        {/* Tab navigation */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ContractingTab)}
        >
          <TabsList className="bg-secondary/40 p-1">
            {availableTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>

          {availableTabs.includes('dashboard') && (
            <TabsContent value="dashboard">
              <ContractingDashboardTab />
            </TabsContent>
          )}

          {availableTabs.includes('intake') && (
            <TabsContent value="intake">
              <ContractingIntakeTab />
            </TabsContent>
          )}

          {availableTabs.includes('tracking') && (
            <TabsContent value="tracking">
              <ContractingTrackingTab />
            </TabsContent>
          )}

          {availableTabs.includes('pipeline') && (
            <TabsContent value="pipeline">
              <ContractingPipelineTab />
            </TabsContent>
          )}

          {availableTabs.includes('training') && (
            <TabsContent value="training">
              <ContractingTrainingTab />
            </TabsContent>
          )}

          {availableTabs.includes('coaching') && (
            <TabsContent value="coaching">
              <ContractingCoachingTab />
            </TabsContent>
          )}

          {availableTabs.includes('database') && (
            <TabsContent value="database">
              <AgentDatabaseTab />
            </TabsContent>
          )}

          {availableTabs.includes('hierarchy') && (
            <TabsContent value="hierarchy">
              <ContractingHierarchyTab />
            </TabsContent>
          )}

          {availableTabs.includes('onboarding') && (
            <TabsContent value="onboarding">
              <ContractingOnboardingTab />
            </TabsContent>
          )}

          {availableTabs.includes('roster-import') && (
            <TabsContent value="roster-import">
              <ContractingRosterImportTab />
            </TabsContent>
          )}

          {availableTabs.includes('carrier-upload') && (
            <TabsContent value="carrier-upload">
              <CarrierUploadTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
