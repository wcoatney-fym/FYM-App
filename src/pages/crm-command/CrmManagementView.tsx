/**
 * CrmManagementView — The 6-tab CRM Management portal view.
 *
 * Ported 1:1 from contracting-portal/src/pages/AgencyPortal.tsx.
 * Styled to match FYM App's dark theme design system.
 *
 * Renders inside CRM Command for:
 *   1. Agency admins whose agency is CRM-onboarded (crm_enabled=true)
 *   2. FYM admins in "View As" mode for a CRM-onboarded agency
 *   3. FYM admins who click "View CRM" from CRM Ops → Agencies
 *
 * Tabs:
 *   Agent Management, New Business, Cancellation Upload,
 *   Cross-Sell, Support, CSR Contact
 *
 * Removed (2026-09-04): Dashboard (CrmDashboardTab) and Book of Business
 * (BookOfBusinessTab) — dead agency-facing features, toggled off as
 * "Coming Soon" for all CRM-enabled agencies. Admin CRM Ops dashboard
 * (KpiDashboardTab) and admin Book of Business page (BookOfBusinessPage)
 * are unaffected.
 */
import { useState } from 'react';
import {
  Users, FileText,
  Upload, Package, MessageSquareText, Headphones,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortalAgency } from '@/hooks/usePortalAgency';
import { AgentManagementTab } from './AgentManagementTab';
import { SupportTab } from './SupportTab';
import { CsrContactTab } from './CsrContactTab';
import { NewBusinessTab } from './NewBusinessTab';
import { CancellationUploadTab } from './CancellationUploadTab';
import { CrossSellTab } from './CrossSellTab';

type PortalTab = 'agents' | 'intake' | 'cancellations' | 'cross-sell' | 'tickets' | 'csr';

const TAB_ITEMS: { key: PortalTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'agents', label: 'Agent Management', icon: Users },
  { key: 'intake', label: 'New Business', icon: FileText },
  { key: 'cancellations', label: 'Cancellation Upload', icon: Upload },
  { key: 'cross-sell', label: 'Cross-Sell', icon: Package },
  { key: 'tickets', label: 'Support', icon: MessageSquareText },
  { key: 'csr', label: 'CSR Contact', icon: Headphones },
];

interface CrmManagementViewProps {
  agencyName: string;
  agencyId: string;
  onBack?: () => void;
  subAgencies?: { id: string; name: string }[];
}

export function CrmManagementView({ agencyName, agencyId: _agencyId, onBack }: CrmManagementViewProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('agents');
  const { loading, agency, allAgencies, agencyIds, agencyNames, refresh } = usePortalAgency(agencyName);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-6">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mb-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to CRM Command
          </button>
        )}
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">Agency Not Found</p>
          <p className="text-sm text-muted-foreground mt-1">Could not find CRM data for "{agencyName}"</p>
        </div>
      </div>
    );
  }

  const hiddenTabs = agency.portal_hidden_tabs || [];
  const visibleTabs = TAB_ITEMS.filter(t => !hiddenTabs.includes(t.key));

  return (
    <div className="flex flex-col h-full">
      {/* Header — agency name + back button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">{agency.name}</h1>
            {allAgencies.length > 1 && (
              <p className="text-xs text-muted-foreground">{allAgencies.length} agencies</p>
            )}
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to CRM Command
          </button>
        )}
      </div>

      {/* Tab bar — matches FYM App's existing tab pattern */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 border-b border-border/40 scrollbar-thin">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium whitespace-nowrap transition-all border-b-2',
                activeTab === tab.key
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'agents' && (
          <AgentManagementTab agencyName={agencyName} agencyId={agency.id} agency={agency} agencyIds={agencyIds} agencyNames={agencyNames} />
        )}
        {activeTab === 'intake' && (
          <NewBusinessTab agencyName={agencyName} agencyId={agency.id} agencyIds={agencyIds} agencyNames={agencyNames} agency={agency} />
        )}
        {activeTab === 'cancellations' && (
          <CancellationUploadTab agencyName={agencyName} agencyId={agency.id} agencyIds={agencyIds} agency={agency} />
        )}
        {activeTab === 'cross-sell' && (
          <CrossSellTab agencyName={agencyName} agencyId={agency.id} agencyIds={agencyIds} allAgencies={allAgencies} />
        )}
        {activeTab === 'tickets' && (
          <SupportTab agencyName={agencyName} agencyId={agency.id} agencyIds={agencyIds} agency={agency} />
        )}
        {activeTab === 'csr' && (
          <CsrContactTab agencyName={agencyName} agencyId={agency.id} agency={agency} onRefresh={refresh} />
        )}
      </div>
    </div>
  );
}
