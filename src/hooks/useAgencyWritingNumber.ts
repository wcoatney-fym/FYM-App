import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AgencyLookup {
  id: string;
  tracker_id: string | null;
  writing_number: string | null;
  name: string;
}

/**
 * Loads the agency lookup table once and provides helpers to resolve
 * between different agency identifier formats:
 * - UUID (agencies.id) — used by profiles.agency_id and internal FKs
 * - tracker_id (UUID from old Sales Tracker) — legacy identifier
 * - writing_number (e.g. '202NEW00') — used by prod DB edge functions
 *
 * Edge functions key agencies by writing_number. The filter dropdown
 * now emits writing_number values. This hook bridges the gap for
 * agency admins whose effectiveAgencyId is a UUID from profiles.
 */
export function useAgencyWritingNumber() {
  const [agencies, setAgencies] = useState<AgencyLookup[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoaded(true); return; }
    supabase
      .from('agencies')
      .select('id, tracker_id, writing_number, name')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setAgencies(data as AgencyLookup[]);
        setLoaded(true);
      });
  }, []);

  /**
   * Resolve any agency identifier (UUID, tracker_id, or writing_number)
   * to the writing_number that edge functions expect.
   * Returns null if no match or the agency has no writing_number.
   */
  function toWritingNumber(idOrNull: string | null): string | null {
    if (!idOrNull) return null;
    // If it already looks like a writing number (starts with digits), pass through
    if (/^\d{3}[A-Z]/.test(idOrNull)) return idOrNull;
    // Try matching by UUID (agencies.id)
    const byId = agencies.find(a => a.id === idOrNull);
    if (byId?.writing_number) return byId.writing_number;
    // Try matching by tracker_id
    const byTracker = agencies.find(a => a.tracker_id === idOrNull);
    if (byTracker?.writing_number) return byTracker.writing_number;
    return null;
  }

  /**
   * Resolve a writing_number back to the agency name.
   */
  function toName(writingNumber: string | null): string | null {
    if (!writingNumber) return null;
    const match = agencies.find(a => a.writing_number === writingNumber);
    return match?.name ?? null;
  }

  return { agencies, loaded, toWritingNumber, toName };
}
