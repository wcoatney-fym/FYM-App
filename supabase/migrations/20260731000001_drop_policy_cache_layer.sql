-- Migration: Drop policy_cache table and all dependent views/functions
-- Part of PR 3/3: cleanup after frontend rewire to direct prod DB edge functions
--
-- All frontend pages now read from prod-data, book-of-business, retention-data,
-- and agency-roster-data edge functions (PRs #80, #81). These views and RPCs
-- are no longer consumed by any frontend component.
--
-- Order: functions first, then views (respecting dependencies), then table.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Drop RPC functions (no dependents)
-- ══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS filtered_agency_production(date, date);
DROP FUNCTION IF EXISTS filtered_agent_production(date, date);
DROP FUNCTION IF EXISTS filtered_monthly_production(date, date);
DROP FUNCTION IF EXISTS filtered_daily_production(date, date);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Drop views (leaf views first, then views they may depend on)
-- ══════════════════════════════════════════════════════════════════════════

-- Leaf views (no other view depends on these)
DROP VIEW IF EXISTS public.roster_agent_summary;
DROP VIEW IF EXISTS public.agent_summary;
DROP VIEW IF EXISTS public.coaching_pipeline;
DROP VIEW IF EXISTS public.agency_concentration;
DROP VIEW IF EXISTS public.agency_cohort_retention;
DROP VIEW IF EXISTS public.agency_retention_overview;

-- Mid-tier views
DROP VIEW IF EXISTS public.agent_production;
DROP VIEW IF EXISTS public.monthly_production;
DROP VIEW IF EXISTS public.agency_production;
DROP VIEW IF EXISTS public.agency_retention_summary;
DROP VIEW IF EXISTS public.manager_at_risk_board;
DROP VIEW IF EXISTS public.cohort_retention;

-- Base view
DROP VIEW IF EXISTS public.book_of_business;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Drop the policy_cache table
-- ══════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS public.policy_cache;
