-- Phase: FYM App becomes the system of record for agency + agent identity
-- Creates the agencies table in rcbzag — seeded from tracker via sync function

CREATE TABLE IF NOT EXISTS agencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id  text UNIQUE,          -- agency_id UUID from policy_cache / tracker agencies table
  name        text NOT NULL,
  slug        text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: admins + managers can read all; agents can read their own agency
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agencies: authenticated read"
  ON agencies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "agencies: admin write"
  ON agencies FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Index for fast tracker_id lookups (used by sync function)
CREATE INDEX IF NOT EXISTS agencies_tracker_id_idx ON agencies (tracker_id);

-- Also add agency FK to profiles for clean join
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS app_agency_id uuid REFERENCES agencies(id);
