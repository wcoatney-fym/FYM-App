/**
 * useAgentRosterData — pulls carrier writing numbers from agency_rosters
 * in the FYM App DB for agents who don't have portal pipeline records.
 *
 * Most producing agents were contracted before the pipeline existed.
 * Their carrier data lives in agency_rosters (uploaded via roster CSVs),
 * not in agent_pipeline or agent_lob_assignments.
 *
 * This hook resolves the agent's roster record by matching on the
 * effectiveWritingNumber from the View As store or the profile's
 * writing_number field.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

export interface CarrierWritingNumber {
  carrier: string;
  writing_number: string;
  verified: boolean; // roster data = verified (uploaded by agency admin)
}

export interface AgentRosterData {
  carriers: CarrierWritingNumber[];
  agentName: string | null;
  npn: string | null;
  agencyId: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const CARRIER_COLUMNS: { column: string; carrier: string }[] = [
  { column: 'unl_writing_number', carrier: 'UNL' },
  { column: 'gtl_writing_number', carrier: 'GTL' },
  { column: 'ahl_writing_number', carrier: 'AHL' },
  { column: 'heartland_writing_number', carrier: 'Heartland' },
  { column: 'manhattan_writing_number', carrier: 'Manhattan' },
];

export function useAgentRosterData(): AgentRosterData {
  const { effectiveWritingNumber, profile } = useEffectiveAuth();
  const [carriers, setCarriers] = useState<CarrierWritingNumber[]>([]);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [npn, setNpn] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find the agent's roster record by matching writing number
      // The effectiveWritingNumber from View As or profile could match
      // any of the carrier WN columns
      let rosterRecord: Record<string, unknown> | null = null;

      if (effectiveWritingNumber) {
        // Try matching against each carrier WN column
        for (const { column } of CARRIER_COLUMNS) {
          const { data } = await supabase
            .from('agency_rosters')
            .select('*')
            .eq(column, effectiveWritingNumber)
            .eq('status', 'active')
            .maybeSingle();
          if (data) {
            rosterRecord = data;
            break;
          }
        }
      }

      // Also try NPN match if available
      if (!rosterRecord && profile?.npn) {
        const { data } = await supabase
          .from('agency_rosters')
          .select('*')
          .eq('agent_npn', profile.npn)
          .eq('status', 'active')
          .maybeSingle();
        if (data) rosterRecord = data;
      }

      if (!rosterRecord) {
        setCarriers([]);
        setLoading(false);
        return;
      }

      // Extract carrier writing numbers
      const foundCarriers: CarrierWritingNumber[] = [];
      for (const { column, carrier } of CARRIER_COLUMNS) {
        const wn = rosterRecord[column] as string | null;
        if (wn) {
          foundCarriers.push({
            carrier,
            writing_number: wn,
            verified: true, // Roster data is admin-verified
          });
        }
      }

      setCarriers(foundCarriers);
      setAgentName(
        [rosterRecord.first_name, rosterRecord.last_name]
          .filter(Boolean)
          .join(' ') || null
      );
      setNpn((rosterRecord.agent_npn as string) || null);
      setAgencyId((rosterRecord.agency_id as string) || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roster data');
    } finally {
      setLoading(false);
    }
  }, [effectiveWritingNumber, profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    carriers,
    agentName,
    npn,
    agencyId,
    loading,
    error,
    refetch: fetchData,
  };
}
