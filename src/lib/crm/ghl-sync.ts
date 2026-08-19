/**
 * CRM GHL Sync — Client-side helper to call the crm-ghl-sync edge function.
 *
 * Replaces the old crm-onboarding-webhook (Zapier) path with direct GHL API
 * calls via the FYM App edge function on rcbzag.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const CRM_GHL_SYNC_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/crm-ghl-sync`
  : '';

export interface CrmGhlSyncAgent {
  seatNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  agentNpn: string;
  profileImage: string;
  crmNumber: string;
  agency: string;
  digitalBusinessCardUrl?: string;
  confirmationPageUrl?: string;
  calendarEmbedCode?: string;
}

export interface CrmGhlSyncResult {
  success: boolean;
  result?: {
    agent: string;
    seatNumber: string;
    customValuesPushed: boolean;
    userCreated: boolean;
    sunfirePushed: boolean;
    errors: string[];
  };
  error?: string;
}

export interface CrmGhlBatchResult {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: CrmGhlSyncResult['result'][];
  error?: string;
}

/** Warm up the edge function (cold start prevention) */
export async function warmUpCrmGhlSync(): Promise<void> {
  if (!CRM_GHL_SYNC_URL || !SUPABASE_KEY) return;
  try {
    await fetch(CRM_GHL_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ ping: true }),
    });
  } catch {
    /* warm-up failure is non-critical */
  }
}

/**
 * Push custom values + create GHL user for a single agent.
 *
 * @param agent - Agent data to push
 * @param action - 'onboard' (default, CV + user), 'push_custom_values' (CV only), 'create_user' (user only)
 */
export async function fireCrmGhlSync(
  agent: CrmGhlSyncAgent,
  action: 'onboard' | 'push_custom_values' | 'create_user' = 'onboard',
): Promise<CrmGhlSyncResult> {
  if (!CRM_GHL_SYNC_URL || !SUPABASE_KEY) {
    return { success: false, error: 'CRM GHL sync not configured' };
  }

  try {
    const response = await fetch(CRM_GHL_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ action, ...agent }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        error: `GHL sync failed: ${response.status} — ${errText.slice(0, 200)}`,
      };
    }

    return await response.json();
  } catch (err) {
    return {
      success: false,
      error: `GHL sync error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Batch push custom values + create GHL users for multiple agents.
 *
 * @param agents - Array of agent data to push
 * @param createUsers - Whether to create GHL users (default true)
 */
export async function fireCrmGhlSyncBatch(
  agents: CrmGhlSyncAgent[],
  createUsers = true,
): Promise<CrmGhlBatchResult> {
  if (!CRM_GHL_SYNC_URL || !SUPABASE_KEY) {
    return {
      success: false,
      total: agents.length,
      succeeded: 0,
      failed: agents.length,
      results: [],
      error: 'CRM GHL sync not configured',
    };
  }

  try {
    const response = await fetch(CRM_GHL_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ action: 'batch', agents, createUsers }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        total: agents.length,
        succeeded: 0,
        failed: agents.length,
        results: [],
        error: `GHL batch sync failed: ${response.status} — ${errText.slice(0, 200)}`,
      };
    }

    return await response.json();
  } catch (err) {
    return {
      success: false,
      total: agents.length,
      succeeded: 0,
      failed: agents.length,
      results: [],
      error: `GHL batch sync error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
