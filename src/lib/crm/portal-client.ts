/**
 * CRM Portal Client — reads/writes CRM data in portal DB (akhojh…)
 *
 * Re-exports the portal Supabase client with auth support for RLS-protected
 * tables. All CRM data (agencies, tickets, roster, pipeline, etc.) lives in
 * the contracting-portal DB.
 *
 * SECURITY: Service credentials are NEVER in the browser bundle. Auth is
 * obtained via the portal-auth edge function, which validates the caller's
 * FYM App JWT and returns Portal session tokens server-side.
 *
 * Env vars (set in Netlify):
 *   VITE_PORTAL_SUPABASE_URL          — portal project URL
 *   VITE_PORTAL_SUPABASE_KEY          — portal anon/publishable key
 *   VITE_SUPABASE_URL                 — FYM App project URL (for portal-auth endpoint)
 *   VITE_SUPABASE_ANON_KEY            — FYM App anon key (for portal-auth endpoint)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const portalUrl = import.meta.env.VITE_PORTAL_SUPABASE_URL || '';
const portalKey = import.meta.env.VITE_PORTAL_SUPABASE_KEY || '';
const appUrl = import.meta.env.VITE_SUPABASE_URL || '';
const appAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const portalConfigured = Boolean(portalUrl && portalKey);

const portalSupabase: SupabaseClient | null =
  portalConfigured
    ? createClient(portalUrl, portalKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

let signInPromise: Promise<void> | null = null;

/**
 * Ensure we have an authenticated session for RLS access.
 * Fetches Portal tokens from the portal-auth edge function (server-side),
 * which validates the caller's FYM App JWT and signs in with service
 * credentials that never leave the server.
 *
 * Falls back to legacy VITE_PORTAL_SERVICE_* vars if present (for dev/local).
 * Idempotent — safe to call before every query.
 */
export async function ensurePortalAuth(): Promise<void> {
  if (!portalSupabase) return;

  // Already have a session? Done.
  const { data } = await portalSupabase.auth.getSession();
  if (data.session) return;

  // Deduplicate concurrent calls
  if (signInPromise) {
    await signInPromise;
    return;
  }

  signInPromise = (async () => {
    // Legacy fallback: if VITE_PORTAL_SERVICE_* vars exist (local dev only),
    // use them directly. These should NOT be set in production Netlify.
    const legacyEmail = import.meta.env.VITE_PORTAL_SERVICE_EMAIL as string | undefined;
    const legacyPassword = import.meta.env.VITE_PORTAL_SERVICE_PASSWORD as string | undefined;
    if (legacyEmail && legacyPassword) {
      await portalSupabase!.auth.signInWithPassword({
        email: legacyEmail,
        password: legacyPassword,
      });
      return;
    }

    // Production path: get Portal tokens from the portal-auth edge function
    if (!appUrl || !appAnonKey) {
      console.warn('[portal-client] Cannot authenticate: no FYM App URL/key for portal-auth');
      return;
    }

    // Get the current FYM App user's JWT to send to portal-auth
    const appSupabase = createClient(appUrl, appAnonKey);
    const { data: appSession } = await appSupabase.auth.getSession();
    const appToken = appSession?.session?.access_token;

    if (!appToken) {
      console.warn('[portal-client] Cannot authenticate: no FYM App session');
      return;
    }

    // Call portal-auth edge function
    const res = await fetch(`${appUrl}/functions/v1/portal-auth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'apikey': appAnonKey,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[portal-client] portal-auth failed: ${res.status} ${errBody}`);
      return;
    }

    const tokens = await res.json();
    if (!tokens.access_token) {
      console.error('[portal-client] portal-auth returned no access_token');
      return;
    }

    // Set the Portal session using the server-provided tokens
    await portalSupabase!.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
  })().finally(() => {
    signInPromise = null;
  });

  await signInPromise;
}

/**
 * Proxy supabase client — re-exports as `supabase` so CRM tab files can
 * import without null-checks. Falls back to no-op builder when portal
 * isn't configured.
 */
export const supabase = {
  from: (table: string) => {
    if (!portalSupabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noop: any = new Proxy(
        {},
        {
          get:
            () =>
            (..._args: unknown[]) =>
              noop,
        }
      );
      noop.then = () =>
        Promise.resolve({
          data: null,
          error: new Error('portal-not-configured'),
          count: null,
        });
      return noop;
    }
    return portalSupabase.from(table);
  },
  auth: portalSupabase?.auth ?? {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async (_creds: unknown) => ({
      data: null,
      error: null,
    }),
  },
  storage: portalSupabase?.storage ?? {
    from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      upload: async () => ({ data: null, error: new Error('not-configured') }),
      list: async () => ({ data: null, error: new Error('not-configured') }),
    }),
  },
};

// Webhook base URLs — CRM edge functions live in the portal Supabase project
export const PORTAL_URL = portalUrl || undefined;
export const PORTAL_ANON_KEY = portalKey || undefined;
