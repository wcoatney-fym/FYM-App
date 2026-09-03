-- Migration: hierarchy_agencies barrier view
-- Purpose: Hide portal_password from anon API reads while preserving all other functionality
-- 
-- Background: Column-level REVOKE SELECT does not work when a table-level SELECT GRANT exists
-- (Postgres silently ignores it). The only viable approach is renaming the base table and
-- creating an auto-updatable view in its place that excludes portal_password.
--
-- What this does:
--   1. Renames hierarchy_agencies → _hierarchy_agencies (base table)
--   2. Creates view hierarchy_agencies with all columns EXCEPT portal_password
--   3. View is auto-updatable (simple SELECT from single table)
--   4. All existing .from('hierarchy_agencies') reads and non-password writes work unchanged
--   5. FKs, indexes, RLS policies, triggers all stay on the base table (OID-based, survive rename)
--   6. Revokes anon SELECT on base table so portal_password can't be read directly
--
-- What breaks (fixed in app code):
--   - .insert({..., portal_password: ...}) via PostgREST → rejected (column not in view schema)
--   - .update({portal_password: ...}) via PostgREST → rejected (column not in view schema)
--   - These callsites are migrated to use the set-portal-password edge function (anon)
--     or write to _hierarchy_agencies directly (authenticated)
--
-- Rollback:
--   DROP VIEW IF EXISTS hierarchy_agencies;
--   ALTER TABLE _hierarchy_agencies RENAME TO hierarchy_agencies;
--   GRANT SELECT ON hierarchy_agencies TO anon;

BEGIN;

-- Step 1: Rename base table
-- FKs (18), indexes (3), RLS policies (6), triggers (1) all follow the OID
ALTER TABLE hierarchy_agencies RENAME TO _hierarchy_agencies;

-- Step 2: Create auto-updatable view with same name (excludes portal_password)
CREATE VIEW hierarchy_agencies AS
SELECT
    id, name, assigned_csr, onboarding_status, date_added,
    seat_count, is_active, created_at, updated_at, csr_confirmed,
    roster_confirmed, dba_confirmed, is_test, agency_type, parent_agency_id,
    csr_first_name, csr_last_name, csr_phone, csr_email, csr_npn,
    crm_number, slug, date_created, csr_can_fill_seat, roster_sent_back_reason,
    dba_sent_back_reason, agency_phone, setup_subaccount, setup_snapshot, setup_ghl_api,
    setup_zapier, zaps_paused, price_per_contact, portal_hidden_tabs, dba_client_count,
    csr_gender, calendar_embed_code, agency_url_prefix, is_alumni, business_name,
    business_logo_url, cross_sell_confirmed, avg_annual_premium, cost_per_client_year, crm_enabled,
    agency_npn, agency_ein, principal_agent, principal_agent_npn, contracting_email,
    contracting_contact, carriers, dba_not_applicable, agency_state, unl_writing_number,
    unl_status, aliases, internal_notes, street_address, city,
    zip, additional_contacts, comp_tier, variant, principal_agent_email,
    ghl_api_enabled
FROM _hierarchy_agencies;

-- Step 3: Grant view access to both roles
-- Auto-updatable view passes INSERT/UPDATE/DELETE through to the base table
GRANT SELECT, INSERT, UPDATE, DELETE ON hierarchy_agencies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON hierarchy_agencies TO authenticated;

-- Step 4: Revoke anon SELECT on base table
-- anon can still INSERT/UPDATE/DELETE the base table (through the view's auto-update pass-through)
-- but cannot SELECT from the base table directly (portal_password hidden)
REVOKE SELECT ON _hierarchy_agencies FROM anon;

-- Step 5: Ensure authenticated retains full access to base table
-- (for portal_password reads/writes via portalClient in admin pages)
GRANT ALL ON _hierarchy_agencies TO authenticated;

-- Step 6: Default password trigger for new agency registration
-- External self-registration (ContractingPortalView) can no longer include portal_password
-- in the INSERT payload (column not in view). This trigger auto-sets the predictable
-- default password on INSERT when portal_password is NULL.
-- NOTE: This preserves existing behavior — passwords were already '{name}CRMPortal!'
-- The password randomization project will replace this trigger.
CREATE OR REPLACE FUNCTION set_default_portal_password()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.portal_password IS NULL THEN
        NEW.portal_password := NEW.name || 'CRMPortal!';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_default_portal_password
    BEFORE INSERT ON _hierarchy_agencies
    FOR EACH ROW
    WHEN (NEW.portal_password IS NULL)
    EXECUTE FUNCTION set_default_portal_password();

-- Step 7: Verify the view is auto-updatable
-- (This will raise an error if the view is not auto-updatable, preventing a broken deploy)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'hierarchy_agencies'
        AND is_updatable = 'YES' AND is_insertable_into = 'YES'
    ) THEN
        RAISE EXCEPTION 'hierarchy_agencies view is not auto-updatable — migration aborted';
    END IF;
END $$;

COMMIT;
