/**
 * CRM Ops module barrel export
 */
export { supabase, ensurePortalAuth, portalConfigured, PORTAL_URL, PORTAL_ANON_KEY } from './portal-client';
export * from './types';
export * from './helpers';
export * from './webhooks';
export * from './cross-sell-helpers';
export * from './roster-repush';
