/**
 * notes-api.ts — CRUD for manager notes
 *
 * Notes are stored in the FYM App Supabase (rcbzag).
 * Managers/admins create notes on policies or agents.
 * Agents can acknowledge notes targeted at them.
 */
import { supabase } from '@/lib/supabase';

export interface ManagerNote {
  id: string;
  author_id: string;
  author_name: string | null;
  policy_number: string | null;
  agent_writing_number: string | null;
  agent_name: string | null;
  body: string;
  notify_agent: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteParams {
  policy_number?: string;
  agent_writing_number?: string;
  agent_name?: string;
  body: string;
  notify_agent?: boolean;
  author_name?: string;
}

/** Fetch notes for a specific policy */
export async function fetchNotesForPolicy(policyNumber: string): Promise<ManagerNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('manager_notes')
    .select('*')
    .eq('policy_number', policyNumber)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Notes] fetchNotesForPolicy error:', error);
    return [];
  }
  return data ?? [];
}

/** Fetch notes for a specific agent (by writing number) */
export async function fetchNotesForAgent(agentWritingNumber: string): Promise<ManagerNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('manager_notes')
    .select('*')
    .eq('agent_writing_number', agentWritingNumber)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Notes] fetchNotesForAgent error:', error);
    return [];
  }
  return data ?? [];
}

/** Fetch recent notes across all agents/policies (for dashboard widgets) */
export async function fetchRecentNotes(limit = 20): Promise<ManagerNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('manager_notes')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Notes] fetchRecentNotes error:', error);
    return [];
  }
  return data ?? [];
}

/** Create a new manager note */
export async function createNote(params: CreateNoteParams): Promise<ManagerNote | null> {
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[Notes] createNote: no authenticated user');
    return null;
  }

  const { data, error } = await supabase
    .from('manager_notes')
    .insert({
      author_id: user.id,
      author_name: params.author_name ?? null,
      policy_number: params.policy_number ?? null,
      agent_writing_number: params.agent_writing_number ?? null,
      agent_name: params.agent_name ?? null,
      body: params.body,
      notify_agent: params.notify_agent ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error('[Notes] createNote error:', error);
    return null;
  }
  return data;
}

/** Acknowledge a note (agent action) */
export async function acknowledgeNote(noteId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('manager_notes')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
    })
    .eq('id', noteId);

  if (error) {
    console.error('[Notes] acknowledgeNote error:', error);
    return false;
  }
  return true;
}

/** Soft-delete a note (author only) */
export async function deleteNote(noteId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('manager_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) {
    console.error('[Notes] deleteNote error:', error);
    return false;
  }
  return true;
}

/** Format a relative time string */
export function formatNoteTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
}
