import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, User, X } from 'lucide-react';

interface AgencyOption {
  id: string;
  tracker_id: string | null;
  name: string;
}

interface AgentOption {
  id: string;
  full_name: string | null;
  writing_number: string | null;
}

interface DataFiltersProps {
  /** Show agent filter alongside agency filter */
  showAgentFilter?: boolean;
  /** Current selected agency tracker_id (matches agency_id in data tables) */
  selectedAgencyId: string | null;
  /** Current selected agent writing_number */
  selectedAgentId?: string | null;
  /** Callback when agency changes — receives tracker_id or null */
  onAgencyChange: (agencyId: string | null) => void;
  /** Callback when agent changes — receives writing_number or null */
  onAgentChange?: (agentId: string | null) => void;
}

export function DataFilters({
  showAgentFilter = false,
  selectedAgencyId,
  selectedAgentId = null,
  onAgencyChange,
  onAgentChange,
}: DataFiltersProps) {
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Load agencies on mount
  useEffect(() => {
    if (!supabase) { setLoadingAgencies(false); return; }
    supabase
      .from('agencies')
      .select('id, tracker_id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setAgencies(data as AgencyOption[]);
        setLoadingAgencies(false);
      });
  }, []);

  // Load agents when agency changes (only if agent filter is shown)
  useEffect(() => {
    if (!supabase || !showAgentFilter || !selectedAgencyId) {
      setAgents([]);
      return;
    }
    setLoadingAgents(true);
    // Get profiles for agents in this agency — match by agency_id UUID
    // First find the agency UUID from tracker_id
    const agency = agencies.find(a => a.tracker_id === selectedAgencyId);
    if (!agency) { setLoadingAgents(false); return; }

    supabase
      .from('profiles')
      .select('id, full_name, writing_number')
      .eq('agency_id', agency.id)
      .order('full_name', { ascending: true })
      .then(({ data }) => {
        if (data) setAgents((data as AgentOption[]).filter(a => a.writing_number));
        setLoadingAgents(false);
      });
  }, [selectedAgencyId, showAgentFilter, agencies]);

  const hasActiveFilters = !!selectedAgencyId || !!selectedAgentId;

  function handleClear() {
    onAgencyChange(null);
    onAgentChange?.(null);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Agency filter */}
      <div className="flex items-center gap-1.5">
        <Building2 size={14} className="text-muted-foreground shrink-0" />
        <select
          value={selectedAgencyId ?? ''}
          onChange={(e) => {
            const val = e.target.value || null;
            onAgencyChange(val);
            // Reset agent when agency changes
            onAgentChange?.(null);
          }}
          className="h-8 rounded-md border border-border bg-card px-2 pr-7 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-[180px] appearance-none"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          <option value="">{loadingAgencies ? 'Loading…' : 'All Agencies'}</option>
          {agencies.map(a => (
            <option key={a.id} value={a.tracker_id ?? a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Agent filter (conditional) */}
      {showAgentFilter && (
        <div className="flex items-center gap-1.5">
          <User size={14} className="text-muted-foreground shrink-0" />
          <select
            value={selectedAgentId ?? ''}
            onChange={(e) => onAgentChange?.(e.target.value || null)}
            disabled={!selectedAgencyId}
            className="h-8 rounded-md border border-border bg-card px-2 pr-7 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-[180px] appearance-none disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="">
              {!selectedAgencyId
                ? 'Select agency first'
                : loadingAgents
                  ? 'Loading…'
                  : 'All Agents'}
            </option>
            {agents.map(a => (
              <option key={a.id} value={a.writing_number ?? ''}>
                {a.full_name ?? a.writing_number ?? a.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Clear button */}
      {hasActiveFilters && (
        <button
          onClick={handleClear}
          className="flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
