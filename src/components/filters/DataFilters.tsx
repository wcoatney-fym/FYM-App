import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, User, X } from 'lucide-react';
import { TimePeriodSelector } from './TimePeriodSelector';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';

interface AgencyOption {
  id: string;
  writing_number: string | null;
  name: string;
}

interface AgentOption {
  id: string;
  full_name: string | null;
  writing_number: string | null;
}

interface DataFiltersProps {
  /** Show agency filter dropdown (default true) */
  showAgencyFilter?: boolean;
  /** Show agent filter alongside agency filter */
  showAgentFilter?: boolean;
  /** Show time period filter (default true) */
  showTimePeriod?: boolean;
  /** Current selected agency writing_number (matches agency_id in edge functions) */
  selectedAgencyId: string | null;
  /** Current selected agent writing_number */
  selectedAgentId?: string | null;
  /** Current time period preset */
  selectedPreset?: DatePreset;
  /** Current date range */
  selectedDateRange?: DateRange;
  /** Callback when agency changes — receives writing_number or null */
  onAgencyChange: (agencyId: string | null) => void;
  /** Callback when agent changes — receives writing_number or null */
  onAgentChange?: (agentId: string | null) => void;
  /** Callback when time period changes */
  onDateRangeChange?: (range: DateRange, preset: DatePreset) => void;
}

export function DataFilters({
  showAgencyFilter = true,
  showAgentFilter = false,
  showTimePeriod = true,
  selectedAgencyId,
  selectedAgentId = null,
  selectedPreset = DEFAULT_PRESET,
  selectedDateRange,
  onAgencyChange,
  onAgentChange,
  onDateRangeChange,
}: DataFiltersProps) {
  const effectiveDateRange = selectedDateRange ?? getDateRange(DEFAULT_PRESET);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Load all active agencies on mount.
  // Agencies with a writing_number have production data in Max's DB.
  // Agencies without one are shown but marked — selecting them will show
  // a "no production data" state on the dashboard.
  useEffect(() => {
    if (!supabase) { setLoadingAgencies(false); return; }
    supabase
      .from('agencies')
      .select('id, writing_number, name')
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
    // Find the agency by writing_number
    const agency = agencies.find(a => a.writing_number === selectedAgencyId);
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

  // Only count agency/agent as "active filter" if the user can change them.
  // Managers are auto-locked — their agency selection is not a user-applied filter.
  const hasActiveFilters = (showAgencyFilter && !!selectedAgencyId) || !!selectedAgentId || (selectedPreset !== DEFAULT_PRESET && showTimePeriod);

  function handleClear() {
    onAgencyChange(null);
    onAgentChange?.(null);
    if (showTimePeriod) onDateRangeChange?.(getDateRange(DEFAULT_PRESET), DEFAULT_PRESET);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Time period filter */}
      {showTimePeriod && onDateRangeChange && (
        <TimePeriodSelector
          preset={selectedPreset}
          dateRange={effectiveDateRange}
          onChange={onDateRangeChange}
        />
      )}

      {/* Agency filter */}
      {showAgencyFilter && <div className="flex items-center gap-1.5">
        <Building2 size={14} className="text-muted-foreground shrink-0" />
        <select
          value={selectedAgencyId ?? ''}
          onChange={(e) => {
            const val = e.target.value || null;
            onAgencyChange(val);
            // Reset agent when agency changes
            onAgentChange?.(null);
            // Blur after selection so the browser repaints immediately.
            // Some browsers defer layout/paint while a <select> retains focus,
            // especially when CSS transitions or GPU-composited layers are active.
            e.target.blur();
          }}
          className="h-8 rounded-md border border-border bg-card px-2 pr-7 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-[180px] appearance-none"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          <option value="">{loadingAgencies ? 'Loading…' : 'All Agencies'}</option>
          {agencies.map(a => (
            <option key={a.id} value={a.writing_number ?? `no-data:${a.id}`}>
              {a.name}{a.writing_number ? '' : ' (no data yet)'}
            </option>
          ))}
        </select>
      </div>}

      {/* Agent filter (conditional) */}
      {showAgentFilter && (
        <div className="flex items-center gap-1.5">
          <User size={14} className="text-muted-foreground shrink-0" />
          <select
            value={selectedAgentId ?? ''}
            onChange={(e) => {
              onAgentChange?.(e.target.value || null);
              e.target.blur();
            }}
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
