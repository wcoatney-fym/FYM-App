/**
 * Help Bot Escalation API
 *
 * Creates escalation records when the help chatbot can't match
 * a user's question. Reads from `help_bot_escalations` table
 * in the FYM App DB (rcbzag).
 *
 * Note: `help_bot_escalations` is not yet in the generated database.types.ts.
 * We create a separate untyped supabase client for this table to avoid
 * type errors until types are regenerated after the migration is applied.
 */

import { createClient } from '@supabase/supabase-js';

// Use the same env vars as the typed client, but without Database generic
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const configured = Boolean(supabaseUrl && supabaseAnonKey);

// Untyped client — safe for tables not yet in database.types.ts
const untypedClient = configured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface EscalationInsert {
  question: string;
  pageContext?: string;
}

export interface Escalation {
  id: string;
  user_id: string;
  user_name: string | null;
  question: string;
  page_context: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

/**
 * Create a new escalation from an unanswered help bot question.
 * Automatically captures the current user's ID and name.
 */
export async function createEscalation(
  params: EscalationInsert
): Promise<{ success: boolean; error?: string }> {
  if (!untypedClient) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data: { user } } = await untypedClient.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Try to get user's display name from profiles
    const { data: profile } = await untypedClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const { error } = await untypedClient
      .from('help_bot_escalations')
      .insert({
        user_id: user.id,
        user_name: profile?.full_name ?? user.email ?? null,
        question: params.question,
        page_context: params.pageContext ?? null,
      });

    if (error) {
      console.error('[HelpBot] Escalation insert failed:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[HelpBot] Escalation error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Fetch open escalations (admin use — for future admin panel).
 */
export async function fetchOpenEscalations(): Promise<Escalation[]> {
  if (!untypedClient) return [];

  const { data, error } = await untypedClient
    .from('help_bot_escalations')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[HelpBot] Fetch escalations failed:', error.message);
    return [];
  }

  return (data ?? []) as Escalation[];
}

/**
 * Resolve or dismiss an escalation (admin use).
 */
export async function resolveEscalation(
  id: string,
  status: 'resolved' | 'dismissed',
  note?: string
): Promise<{ success: boolean; error?: string }> {
  if (!untypedClient) {
    return { success: false, error: 'Supabase not configured' };
  }

  const { data: { user } } = await untypedClient.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await untypedClient
    .from('help_bot_escalations')
    .update({
      status,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note ?? null,
    })
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
