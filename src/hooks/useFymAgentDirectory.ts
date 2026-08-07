/**
 * useFymAgentDirectory — FYM-only agent directory hook
 *
 * Used by the Contracting > Database tab. Shows ONLY FYM's own agents,
 * NOT sub-agency agents (Guardian, Wisechoice, etc. belong on the
 * Agents page via useAgentDirectory).
 *
 * Three sources, merged into a single deduplicated list:
 *
 * 1. Intake form completions — portal agents table (akhojh)
 *    Agents who completed the contracting intake form.
 *
 * 2. FYM agency roster — agency_rosters in rcbzag where agency_id = FYM
 *    Agents uploaded as part of FYM's own roster.
 *
 * 3. Production DB — Max's DB via agent-directory edge function
 *    FYM's direct agents only (ga is blank/null or starts with 202JVV).
 *
 * Deduplication priority: roster > intake > prod (roster has the most
 * confirmed identity data). Production metrics are always merged in
 * when a writing number or email match exists.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { portalSupabase } from '@/lib/portal-supabase';
import { fetchAgentDirectory } from '@/lib/prod-api';

// ── Constants ────────────────────────────────────────────────────────

/** FYM's agency row ID in the agencies table (rcbzag) */
const FYM_AGENCY_ID = '338230f2-2058-407c-9507-5aa88d6d5e14';

/** FYM writing number prefix — ga values starting with this are FYM direct */
const FYM_WN_PREFIX = '202JVV';

// ── Types ────────────────────────────────────────────────────────────

export interface FymAgent {
  /** Unique key — writing number, roster row ID, or intake ID */
  id: string;
  writing_number: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  npn: string | null;
  /** 'roster' = FYM roster, 'intake' = intake form, 'prod' = production DB */
  source: 'roster' | 'intake' | 'prod';
  is_manager: boolean;
  // Production metrics (from prod DB when matched)
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  at_risk_policies: number;
  total_annual_premium: number;
  active_annual_premium: number;
  // Intake-specific fields
  form_type: string | null;
  intake_status: string | null;
  crm_onboarded: boolean;
  // Carrier writing numbers (roster only)
  gtl_writing_number: string | null;
  ahl_writing_number: string | null;
  heartland_writing_number: string | null;
  manhattan_writing_number: string | null;
  // Timestamp for "recently added" badge
  added_at: string | null;
}

interface UseFymAgentDirectoryReturn {
  agents: FymAgent[];
  filteredAgents: FymAgent[];
  loading: boolean;
  error: string | null;
  // Filters
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  sourceFilter: '' | 'roster' | 'intake' | 'prod';
  setSourceFilter: (v: '' | 'roster' | 'intake' | 'prod') => void;
  // Stats (pre-dedup counts from each source)
  totalRoster: number;
  totalIntake: number;
  totalProd: number;
  // Refresh
  refresh: () => void;
}

// ── Roster row type ──────────────────────────────────────────────────

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
  created_at: string | null;
}

// ── Portal agent type ────────────────────────────────────────────────

interface PortalAgent {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  form_type: string;
  status: string;
  agency: string;
  npn: string | null;
  crm_onboarded: boolean;
  created_at: string | null;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useFymAgentDirectory(): UseFymAgentDirectoryReturn {
  const [agents, setAgents] = useState<FymAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'roster' | 'intake' | 'prod'>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [totalRoster, setTotalRoster] = useState(0);
  const [totalIntake, setTotalIntake] = useState(0);
  const [totalProd, setTotalProd] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      // Dedup indexes — keyed by lowercase email and writing number
      const byEmail = new Map<string, FymAgent>();
      const byWn = new Map<string, FymAgent>();
      const allAgents: FymAgent[] = [];

      /**
       * Add an agent with dedup logic.
       * Priority: roster (2) > intake (1) > prod (0).
       * Higher priority sources win the slot; prod metrics are merged
       * onto higher-priority agents when matched.
       */
      const addAgent = (agent: FymAgent) => {
        const email = agent.email?.toLowerCase().trim() || '';
        const wn = agent.writing_number?.trim() || '';

        // Check for existing by WN (most reliable match)
        if (wn) {
          const existing = byWn.get(wn);
          if (existing) {
            // Merge prod metrics onto higher-priority source
            if (agent.total_policies > 0 && existing.total_policies === 0) {
              existing.total_policies = agent.total_policies;
              existing.active_policies = agent.active_policies;
              existing.terminated_policies = agent.terminated_policies;
              existing.at_risk_policies = agent.at_risk_policies;
              existing.total_annual_premium = agent.total_annual_premium;
              existing.active_annual_premium = agent.active_annual_premium;
            }
            return;
          }
        }

        // Check for existing by email
        if (email) {
          const existing = byEmail.get(email);
          if (existing) {
            // Merge prod metrics
            if (agent.total_policies > 0 && existing.total_policies === 0) {
              existing.total_policies = agent.total_policies;
              existing.active_policies = agent.active_policies;
              existing.terminated_policies = agent.terminated_policies;
              existing.at_risk_policies = agent.at_risk_policies;
              existing.total_annual_premium = agent.total_annual_premium;
              existing.active_annual_premium = agent.active_annual_premium;
            }
            // Fill in missing WN
            if (!existing.writing_number && wn) {
              existing.writing_number = wn;
              byWn.set(wn, existing);
            }
            return;
          }
        }

        // New agent
        allAgents.push(agent);
        if (email) byEmail.set(email, agent);
        if (wn) byWn.set(wn, agent);
      };

      // ── Source 1: FYM Agency Roster (highest priority) ───────────
      let rosterCount = 0;
      if (supabase) {
        const PAGE = 1000;
        let offset = 0;
        let allRoster: RosterRow[] = [];

        while (true) {
          const { data } = await supabase
            .from('agency_rosters')
            .select('id, agency_id, first_name, last_name, email, phone, agent_npn, unl_writing_number, gtl_writing_number, ahl_writing_number, heartland_writing_number, manhattan_writing_number, is_manager, status, created_at')
            .eq('agency_id', FYM_AGENCY_ID)
            .eq('status', 'active')
            .range(offset, offset + PAGE - 1);

          const rows = (data || []) as RosterRow[];
          allRoster = allRoster.concat(rows);
          if (rows.length < PAGE) break;
          offset += PAGE;
        }

        rosterCount = allRoster.length;

        for (const r of allRoster) {
          addAgent({
            id: r.id,
            writing_number: r.unl_writing_number?.trim() || null,
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            full_name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
            email: r.email || null,
            phone: r.phone || null,
            npn: r.agent_npn || null,
            source: 'roster',
            is_manager: r.is_manager,
            total_policies: 0,
            active_policies: 0,
            terminated_policies: 0,
            at_risk_policies: 0,
            total_annual_premium: 0,
            active_annual_premium: 0,
            form_type: null,
            intake_status: null,
            crm_onboarded: false,
            gtl_writing_number: r.gtl_writing_number || null,
            ahl_writing_number: r.ahl_writing_number || null,
            heartland_writing_number: r.heartland_writing_number || null,
            manhattan_writing_number: r.manhattan_writing_number || null,
            added_at: r.created_at || null,
          });
        }
      }

      // ── Source 2: Intake Form Completions ─────────────────────────
      let intakeCount = 0;
      if (portalSupabase) {
        const PAGE = 1000;
        let offset = 0;
        let allIntake: PortalAgent[] = [];

        while (true) {
          const { data } = await portalSupabase
            .from('agents')
            .select('id, first_name, last_name, email, phone, form_type, status, agency, npn, crm_onboarded, created_at')
            .neq('status', 'pending')
            .range(offset, offset + PAGE - 1);

          const rows = (data || []) as PortalAgent[];
          allIntake = allIntake.concat(rows);
          if (rows.length < PAGE) break;
          offset += PAGE;
        }

        intakeCount = allIntake.length;

        for (const a of allIntake) {
          addAgent({
            id: `intake-${a.id}`,
            writing_number: null,
            first_name: (a.first_name || '').trim(),
            last_name: (a.last_name || '').trim(),
            full_name: [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
            email: a.email || null,
            phone: a.phone || null,
            npn: a.npn || null,
            source: 'intake',
            is_manager: false,
            total_policies: 0,
            active_policies: 0,
            terminated_policies: 0,
            at_risk_policies: 0,
            total_annual_premium: 0,
            active_annual_premium: 0,
            form_type: a.form_type || null,
            intake_status: a.status || null,
            crm_onboarded: a.crm_onboarded ?? false,
            gtl_writing_number: null,
            ahl_writing_number: null,
            heartland_writing_number: null,
            manhattan_writing_number: null,
            added_at: a.created_at || null,
          });
        }
      }

      // ── Source 3: Production DB (FYM direct agents only) ─────────
      let prodCount = 0;
      let page = 1;
      const PAGE_SIZE = 500;

      while (true) {
        const res = await fetchAgentDirectory({ page, page_size: PAGE_SIZE });

        for (const a of res.data) {
          // FYM direct agents only: ga is blank/null OR starts with FYM prefix
          const ga = a.agency_wn || '';
          if (ga && !ga.startsWith(FYM_WN_PREFIX)) continue;

          prodCount++;
          const nameParts = parseProdName(a.agent_name);

          addAgent({
            id: `prod-${a.writing_number}`,
            writing_number: a.writing_number,
            first_name: nameParts.first,
            last_name: nameParts.last,
            full_name: nameParts.full,
            email: null,
            phone: null,
            npn: null,
            source: 'prod',
            is_manager: false,
            total_policies: a.total_policies,
            active_policies: a.active_policies,
            terminated_policies: a.terminated_policies,
            at_risk_policies: a.at_risk_policies ?? 0,
            total_annual_premium: a.total_annual_premium,
            active_annual_premium: a.active_annual_premium,
            form_type: null,
            intake_status: null,
            crm_onboarded: false,
            gtl_writing_number: null,
            ahl_writing_number: null,
            heartland_writing_number: null,
            manhattan_writing_number: null,
            added_at: null,
          });
        }

        if (page >= res.pagination.total_pages) break;
        page++;
      }

      setAgents(allAgents);
      setTotalRoster(rosterCount);
      setTotalIntake(intakeCount);
      setTotalProd(prodCount);
    } catch (err) {
      console.error('FYM agent directory load error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    let result = agents;

    if (sourceFilter) {
      result = result.filter((a) => a.source === sourceFilter);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          a.full_name.toLowerCase().includes(q) ||
          (a.writing_number || '').toLowerCase().includes(q) ||
          (a.npn || '').toLowerCase().includes(q) ||
          (a.email || '').toLowerCase().includes(q) ||
          (a.phone || '').includes(q)
      );
    }

    // Sort: active premium desc, then name asc
    result.sort((a, b) => {
      if (b.active_annual_premium !== a.active_annual_premium) {
        return b.active_annual_premium - a.active_annual_premium;
      }
      return a.full_name.localeCompare(b.full_name);
    });

    return result;
  }, [agents, searchTerm, sourceFilter]);

  return {
    agents,
    filteredAgents,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    sourceFilter,
    setSourceFilter,
    totalRoster,
    totalIntake,
    totalProd,
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

  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',');
    const first = rest.join(',').trim();
    return {
      first: titleCase(first),
      last: titleCase(last),
      full: `${titleCase(first)} ${titleCase(last)}`.trim() || 'Unknown',
    };
  }

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
