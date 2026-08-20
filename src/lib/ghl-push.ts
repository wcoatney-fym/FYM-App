/**
 * GHL Push — Client-side helper to push at-risk stage changes to GHL.
 *
 * Called after a successful stage change in the Workboard (both Action Cards
 * and Pipeline views). Fires the atrisk-ghl-push edge function.
 *
 * The edge function handles all the logic:
 * - Checks if the agency has GHL enabled
 * - Looks up API credentials
 * - Pushes the stage change + adds suppression tag
 * - Returns silently if GHL is not enabled (no error, no UI impact)
 *
 * This is fire-and-forget from the UI perspective — the stage change in the
 * app is already committed. GHL push failure doesn't affect the app state.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface GhlPushParams {
  policy_number: string;
  agency_id: string;
  new_stage: string;
  client_name?: string | null;
  plan_premium?: number | null;
  ghl_contact_id?: string | null;
  ghl_opportunity_id?: string | null;
  task_id?: string | null;
  source?: string; // 'app' | 'ghl' | 'manual' — skip push if 'ghl'
}

export interface GhlPushResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  ghl_opportunity_id?: string;
  ghl_contact_id?: string;
  stage_pushed?: string;
  created?: boolean;
}

/**
 * Push a stage change to GHL (fire-and-forget).
 *
 * Returns the result if you need it, but callers should NOT block on this.
 * If the push fails or GHL is not enabled, it returns gracefully.
 */
export async function pushStageToGhl(
  params: GhlPushParams
): Promise<GhlPushResult | null> {
  // Loop guard: if this change came from GHL, don't push back
  if (params.source === 'ghl') {
    return { success: true, skipped: true, reason: 'Source is GHL — loop guard' };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('ghl-push: Missing SUPABASE_URL or SUPABASE_KEY');
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/atrisk-ghl-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'push',
        policy_number: params.policy_number,
        agency_id: params.agency_id,
        new_stage: params.new_stage,
        client_name: params.client_name || null,
        plan_premium: params.plan_premium || null,
        ghl_contact_id: params.ghl_contact_id || null,
        ghl_opportunity_id: params.ghl_opportunity_id || null,
        task_id: params.task_id || null,
      }),
    });

    if (!res.ok) {
      console.warn(`ghl-push: edge function returned ${res.status}`);
      return null;
    }

    const result: GhlPushResult = await res.json();

    // If the push created a new GHL opportunity, the edge function stored
    // the IDs on the task — the next page load will pick them up.
    return result;
  } catch (err) {
    // Fire-and-forget — don't let GHL failures break the UI
    console.warn('ghl-push: failed silently', err);
    return null;
  }
}

/** Result from resolve_direction action */
export interface SyncDirectionResult {
  success: boolean;
  agency_id: string;
  direction: 'app_to_ghl' | 'ghl_to_app' | 'conflict' | 'empty';
  reason: string;
  app: {
    task_count: number;
    worked_stage_changes: number;
    moved_tasks: number;
    has_work: boolean;
  };
  ghl: {
    total_opportunities: number;
    worked_opportunities: number;
    stage_breakdown: Record<string, number>;
    has_work: boolean;
    error: string | null;
  };
}

/**
 * Resolve sync direction for an agency (read-only detection).
 *
 * Checks both App and GHL for worked pipeline state and returns
 * a recommendation without executing any sync.
 */
export async function resolveSyncDirection(
  agencyId: string
): Promise<SyncDirectionResult | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/atrisk-ghl-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'resolve_direction',
        agency_id: agencyId,
      }),
    });

    if (!res.ok) {
      console.warn(`ghl-push: resolve_direction returned ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn('ghl-push: resolve_direction failed', err);
    return null;
  }
}

/**
 * Seed all current pipeline state to GHL for an agency (one-time on opt-in).
 */
export async function seedAgencyToGhl(agencyId: string): Promise<{
  success: boolean;
  seeded?: number;
  skipped?: number;
  total?: number;
  error?: string;
} | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/atrisk-ghl-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'seed',
        agency_id: agencyId,
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('ghl-push: seed failed', err);
    return null;
  }
}
