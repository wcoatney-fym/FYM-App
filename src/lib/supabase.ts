import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Env vars injected at build time by Vite — do not fall back to localStorage
// (localStorage fallback was Bolt-era behavior and causes stale/blank values)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[FYM] Supabase env vars not set — running in mock-data mode.');
}

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;
