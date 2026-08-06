/**
 * Portal Supabase client — reads CRM Portal DB (akhojh…)
 *
 * Stage 4 absorption: FYM App reads portal data through this client
 * during the parallel-run period. When contracting tabs reach full parity
 * and data is migrated to rcbzag, this client retires.
 *
 * Env vars:
 *   VITE_PORTAL_SUPABASE_URL  — CRM Portal Supabase URL
 *   VITE_PORTAL_SUPABASE_KEY  — CRM Portal anon/publishable key
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const portalUrl = import.meta.env.VITE_PORTAL_SUPABASE_URL || '';
export const portalKey = import.meta.env.VITE_PORTAL_SUPABASE_KEY || '';

if (!portalUrl || !portalKey) {
  console.warn(
    '[FYM] Portal Supabase env vars not set — contracting tabs will show empty state.'
  );
}

export const portalSupabase: SupabaseClient | null =
  portalUrl && portalKey
    ? createClient(portalUrl, portalKey)
    : null;
