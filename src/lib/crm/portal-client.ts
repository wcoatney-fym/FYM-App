/**
 * CRM Portal Client — reads/writes CRM data in portal DB (akhojh…)
 *
 * Re-exports the portal Supabase client with auth support for RLS-protected
 * tables. All CRM data (agencies, tickets, roster, pipeline, etc.) lives in
 * the contracting-portal DB.
 *
 * Env vars (set in Netlify):
 *   VITE_PORTAL_SUPABASE_URL          — portal project URL
 *   VITE_PORTAL_SUPABASE_KEY          — portal anon/publishable key
 *   VITE_PORTAL_SERVICE_EMAIL         — optional service account for RLS writes
 *   VITE_PORTAL_SERVICE_PASSWORD      — optional service account password
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const portalUrl = import.meta.env.VITE_PORTAL_SUPABASE_URL || '';
const portalKey = import.meta.env.VITE_PORTAL_SUPABASE_KEY || '';
const serviceEmail = import.meta.env.VITE_PORTAL_SERVICE_EMAIL as string | undefined;
const servicePassword = import.meta.env.VITE_PORTAL_SERVICE_PASSWORD as string | undefined;

export const portalConfigured = Boolean(portalUrl && portalKey);

const portalSupabase: SupabaseClient | null =
  portalConfigured
    ? createClient(portalUrl, portalKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

let signInPromise: Promise<void> | null = null;

/**
 * Ensure we have an authenticated session for RLS access, if service creds
 * are configured. Idempotent — safe to call before every query.
 */
export async function ensurePortalAuth(): Promise<void> {
  if (!portalSupabase || !serviceEmail || !servicePassword) return;
  const { data } = await portalSupabase.auth.getSession();
  if (data.session) return;
  if (!signInPromise) {
    signInPromise = portalSupabase.auth
      .signInWithPassword({ email: serviceEmail, password: servicePassword })
      .then(() => undefined)
      .finally(() => {
        signInPromise = null;
      });
  }
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
