-- Migration: agency_writing_numbers junction table
-- Enables multi-carrier writing number support per agency.
-- Each agency can have multiple writing numbers (one per carrier),
-- with one marked as primary for backward compatibility.

CREATE TABLE IF NOT EXISTS agency_writing_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  writing_number TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each agency can have at most one writing number per carrier
  UNIQUE (agency_id, carrier),
  -- Each writing number is globally unique across all agencies/carriers
  UNIQUE (writing_number)
);

-- Index for reverse lookups: writing_number → agency_id
CREATE INDEX idx_awn_writing_number ON agency_writing_numbers (writing_number);
-- Index for agency lookups
CREATE INDEX idx_awn_agency_id ON agency_writing_numbers (agency_id);

-- Enable RLS
ALTER TABLE agency_writing_numbers ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "agency_writing_numbers_read"
  ON agency_writing_numbers
  FOR SELECT
  TO authenticated
  USING (true);

-- Write access for authenticated users (admin check is app-side)
CREATE POLICY "agency_writing_numbers_write"
  ON agency_writing_numbers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow service role full access (edge functions)
CREATE POLICY "agency_writing_numbers_service"
  ON agency_writing_numbers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed from existing agencies.writing_number (UNL primary)
INSERT INTO agency_writing_numbers (agency_id, carrier, writing_number, is_primary)
SELECT id, 'UNL', writing_number, true
FROM agencies
WHERE writing_number IS NOT NULL
  AND writing_number != ''
ON CONFLICT (agency_id, carrier) DO NOTHING;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_awn_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_awn_updated_at
  BEFORE UPDATE ON agency_writing_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_awn_updated_at();
