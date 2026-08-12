-- Add ghl_contact_id to recruiting_leads for GHL sync deduplication
ALTER TABLE recruiting_leads ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_recruiting_leads_ghl_contact
  ON recruiting_leads(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;
