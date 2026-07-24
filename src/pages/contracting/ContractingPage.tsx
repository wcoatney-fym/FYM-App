/**
 * Contracting Page — Stage 4 absorption
 *
 * Replaces the old redirect card with a full tabbed layout.
 * Each tab is a shell that will be wired to portal data in subsequent PRs.
 *
 * Tab layout:
 *   Dashboard  — KPI cards, agency perf, recent activity
 *   Intake     — New hires queue, form generator/sender
 *   Tracking   — Agent status table with search/filter/edit/export
 *   Pipeline   — Kanban board + list view of agent pipeline
 *   Training   — Content stats, quiz leaderboard, live sessions
 *
 * Portal data flows through portal-supabase.ts (akhojh…) during the
 * parallel-run period. When contracting reaches full parity, data migrates
 * to rcbzag and portal-supabase.ts retires.
 */
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExternalLink } from 'lucide-react';
import { ContractingDashboardTab } from './ContractingDashboardTab';
import { ContractingIntakeTab } from './ContractingIntakeTab';
import { ContractingTrackingTab } from './ContractingTrackingTab';
import { ContractingPipelineTab } from './ContractingPipelineTab';
import { ContractingTrainingTab } from './ContractingTrainingTab';
import type { ContractingTab } from '@/lib/contracting/types';

export function ContractingPage() {
  const [activeTab, setActiveTab] = useState<ContractingTab>('dashboard');

  return (
    <div>
      <Header title="Contracting" />
      <div className="p-6 space-y-6">
        {/* Portal bridge banner — visible during parallel-run period */}
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Parallel run:</span> These tabs read
            from the CRM Portal database. The original portal is still live at{' '}
            <a
              href="https://contracting.teamfym.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-900 font-medium"
            >
              contracting.teamfym.com
            </a>
            .
          </p>
          <a
            href="https://contracting.teamfym.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium whitespace-nowrap ml-4"
          >
            Open Portal <ExternalLink size={12} />
          </a>
        </div>

        {/* Tab navigation */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ContractingTab)}
        >
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="intake">Intake</TabsTrigger>
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <ContractingDashboardTab />
          </TabsContent>

          <TabsContent value="intake">
            <ContractingIntakeTab />
          </TabsContent>

          <TabsContent value="tracking">
            <ContractingTrackingTab />
          </TabsContent>

          <TabsContent value="pipeline">
            <ContractingPipelineTab />
          </TabsContent>

          <TabsContent value="training">
            <ContractingTrainingTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
