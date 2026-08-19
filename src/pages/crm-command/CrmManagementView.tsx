/**
 * CrmManagementView — The 8-tab CRM Management portal view.
 *
 * Renders inside CRM Command for:
 *   1. Agency admins whose agency is CRM-onboarded (crm_enabled=true)
 *   2. FYM admins in "View As" mode for a CRM-onboarded agency
 *   3. FYM admins who click "View As" from CRM Ops → Agencies
 *
 * Tabs mirror the existing CRM Management portal:
 *   Dashboard, Agent Management, Book of Business, New Business,
 *   Cancellation Upload, Cross-Sell, Support, CSR Contact
 *
 * Data is scoped to the effective agency via useEffectiveAuth().
 */
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, BookOpen, PlusCircle,
  FileUp, ArrowLeftRight, Headphones, UserCircle,
  ArrowLeft,
} from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';
import { AgentManagementTab } from './AgentManagementTab';
import { CrmDashboardTab } from './CrmDashboardTab';
import { SupportTab } from './SupportTab';
import { CsrContactTab } from './CsrContactTab';
import { NewBusinessTab } from './NewBusinessTab';
import { BookOfBusinessTab } from './BookOfBusinessTab';
import { CancellationUploadTab } from './CancellationUploadTab';
import { CrossSellTab } from './CrossSellTab';

// ── Tab placeholder components (will be replaced with real implementations) ──

// All 8 tabs are now data-connected — no more placeholders needed

// ── Types ──

type CrmMgmtTab =
  | 'dashboard'
  | 'agents'
  | 'book-of-business'
  | 'new-business'
  | 'cancellation-upload'
  | 'cross-sell'
  | 'support'
  | 'csr-contact';

interface TabDef {
  id: CrmMgmtTab;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agents', label: 'Agent Management', icon: Users },
  { id: 'book-of-business', label: 'Book of Business', icon: BookOpen },
  { id: 'new-business', label: 'New Business', icon: PlusCircle },
  { id: 'cancellation-upload', label: 'Cancellation Upload', icon: FileUp },
  { id: 'cross-sell', label: 'Cross-Sell', icon: ArrowLeftRight },
  { id: 'support', label: 'Support', icon: Headphones },
  { id: 'csr-contact', label: 'CSR Contact', icon: UserCircle },
];

// ── Props ──

interface CrmManagementViewProps {
  /** The agency name to scope data to */
  agencyName: string;
  /** The agency ID (from FYM App agencies table) */
  agencyId: string;
  /** Whether to show a "Back" button (for FYM admin View As) */
  onBack?: () => void;
  /** Optional: sub-agencies to show in the filter (like MHA YFMO showing MHA IFG) */
  subAgencies?: { id: string; name: string }[];
}

export function CrmManagementView({ agencyName, agencyId, onBack, subAgencies }: CrmManagementViewProps) {
  const [activeTab, setActiveTab] = useState<CrmMgmtTab>('dashboard');
  const [agencyCount, setAgencyCount] = useState<number>(0);

  // Load sub-agency count from portal DB
  useEffect(() => {
    if (!portalSupabase) return;
    const loadSubAgencies = async () => {
      const { count } = await portalSupabase
        .from('hierarchy_agencies')
        .select('id', { count: 'exact', head: true })
        .eq('parent_agency_id', agencyId)
        .eq('is_active', true);
      setAgencyCount((count ?? 0) + 1); // +1 for the parent agency itself
    };
    if (subAgencies) {
      setAgencyCount(subAgencies.length + 1);
    } else {
      loadSubAgencies();
    }
  }, [agencyId, subAgencies]);

  return (
    <div className="flex flex-col h-full px-6 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to CRM Command
          </button>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-foreground">{agencyName}</h2>
          {agencyCount > 1 && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {agencyCount} agencies
            </span>
          )}
        </div>
      </div>

      {/* Tab bar — styled to match the CRM Management portal */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 border-b border-border/40 scrollbar-thin">
        {TABS.map((tab) => (
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
        {activeTab === 'dashboard' && <CrmDashboardTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'agents' && <AgentManagementTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'book-of-business' && <BookOfBusinessTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'new-business' && <NewBusinessTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'cancellation-upload' && <CancellationUploadTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'cross-sell' && <CrossSellTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'support' && <SupportTab agencyName={agencyName} agencyId={agencyId} />}
        {activeTab === 'csr-contact' && <CsrContactTab agencyName={agencyName} agencyId={agencyId} />}
      </div>
    </div>
  );
}
