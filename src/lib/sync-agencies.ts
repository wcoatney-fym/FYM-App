/**
 * sync-agencies — Client-side helper to trigger hierarchy → agencies sync.
 *
 * Calls the sync-agencies edge function which reads hierarchy_agencies from
 * the portal DB (akhojh) and upserts into agencies in the FYM App DB (rcbzag).
 *
 * Called after agency creation/update in the Hierarchy tab to ensure the
 * agencies table stays in sync without manual seed migrations.
 */

import { supabase } from './supabase';

export interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  provisioned: number;
  errors?: string[];
  provision_errors?: string[];
  elapsed_ms: number;
}

/**
 * Trigger a sync from hierarchy_agencies (portal) → agencies (FYM App).
 * Best-effort — failures are logged but don't block the UI.
 */
export async function triggerAgencySync(): Promise<SyncResult | null> {
  if (!supabase) {
    console.warn('[sync-agencies] Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await supabase.functions.invoke('sync-agencies', {
      method: 'POST',
    });

    if (error) {
      console.error('[sync-agencies] Edge function error:', error.message);
      return null;
    }

    const result = data as SyncResult;
    if (result.success) {
      const changes = result.created + result.updated + result.deactivated;
      if (changes > 0) {
        console.log(
          `[sync-agencies] Synced: ${result.created} created, ${result.updated} updated, ${result.deactivated} deactivated (${result.elapsed_ms}ms)`
        );
      }
    } else {
      console.warn('[sync-agencies] Sync returned non-success:', result);
    }

    return result;
  } catch (err) {
    console.error('[sync-agencies] Unexpected error:', (err as Error).message);
    return null;
  }
}
