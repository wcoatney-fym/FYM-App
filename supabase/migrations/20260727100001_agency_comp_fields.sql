-- Add comp, variant, and principal agent email to hierarchy_agencies
ALTER TABLE hierarchy_agencies ADD COLUMN IF NOT EXISTS comp_tier text;
ALTER TABLE hierarchy_agencies ADD COLUMN IF NOT EXISTS variant text DEFAULT 'fym_direct';
ALTER TABLE hierarchy_agencies ADD COLUMN IF NOT EXISTS principal_agent_email text;
