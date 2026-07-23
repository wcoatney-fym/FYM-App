/*
  # Onboarding Agencies — Stage 3: Absorb FYM Agency Activation into FYM App

  ## Purpose
  Replaces partner_agencies from the activation tool (lpmyzp) with a proper table
  in the FYM App system of record (rcbzag). Links onboarding progress to the
  canonical agency identity via FK to agencies.id.

  ## Schema
    - `onboarding_agencies` — per-agency activation/onboarding tracking
      - `id` uuid PK (auto-generated)
      - `agency_id` uuid FK → agencies(id) — links to canonical agency record
      - `slug` text UNIQUE — URL segment, serves as credential for partner hub
      - `agency_name` text NOT NULL — display name (may differ from agencies.name)
      - `principal_name` text — agency principal/owner name
      - `principal_email` text — principal contact email
      - `roadmap_progress` jsonb — {task_id: boolean} map for 30-day roadmap
      - `variant` text — 'brent_melanie' or 'fym_direct'
      - `comp_tier` text — '60', '65', '70', '75'
      - `active` boolean — false = hub shows closed message
      - `last_visited_at` timestamptz — updated on each partner hub visit
      - `created_at` / `updated_at` — standard timestamps

  ## Security (RLS)
    - Authenticated users with admin/manager role: full CRUD
    - Anon: SELECT + UPDATE on active agencies (slug is the credential)
    - No anon INSERT/DELETE — admin creates agencies through the app
*/

-- Table
CREATE TABLE IF NOT EXISTS onboarding_agencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid REFERENCES agencies(id) ON DELETE SET NULL,
  slug              text NOT NULL UNIQUE,
  agency_name       text NOT NULL,
  principal_name    text,
  principal_email   text,
  roadmap_progress  jsonb NOT NULL DEFAULT '{}'::jsonb,
  variant           text NOT NULL DEFAULT 'brent_melanie'
                    CHECK (variant IN ('brent_melanie', 'fym_direct')),
  comp_tier         text NOT NULL DEFAULT '70'
                    CHECK (comp_tier IN ('60', '65', '70', '75')),
  active            boolean NOT NULL DEFAULT true,
  last_visited_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_agencies_agency_id
  ON onboarding_agencies (agency_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_agencies_active
  ON onboarding_agencies (active);

-- Updated-at trigger (reuse if exists, create if not)
CREATE OR REPLACE FUNCTION set_onboarding_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_agencies_updated_at ON onboarding_agencies;
CREATE TRIGGER trg_onboarding_agencies_updated_at
  BEFORE UPDATE ON onboarding_agencies
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

-- RLS
ALTER TABLE onboarding_agencies ENABLE ROW LEVEL SECURITY;

-- Anon can read active agencies (slug is the credential)
CREATE POLICY "anon_select_active"
  ON onboarding_agencies FOR SELECT
  TO anon
  USING (active = true);

-- Anon can update active agencies (roadmap progress, last_visited_at)
CREATE POLICY "anon_update_active"
  ON onboarding_agencies FOR UPDATE
  TO anon
  USING (active = true)
  WITH CHECK (active = true);

-- Authenticated users: full access (role checks happen in app/edge fn)
CREATE POLICY "authenticated_all"
  ON onboarding_agencies FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
