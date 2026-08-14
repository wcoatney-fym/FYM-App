-- Add feature toggle columns to agency_ghl_configs
-- GHL Manager Pipeline: when enabled, requires API key + location ID (popup)
-- GHL Production Push: placeholder toggle, no functionality yet
ALTER TABLE agency_ghl_configs
  ADD COLUMN IF NOT EXISTS manager_pipeline_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_push_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN agency_ghl_configs.manager_pipeline_enabled IS 'GHL Manager Pipeline toggle — requires API key + location ID when enabled';
COMMENT ON COLUMN agency_ghl_configs.production_push_enabled IS 'GHL Production Push toggle — placeholder, no functionality yet';
