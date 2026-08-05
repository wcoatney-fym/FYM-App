-- Carrier Entity Aliases — persistent match mappings for carrier hierarchy report uploads.
-- When a fuzzy or failed match is manually resolved, the resolution is stored here
-- so future uploads auto-resolve without re-prompting.

CREATE TABLE IF NOT EXISTS carrier_entity_aliases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier       text NOT NULL,                          -- e.g. 'Manhattan', 'GTL'
  carrier_name  text NOT NULL,                          -- name as it appears in the carrier report
  carrier_number text,                                  -- carrier-specific writing/agent number
  entity_type   text NOT NULL CHECK (entity_type IN ('agent', 'agency')),
  matched_entity_id uuid NOT NULL,                      -- FK to agents.id or hierarchy_agencies.id
  match_type    text NOT NULL CHECK (match_type IN ('exact', 'fuzzy', 'manual')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  created_by    text,                                   -- who resolved the match

  -- Prevent duplicate aliases for the same carrier+name+entity_type combo
  UNIQUE (carrier, carrier_name, entity_type)
);

-- Index for fast lookups during upload processing
CREATE INDEX IF NOT EXISTS idx_carrier_entity_aliases_lookup
  ON carrier_entity_aliases (carrier, entity_type, carrier_name);

-- Carrier upload history — tracks each upload for audit trail
CREATE TABLE IF NOT EXISTS carrier_hierarchy_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier       text NOT NULL,
  file_name     text NOT NULL,
  uploaded_by   text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  summary       jsonb,                                  -- { exact: N, fuzzy: N, failed: N, total: N }
  created_at    timestamptz DEFAULT now(),
  completed_at  timestamptz
);

-- RLS
ALTER TABLE carrier_entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_hierarchy_uploads ENABLE ROW LEVEL SECURITY;

-- Allow authenticated reads/writes (FYM admin context)
CREATE POLICY "carrier_entity_aliases_all" ON carrier_entity_aliases
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "carrier_hierarchy_uploads_all" ON carrier_hierarchy_uploads
  FOR ALL USING (true) WITH CHECK (true);
