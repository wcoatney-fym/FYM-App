/**
 * GHL Live Feed API client.
 *
 * Calls the ghl-live-feed edge function on FYM App Supabase (rcbzag)
 * to read and toggle ghl_api_enabled on the Activity Tracker's agencies table.
 *
 * Phase 1: edge function proxies to tracker DB via Management API.
 * Phase 2: data moves to rcbzag and this becomes a direct table query.
 */

import { supabase } from '@/lib/supabase';

const FUNCTION_NAME = 'ghl-live-feed';

export interface GhlAgencyStatus {
  id: string;
  name: string;
  slug: string;
  ghl_api_enabled: boolean;
}

async function callGhlLiveFeed<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) {
    throw new Error('Supabase client not configured');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  if (!token) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    throw new Error(error.message || 'GHL Live Feed request failed');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

/** Fetch all active agencies with their GHL live feed status */
export async function fetchGhlAgencyStatuses(): Promise<GhlAgencyStatus[]> {
  const result = await callGhlLiveFeed<{ agencies: GhlAgencyStatus[] }>({
    action: 'list',
  });
  return result.agencies || [];
}

/** Toggle GHL live feed for an agency */
export async function toggleGhlLiveFeed(
  agencyId: string,
  enabled: boolean
): Promise<{ success: boolean; ghl_api_enabled: boolean }> {
  return callGhlLiveFeed({
    action: 'toggle',
    agencyId,
    enabled,
  });
}
