/**
 * Activation Supabase client — writes to the Agency Activation DB (lpmyzp…)
 *
 * Used to create partner_agencies records that make an agency's activation
 * landing page live at teamfym.com/activation/<slug>.
 *
 * Env vars:
 *   VITE_ACTIVATION_SUPABASE_URL       — Agency Activation Supabase URL
 *   VITE_ACTIVATION_SUPABASE_ANON_KEY  — Agency Activation anon/publishable key
 */
import { createClient } from '@supabase/supabase-js';

const ACTIVATION_URL = import.meta.env.VITE_ACTIVATION_SUPABASE_URL as string | undefined;
const ACTIVATION_KEY = import.meta.env.VITE_ACTIVATION_SUPABASE_ANON_KEY as string | undefined;

export const activationSupabase = ACTIVATION_URL && ACTIVATION_KEY
  ? createClient(ACTIVATION_URL, ACTIVATION_KEY)
  : null;

export const activationConfigured = Boolean(activationSupabase);
