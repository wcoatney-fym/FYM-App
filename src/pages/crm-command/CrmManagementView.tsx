/**
 * CrmManagementView — The 8-tab CRM Management portal view.
 *
 * Ported 1:1 from contracting-portal/src/pages/AgencyPortal.tsx.
 *
 * Renders inside CRM Command for:
 *   1. Agency admins whose agency is CRM-onboarded (crm_enabled=true)
 *   2. FYM admins in "View As" mode for a CRM-onboarded agency
 *   3. FYM admins who click "View CRM" from CRM Ops → Agencies
 *
 * Tabs mirror the existing CRM Management portal exactly:
 *   Dashboard, Agent Management, Book of Business, New Business,
 *   Cancellation Upload, Cross-Sell, Support, CSR Contact
 */
import { useState } from 'react';
import {
  BarChart3, Users, BookOpen, FileText,
  Upload, Package, MessageSquareText, Headphones,
  ArrowLeft,
} from 'lucide-react';
import { usePortalAgency } from '@/hooks/usePortalAgency';
import { AgentManagementTab } from './AgentManagementTab';
import { CrmDashboardTab } from './CrmDashboardTab';
import { SupportTab } from './SupportTab';
import { CsrContactTab } from './CsrContactTab';
import { NewBusinessTab } from './NewBusinessTab';
import { BookOfBusinessTab } from './BookOfBusinessTab';
import { CancellationUploadTab } from './CancellationUploadTab';
import { CrossSellTab } from './CrossSellTab';

type PortalTab = 'dashboard' | 'agents' | 'book' | 'intake' | 'cancellations' | 'cross-sell' | 'tickets' | 'csr';

const TAB_ITEMS: { key: PortalTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'agents', label: 'Agent Management', icon: Users },
  { key: 'book', label: 'Book of Business', icon: BookOpen },
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
  const [activeTab, setActiveTab] = useState<PortalTab>('dashboard');
  const { loading, agency, allAgencies, agencyIds, agencyNames, refresh } = usePortalAgency(agencyName);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-6">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mb-6 text-sm text-steel-500 hover:text-steel-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to CRM Command
          </button>
        )}
        <div className="text-center">
          <p className="text-lg font-bold text-steel-900">Agency Not Found</p>
          <p className="text-sm text-steel-500 mt-1">Could not find CRM data for "{agencyName}"</p>
        </div>
      </div>
    );
  }

  const hiddenTabs = agency.portal_hidden_tabs || [];
  const visibleTabs = TAB_ITEMS.filter(t => !hiddenTabs.includes(t.key));

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header bar — matches portal's dark navy header */}
      <div className="flex items-center justify-between h-14 px-6 bg-navy-900">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <div>
            <h2 className="text-sm font-bold text-white">{agency.name}</h2>
            {allAgencies.length > 1 && (
              <p className="text-[11px] text-white/50">{allAgencies.length} agencies</p>
            )}
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs text-white/60 hover:text-white transition-colors"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Tab bar — white background with pill-style active tab */}
      <div className="flex items-center gap-1 px-6 py-2 bg-white border-b border-steel-200 overflow-x-auto">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-navy-800 text-white'
                  : 'text-steel-600 hover:bg-steel-100 hover:text-steel-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — white background to match portal */}
      <div className="flex-1 overflow-y-auto px-6 py-5 bg-steel-50">
        {activeTab === 'dashboard' && (
          <CrmDashboardTab agencyName={agencyName} agencyId={agency.id} agencyIds={agencyIds} agencyNames={agencyNames} />
        )}
        {activeTab === 'agents' && (
          <AgentManagementTab agencyName={agencyName} agencyId={agency.id} agency={agency} agencyIds={agencyIds} agencyNames={agencyNames} />
        )}
        {activeTab === 'book' && (
          <BookOfBusinessTab agencyName={agencyName} agencyId={agency.id} agencyIds={agencyIds} agencyNames={agencyNames} />
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
