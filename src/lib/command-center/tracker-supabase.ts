import { createClient } from '@supabase/supabase-js';

/**
 * Read-only Supabase client for the FYM Sales Tracker (Activity Tracker DB).
 * Uses the publishable/anon key (RLS-enforced SELECT only). Never ship a
 * service key to the browser. Values come from Vite env at build time:
 *   VITE_SUPABASE_URL_ACTIVITY_TRACKER
 *   VITE_SUPABASE_ANON_KEY_ACTIVITY_TRACKER
 */
const url = import.meta.env.VITE_SUPABASE_URL_ACTIVITY_TRACKER as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY_ACTIVITY_TRACKER as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
