import { useEffect, useState } from 'react';
import {
  fetchPolicies,
  fetchAgencyNames,
  computeAgencyHealth,
  type AgencyHealth,
} from './agency-health';
import { supabaseConfigured } from './tracker-supabase';

interface State {
  data: AgencyHealth[];
  loading: boolean;
  error: string | null;
  configured: boolean;
}

export function useAgencyHealth(): State {
  const [state, setState] = useState<State>({
    data: [],
    loading: supabaseConfigured,
    error: null,
    configured: supabaseConfigured,
  });

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const [rows, names] = await Promise.all([fetchPolicies(), fetchAgencyNames()]);
        const data = computeAgencyHealth(rows, names);
        if (!cancelled) setState({ data, loading: false, error: null, configured: true });
      } catch (e) {
        if (!cancelled)
          setState({
            data: [],
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load agency data',
            configured: true,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
