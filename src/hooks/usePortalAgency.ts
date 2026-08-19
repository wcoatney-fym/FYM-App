/**
 * usePortalAgency — Resolves FYM App agency name → portal hierarchy_agencies record.
 *
 * All CRM Management tabs need to scope queries to portal agency IDs. This hook:
 *   1. Finds the parent agency in hierarchy_agencies by fuzzy name match
 *   2. Loads all child agencies under that parent
 *   3. Returns the full agency object, child agencies, and combined ID/name arrays
 *
 * The portal `hierarchy_agencies` table is the source of truth for CRM-enabled agencies.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

export interface PortalAgency {
  id: string;
  name: string;
  slug: string | null;
  agency_type: string | null;
  parent_agency_id: string | null;
  is_active: boolean;
  crm_enabled: boolean;
  portal_password: string | null;
  portal_hidden_tabs: string[] | null;
  assigned_csr: string | null;
  csr_first_name: string | null;
  csr_last_name: string | null;
  csr_phone: string | null;
  csr_email: string | null;
  csr_npn: string | null;
  csr_gender: string | null;
  csr_can_fill_seat: boolean | null;
  zaps_paused: boolean | null;
  is_alumni: boolean | null;
  calendar_embed_code: string | null;
  agency_url_prefix: string | null;
  [key: string]: unknown;
}

export interface UsePortalAgencyResult {
  loading: boolean;
  /** The resolved parent agency from the portal DB */
  agency: PortalAgency | null;
  /** All child agencies under the parent */
  childAgencies: PortalAgency[];
  /** All agencies (parent + children) */
  allAgencies: PortalAgency[];
  /** All agency IDs (parent + children) */
  agencyIds: string[];
  /** All agency names (parent + children) */
  agencyNames: string[];
  /** Reload agency data */
  refresh: () => Promise<void>;
}

export function usePortalAgency(agencyName: string): UsePortalAgencyResult {
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<PortalAgency | null>(null);
  const [childAgencies, setChildAgencies] = useState<PortalAgency[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: agencies } = await portalSupabase
      .from('hierarchy_agencies')
      .select('*')
      .eq('is_active', true)
      .eq('crm_enabled', true);

    if (!agencies || agencies.length === 0) {
      setLoading(false);
      return;
    }

    const normalizedName = agencyName.toLowerCase().trim();

    // Try exact match first, then partial
    let parent = (agencies as PortalAgency[]).find(
      (a) => a.name.toLowerCase().trim() === normalizedName
    );

    if (!parent) {
      parent = (agencies as PortalAgency[]).find(
        (a) =>
          normalizedName.includes(a.name.toLowerCase().trim()) ||
          a.name.toLowerCase().trim().includes(normalizedName)
      );
    }

    if (!parent) {
      setLoading(false);
      return;
    }

    setAgency(parent);

    const children = (agencies as PortalAgency[]).filter(
      (a) => a.parent_agency_id === parent!.id
    );
    setChildAgencies(children);
    setLoading(false);
  }, [agencyName]);

  useEffect(() => {
    load();
  }, [load]);

  const allAgencies = agency ? [agency, ...childAgencies] : [];
  const agencyIds = allAgencies.map((a) => a.id);
  const agencyNames = allAgencies.map((a) => a.name);

  return {
    loading,
    agency,
    childAgencies,
    allAgencies,
    agencyIds,
    agencyNames,
    refresh: load,
  };
}
