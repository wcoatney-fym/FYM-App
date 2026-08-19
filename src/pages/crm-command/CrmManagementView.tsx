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

// ── Tab placeholder components (will be replaced with real implementations) ──

function PlaceholderTab({ name, icon: Icon }: { name: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Icon className="w-12 h-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">{name}</p>
      <p className="text-sm mt-1">Coming soon</p>
    </div>
  );
}

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
      const { data } = await portalSupabase
        .from('hierarchy_agencies')
        .select('id', { count: 'exact', head: true })
        .eq('parent_agency_id', agencyId)
        .eq('is_active', true);
      // data is null for head requests, count comes from the response
      setAgencyCount((subAgencies?.length ?? 0) + 1);
    };
    if (subAgencies) {
      setAgencyCount(subAgencies.length + 1);
    } else {
      loadSubAgencies();
    }
  }, [agencyId, subAgencies]);

  return (
    <div className="flex flex-col h-full">
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
        {activeTab === 'dashboard' && <PlaceholderTab name="Dashboard" icon={LayoutDashboard} />}
        {activeTab === 'agents' && <PlaceholderTab name="Agent Management" icon={Users} />}
        {activeTab === 'book-of-business' && <PlaceholderTab name="Book of Business" icon={BookOpen} />}
        {activeTab === 'new-business' && <PlaceholderTab name="New Business" icon={PlusCircle} />}
        {activeTab === 'cancellation-upload' && <PlaceholderTab name="Cancellation Upload" icon={FileUp} />}
        {activeTab === 'cross-sell' && <PlaceholderTab name="Cross-Sell" icon={ArrowLeftRight} />}
        {activeTab === 'support' && <PlaceholderTab name="Support" icon={Headphones} />}
        {activeTab === 'csr-contact' && <PlaceholderTab name="CSR Contact" icon={UserCircle} />}
      </div>
    </div>
  );
}
