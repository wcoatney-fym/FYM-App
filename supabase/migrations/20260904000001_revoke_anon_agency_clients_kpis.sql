-- ============================================================================
-- REVOKE anon access on agency_clients + agency_kpis
-- Fix fn_intake_to_agency_client trigger: INVOKER → DEFINER
-- ============================================================================
-- CONTEXT:
--   agency_clients (8,148 rows): PII — names, phones, emails, addresses.
--     Zero frontend readers remain after PRs #477, #478 deleted the
--     agency-facing portal tabs and admin Contacts subtab.
--     Writers: sync-ghl-data (service_role), fn_intake_to_agency_client trigger.
--   agency_kpis (300 rows): KPI aggregates per agency.
--     Frontend readers: KpiDashboardTab, AgencyProfileView — both admin-only,
--     both authenticated via ensurePortalAuth (PR #476).
--     Writers: sync-ghl-data (service_role).
--
-- TRIGGER FIX (must land BEFORE the REVOKE):
--   fn_intake_to_agency_client fires on INSERT to crm_business_intake.
--   Intake forms submit as anon. The trigger was SECURITY INVOKER — it
--   inherited the caller's role. REVOKE ALL FROM anon would silently kill
--   the trigger's INSERT into agency_clients. SECURITY DEFINER makes it
--   run as the function owner (postgres), regardless of caller role.
--
-- REVERSIBLE: rollback SQL at bottom of file.
-- ============================================================================

-- ─── 1. Fix trigger: SECURITY INVOKER → SECURITY DEFINER ───────────────────
-- Without this, REVOKE anon on agency_clients breaks intake form submissions.
ALTER FUNCTION public.fn_intake_to_agency_client() SECURITY DEFINER;

-- ─── 2. REVOKE anon on agency_clients ──────────────────────────────────────
-- Last frontend reader (AgencyContactsTab) deleted in PR #478.
-- Only service_role writes (sync-ghl-data) and DEFINER trigger (intake) remain.
REVOKE ALL ON public.agency_clients FROM anon;

-- ─── 3. REVOKE anon on agency_kpis ────────────────────────────────────────
-- Admin readers (KpiDashboardTab, AgencyProfileView) use authenticated role
-- via ensurePortalAuth (PR #476). Only service_role writes (sync-ghl-data).
REVOKE ALL ON public.agency_kpis FROM anon;

-- ============================================================================
-- ROLLBACK (if needed):
-- ALTER FUNCTION public.fn_intake_to_agency_client() SECURITY INVOKER;
-- GRANT SELECT ON public.agency_clients TO anon;
-- GRANT SELECT ON public.agency_kpis TO anon;
-- ============================================================================
