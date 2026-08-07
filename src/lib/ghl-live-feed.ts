/**
 * GHL Live Feed — tracker sync client.
 *
 * After toggling ghl_api_enabled on hierarchy_agencies (portal DB),
 * call syncGhlToTracker() to push the same flag to the Activity Tracker's
 * agencies table via the ghl-live-feed edge function.
 *
 * Fire-and-forget — tracker sync failure doesn't block the UI toggle.
 */

import { supabase } from '@/lib/supabase';

const FUNCTION_NAME = 'ghl-live-feed';

/** Sync ghl_api_enabled to the tracker DB by agency name */
export async function syncGhlToTracker(
  agencyName: string,
  enabled: boolean
): Promise<void> {
  if (!supabase) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;

    await supabase.functions.invoke(FUNCTION_NAME, {
      body: { action: 'sync', agencyName, enabled },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    // Fire-and-forget — log but don't throw
    console.warn('[ghl-live-feed] Tracker sync failed:', err);
  }
}
