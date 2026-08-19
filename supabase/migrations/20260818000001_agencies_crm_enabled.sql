-- Migration: Add crm_enabled flag to agencies table
-- Synced from hierarchy_agencies.crm_enabled in portal DB (akhojh)
-- Used to determine whether agency sees CRM Management tabs in CRM Command

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS crm_enabled boolean DEFAULT false;

COMMENT ON COLUMN public.agencies.crm_enabled IS 'Whether this agency is CRM-onboarded (synced from hierarchy_agencies)';
