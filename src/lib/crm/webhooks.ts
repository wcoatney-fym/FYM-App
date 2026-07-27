/**
 * CRM webhooks — ported from OpenClaw-Dashboard crm-webhooks.ts
 *
 * All CRM edge functions live in the portal Supabase project (akhojh…).
 */
import { PORTAL_URL, PORTAL_ANON_KEY } from './portal-client';

const CROSS_SELL_CONFIRM_WEBHOOK_URL = PORTAL_URL
  ? `${PORTAL_URL}/functions/v1/cross-sell-confirm-webhook`
  : '';

const CRM_ONBOARDING_WEBHOOK_URL = PORTAL_URL
  ? `${PORTAL_URL}/functions/v1/crm-onboarding-webhook`
  : '';

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

export const sanitizeEmbedCodeForJson = (embed?: string): string => {
  if (!embed) return '';
  return embed
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const warmUpCrmOnboardingWebhook = async (): Promise<void> => {
  if (!CRM_ONBOARDING_WEBHOOK_URL || !PORTAL_ANON_KEY) return;
  try {
    await fetch(CRM_ONBOARDING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PORTAL_ANON_KEY}`,
      },
      body: JSON.stringify({ ping: true }),
    });
  } catch {
    /* warm-up failure is non-critical */
  }
};

export const fireCrmOnboardingWebhook = async (
  data: CrmOnboardingWebhookData
): Promise<boolean> => {
  if (!CRM_ONBOARDING_WEBHOOK_URL || !PORTAL_ANON_KEY) return false;
  const payload = {
    ...data,
    calendarEmbedCode: sanitizeEmbedCodeForJson(data.calendarEmbedCode),
  };
  try {
    const response = await fetch(CRM_ONBOARDING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PORTAL_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const result = await response.json();
      return result.success === true;
    }
    return false;
  } catch {
    return false;
  }
};

interface CrossSellProduct {
  product_number: number;
  product_name: string;
  fields: Record<string, string>;
}
interface CrossSellConfirmWebhookData {
  agency: string;
  businessName: string;
  businessLogoUrl: string;
  csrFirstName: string;
  csrLastName: string;
  csrPhone: string;
  csrEmail: string;
  agencyPhone: string;
  agencyUrlPrefix: string;
  products: CrossSellProduct[];
}

export const fireCrossSellConfirmWebhook = async (
  data: CrossSellConfirmWebhookData
): Promise<boolean> => {
  if (!CROSS_SELL_CONFIRM_WEBHOOK_URL || !PORTAL_ANON_KEY) return false;
  try {
    const response = await fetch(CROSS_SELL_CONFIRM_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PORTAL_ANON_KEY}`,
      },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const r = await response.json();
      return r.success;
    }
    return false;
  } catch {
    return false;
  }
};
