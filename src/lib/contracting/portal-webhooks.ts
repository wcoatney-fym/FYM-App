/**
 * Portal webhook helpers — calls portal edge functions
 *
 * During the parallel-run period, FYM App calls the portal's edge functions
 * for operations that trigger downstream workflows (GHL/Zapier).
 * When contracting is fully absorbed, these calls route to FYM App's own
 * edge functions instead.
 *
 * Source: contracting-portal/src/lib/webhooks.ts
 */

const PORTAL_URL = import.meta.env.VITE_PORTAL_SUPABASE_URL || '';
const PORTAL_KEY = import.meta.env.VITE_PORTAL_SUPABASE_KEY || '';

const POPULATE_WEBHOOK_URL = `${PORTAL_URL}/functions/v1/populate-form-webhook`;

interface PopulateWebhookData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  formType: string;
  agency: string;
  generatedUrl: string;
  securityCode: string;
  expirationDate: string;
}

/**
 * Fires the populate-form-webhook edge function on the portal Supabase.
 * This triggers GHL/Zapier to send the intake form link to the agent.
 */
export async function firePopulateWebhook(
  data: PopulateWebhookData
): Promise<void> {
  if (!PORTAL_URL || !PORTAL_KEY) {
    throw new Error('Portal Supabase env vars not configured');
  }

  const response = await fetch(POPULATE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PORTAL_KEY}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(
      `Populate webhook failed: ${response.status} ${response.statusText}`
    );
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`Zapier forwarding failed (status ${result.status})`);
  }
}
