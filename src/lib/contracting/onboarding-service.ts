/**
 * Onboarding service — creates the activation landing page record and
 * sends the onboarding welcome email when a new agency is added to the
 * hierarchy.
 */
import { activationSupabase } from '@/lib/activation-client';

/**
 * Generates a URL-safe slug from an agency name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Creates a partner_agencies record in the Activation DB.
 * This makes the agency's activation landing page live at teamfym.com/activation/<slug>.
 */
export async function createActivationRecord(params: {
  slug: string;
  agencyName: string;
  principalName: string;
  principalEmail: string;
  compTier: string;
  variant: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!activationSupabase) {
    return { success: false, error: 'Activation DB not configured' };
  }

  try {
    const { error } = await (activationSupabase as any)
      .from('partner_agencies')
      .insert({
        slug: params.slug,
        agency_name: params.agencyName,
        principal_name: params.principalName,
        principal_email: params.principalEmail,
        comp_tier: params.compTier,
        variant: params.variant,
        active: true,
        roadmap_progress: {},
      });

    if (error) {
      // Duplicate slug — agency may already exist in activation
      if (error.code === '23505') {
        return { success: false, error: 'This agency already has an activation landing page.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Sends the onboarding welcome email via the portal edge function.
 * The email goes to the principal agent with their activation page link + portal login creds.
 */
export async function sendOnboardingEmail(params: {
  agencyName: string;
  principalName: string;
  principalEmail: string;
  activationUrl: string;
  portalSlug: string;
  portalPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const portalUrl = import.meta.env.VITE_PORTAL_SUPABASE_URL as string | undefined;
  const portalKey = import.meta.env.VITE_PORTAL_SUPABASE_KEY as string | undefined;

  if (!portalUrl || !portalKey) {
    return { success: false, error: 'Portal not configured for email sending' };
  }

  try {
    const res = await fetch(`${portalUrl}/functions/v1/agency-onboarding-welcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${portalKey}`,
      },
      body: JSON.stringify({
        agency_name: params.agencyName,
        principal_name: params.principalName,
        principal_email: params.principalEmail,
        activation_url: params.activationUrl,
        portal_slug: params.portalSlug,
        portal_password: params.portalPassword,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      return { success: false, error: result.error || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to send email' };
  }
}
