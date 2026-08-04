/**
 * useAgentDirectory — Two-tier agent resolution hook
 *
 * Tier 1: agency_rosters in rcbzag (confirmed agents with name/NPN/WN)
 * Tier 2: Max's prod DB via agent-directory edge function (fallback)
 *
 * Merges both sources into a unified agent list. Roster agents take
 * priority — if an agent's writing number appears in both, the roster
 * version wins (it has confirmed identity data).
 *
 * Returns: unified agent list with production metrics, loading state,
 * agency filter options, and search/pagination controls.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAgentDirectory } from '@/lib/prod-api';

// ── Types ────────────────────────────────────────────────────────────────

export interface UnifiedAgent {
  /** Unique key — writing number or roster row ID */
  id: string;
  writing_number: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  npn: string | null;
  agency_id: string | null;
  agency_name: string | null;
  agency_wn: string | null;
  /** 'roster' = from agency_rosters, 'prod' = from Max's DB */
  source: 'roster' | 'prod';
  is_manager: boolean;
  // Production metrics (from prod DB)
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  at_risk_policies: number;
  total_annual_premium: number;
  active_annual_premium: number;
  // Carrier writing numbers (roster only)
  gtl_writing_number: string | null;
  ahl_writing_number: string | null;
  heartland_writing_number: string | null;
  manhattan_writing_number: string | null;
}

interface AgencyOption {
  id: string;
  name: string;
  writing_number: string | null;
  has_roster: boolean;
  agent_count: number;
}

interface UseAgentDirectoryReturn {
  agents: UnifiedAgent[];
  filteredAgents: UnifiedAgent[];
  agencies: AgencyOption[];
  loading: boolean;
  error: string | null;
  // Filters
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  agencyFilter: string;
  setAgencyFilter: (v: string) => void;
  sourceFilter: '' | 'roster' | 'prod';
  setSourceFilter: (v: '' | 'roster' | 'prod') => void;
  // Stats
  totalRoster: number;
  totalProd: number;
  rosterAgencyCount: number;
  // Refresh
  refresh: () => void;
}

// ── Roster row type (from agency_rosters table) ──────────────────────

interface RosterRow {
  id: string;
  agency_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  agent_npn: string;
  unl_writing_number: string | null;
  gtl_writing_number: string | null;
  ahl_writing_number: string | null;
  heartland_writing_number: string | null;
  manhattan_writing_number: string | null;
  is_manager: boolean;
  status: string;
}

interface AgencyRow {
  id: string;
  name: string;
  writing_number: string | null;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useAgentDirectory(): UseAgentDirectoryReturn {
  const [rosterAgents, setRosterAgents] = useState<UnifiedAgent[]>([]);
  const [prodAgents, setProdAgents] = useState<UnifiedAgent[]>([]);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'roster' | 'prod'>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Load both tiers on mount
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      // ── Tier 1: Load roster agents from rcbzag ────────────────────
      const agencyMap = new Map<string, AgencyRow>();
      const rosterWns = new Set<string>();
      const rosterResults: UnifiedAgent[] = [];
      const rosterAgenciesSet = new Set<string>();

      if (supabase) {
        // Load agencies first
        const { data: agencyData } = await supabase
          .from('agencies')
          .select('id, name, writing_number')
          .order('name');

        for (const a of (agencyData || []) as AgencyRow[]) {
          agencyMap.set(a.id, a);
        }

        // Load all active roster entries (paginated)
        const PAGE = 1000;
        let offset = 0;
        let allRoster: RosterRow[] = [];

        while (true) {
          const { data } = await supabase
            .from('agency_rosters')
            .select('id, agency_id, first_name, last_name, email, phone, agent_npn, unl_writing_number, gtl_writing_number, ahl_writing_number, heartland_writing_number, manhattan_writing_number, is_manager, status')
            .eq('status', 'active')
            .range(offset, offset + PAGE - 1);

          const rows = (data || []) as RosterRow[];
          allRoster = allRoster.concat(rows);
          if (rows.length < PAGE) break;
          offset += PAGE;
        }

        for (const r of allRoster) {
          const agency = agencyMap.get(r.agency_id);
          const wn = r.unl_writing_number?.trim() || null;
          if (wn) rosterWns.add(wn);
          rosterAgenciesSet.add(r.agency_id);

          rosterResults.push({
            id: r.id,
            writing_number: wn,
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            full_name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
            email: r.email || null,
            phone: r.phone || null,
            npn: r.agent_npn || null,
            agency_id: r.agency_id,
            agency_name: agency?.name || null,
            agency_wn: agency?.writing_number || null,
            source: 'roster',
            is_manager: r.is_manager,
            total_policies: 0,
            active_policies: 0,
            terminated_policies: 0,
            at_risk_policies: 0,
            total_annual_premium: 0,
            active_annual_premium: 0,
            gtl_writing_number: r.gtl_writing_number || null,
            ahl_writing_number: r.ahl_writing_number || null,
            heartland_writing_number: r.heartland_writing_number || null,
            manhattan_writing_number: r.manhattan_writing_number || null,
          });
        }

        setRosterAgents(rosterResults);
      }

      // ── Tier 2: Load prod-DB agents (all pages) ───────────────────
      const prodResults: UnifiedAgent[] = [];
      let page = 1;
      const PAGE_SIZE = 500;

      while (true) {
        const res = await fetchAgentDirectory({ page, page_size: PAGE_SIZE });

        for (const a of res.data) {
          // Skip if this agent's writing number is already in a roster
          if (a.writing_number && rosterWns.has(a.writing_number)) {
            // But update the roster agent's production metrics
            const rosterAgent = rosterResults.find(
              (r) => r.writing_number === a.writing_number
            );
            if (rosterAgent) {
              rosterAgent.total_policies = a.total_policies;
              rosterAgent.active_policies = a.active_policies;
              rosterAgent.terminated_policies = a.terminated_policies;
              rosterAgent.at_risk_policies = a.at_risk_policies;
              rosterAgent.total_annual_premium = a.total_annual_premium;
              rosterAgent.active_annual_premium = a.active_annual_premium;
            }
            continue;
          }

          // Resolve agency name — prefer edge fn's agency_name, fall back to local agencies table
          const agencyEntry = Array.from(agencyMap.values()).find(
            (ag) => ag.writing_number === a.agency_wn
          );
          const agencyName = agencyEntry?.name || a.agency_name || null;

          // Edge fn already title-cases names, but parse first/last
          const nameParts = parseProdName(a.agent_name);

          prodResults.push({
            id: `prod-${a.writing_number}`,
            writing_number: a.writing_number,
            first_name: nameParts.first,
            last_name: nameParts.last,
            full_name: nameParts.full,
            email: null,
            phone: null,
            npn: null,
            agency_id: agencyEntry?.id || null,
            agency_name: agencyName,
            agency_wn: a.agency_wn,
            source: 'prod',
            is_manager: false,
            total_policies: a.total_policies,
            active_policies: a.active_policies,
            terminated_policies: a.terminated_policies,
            at_risk_policies: a.at_risk_policies,
            total_annual_premium: a.total_annual_premium,
            active_annual_premium: a.active_annual_premium,
            gtl_writing_number: null,
            ahl_writing_number: null,
            heartland_writing_number: null,
            manhattan_writing_number: null,
          });
        }

        if (page >= res.pagination.total_pages) break;
        page++;
      }

      setProdAgents(prodResults);
      // Update roster agents with production metrics (mutated in place above)
      setRosterAgents([...rosterResults]);

      // ── Build agency options ─────────────────────────────────────
      const agencyCountMap = new Map<string, number>();
      for (const a of [...rosterResults, ...prodResults]) {
        const key = a.agency_id || a.agency_wn || 'unknown';
        agencyCountMap.set(key, (agencyCountMap.get(key) || 0) + 1);
      }

      const agencyOptions: AgencyOption[] = Array.from(agencyMap.values())
        .filter((a) => agencyCountMap.has(a.id) || agencyCountMap.has(a.writing_number || ''))
        .map((a) => ({
          id: a.id,
          name: a.name,
          writing_number: a.writing_number,
          has_roster: rosterAgenciesSet.has(a.id),
          agent_count:
            (agencyCountMap.get(a.id) || 0) +
            (a.writing_number ? agencyCountMap.get(a.writing_number) || 0 : 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAgencies(agencyOptions);
    } catch (err) {
      console.error('Agent directory load error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Merge & filter ─────────────────────────────────────────────────
  const allAgents = useMemo(
    () => [...rosterAgents, ...prodAgents],
    [rosterAgents, prodAgents]
  );

  const filteredAgents = useMemo(() => {
    let result = allAgents;

    if (sourceFilter) {
      result = result.filter((a) => a.source === sourceFilter);
    }

    if (agencyFilter) {
      result = result.filter(
        (a) => a.agency_id === agencyFilter || a.agency_wn === agencyFilter
      );
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          a.full_name.toLowerCase().includes(q) ||
          (a.writing_number || '').toLowerCase().includes(q) ||
          (a.npn || '').toLowerCase().includes(q) ||
          (a.email || '').toLowerCase().includes(q)
      );
    }

    // Sort: active premium desc
    result.sort((a, b) => b.active_annual_premium - a.active_annual_premium);

    return result;
  }, [allAgents, searchTerm, agencyFilter, sourceFilter]);

  return {
    agents: allAgents,
    filteredAgents,
    agencies,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    agencyFilter,
    setAgencyFilter,
    sourceFilter,
    setSourceFilter,
    totalRoster: rosterAgents.length,
    totalProd: prodAgents.length,
    rosterAgencyCount: new Set(rosterAgents.map((a) => a.agency_id)).size,
    refresh,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseProdName(raw: string | null): {
  first: string;
  last: string;
  full: string;
} {
  if (!raw) return { first: '', last: '', full: 'Unknown' };
  const trimmed = raw.trim();

  // Max's DB often stores as "LAST, FIRST" or "LAST FIRST" (all caps)
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',');
    const first = rest.join(',').trim();
    return {
      first: titleCase(first),
      last: titleCase(last),
      full: `${titleCase(first)} ${titleCase(last)}`.trim() || 'Unknown',
    };
  }

  // If it's "FIRST LAST" or just one word
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts.slice(0, -1).join(' ');
    const last = parts[parts.length - 1];
    return {
      first: titleCase(first),
      last: titleCase(last),
      full: `${titleCase(first)} ${titleCase(last)}`,
    };
  }

  return {
    first: titleCase(trimmed),
    last: '',
    full: titleCase(trimmed),
  };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
