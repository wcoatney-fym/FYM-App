/**
 * Form webhook helpers — calls portal edge functions for intake form submissions
 *
 * These webhooks fire during the intake form flow to trigger downstream
 * GHL/Zapier workflows. They call the portal's Supabase edge functions
 * since the contracting automation lives there.
 *
 * Source: contracting-portal/src/lib/webhooks.ts (fireSubmissionWebhook only)
 */

import { portalUrl, portalKey } from '@/lib/portal-supabase';

const SUBMISSION_WEBHOOK_URL = `${portalUrl}/functions/v1/form-submission-webhook`;

interface SubmissionWebhookData {
  formType: string;
  agentType?: string;
  agency: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  securityCode: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  ssn: string;
  residentLicenseNumber: string;
  npn: string;
  residentState: string;
  gender: string;
  ctmAcknowledgment?: string;
  releaseNeeded: string;
  stateLicenses: string[];
  uploadedFiles: Array<{ name: string; type: string }>;
}

export async function fireSubmissionWebhook(data: SubmissionWebhookData): Promise<void> {
  if (!portalUrl || !portalKey) {
    console.warn('[form-webhooks] Portal env vars not set — skipping submission webhook');
    return;
  }

  try {
    const response = await fetch(SUBMISSION_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${portalKey}`,
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      console.log('Submission webhook fired successfully');
    } else {
      console.error('Submission webhook failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Submission webhook error:', error);
  }
}
