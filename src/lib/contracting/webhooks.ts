/**
 * Portal Webhook Helpers — ported from contracting-portal/src/lib/webhooks.ts
 *
 * All webhooks call edge functions on the portal Supabase (akhojh…).
 * During the parallel-run period, FYM App fires these same webhooks
 * so behavior is identical to the portal.
 */

const PORTAL_URL = import.meta.env.VITE_PORTAL_SUPABASE_URL;
const PORTAL_KEY = import.meta.env.VITE_PORTAL_SUPABASE_KEY;

const HIP_WRITING_WEBHOOK_URL = `${PORTAL_URL}/functions/v1/hip-writing-webhook`;
const CRM_ONBOARDING_WEBHOOK_URL = `${PORTAL_URL}/functions/v1/crm-onboarding-webhook`;

// ── HIP Writing Webhook ───────────────────────────────────────────────────

interface HipWritingWebhookData {
  firstName: string;
  lastName: string;
  npn: string;
  agency: string;
  unlWritingNumber: string;
  gtlWritingNumber: string;
  ahlWritingNumber: string;
  heartlandWritingNumber: string;
  manhattanWritingNumber: string;
}

export const fireHipWritingWebhook = async (data: HipWritingWebhookData): Promise<void> => {
  try {
    const response = await fetch(HIP_WRITING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PORTAL_KEY}`,
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      console.log('HIP writing webhook fired successfully');
    } else {
      console.error('HIP writing webhook failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('HIP writing webhook error:', error);
  }
};

// ── CRM Onboarding Webhook ──────────────────────────────────────────────

interface CrmOnboardingWebhookData {
  seatNumber: string;
  agentNpn: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImage: string;
  crmNumber: string;
  agency: string;
  digitalBusinessCardUrl?: string;
  confirmationPageUrl?: string;
  calendarEmbedCode?: string;
}

/**
 * Calendar embed codes are raw HTML containing double quotes and line breaks.
 * Normalize to a single line with single-quoted attributes so it stays valid
 * HTML AND JSON-safe.
 */
export const sanitizeEmbedCodeForJson = (embed?: string): string => {
  if (!embed) return '';
  return embed
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const fireCrmOnboardingWebhook = async (data: CrmOnboardingWebhookData): Promise<boolean> => {
  const payload = {
    ...data,
    calendarEmbedCode: sanitizeEmbedCodeForJson(data.calendarEmbedCode),
  };
  try {
    const response = await fetch(CRM_ONBOARDING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PORTAL_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        return true;
      }
      console.error('CRM onboarding webhook: Zapier returned non-OK status', result.status);
      return false;
    } else {
      console.error('CRM onboarding webhook failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('CRM onboarding webhook error:', error);
    return false;
  }
};
