import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  localStorage.getItem('fym_supabase_url') ||
  import.meta.env.VITE_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  localStorage.getItem('fym_supabase_anon_key') ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getSupabaseClient() {
  const url = localStorage.getItem('fym_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
  const key = localStorage.getItem('fym_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (url && key) return createClient(url, key);
  return null;
}
