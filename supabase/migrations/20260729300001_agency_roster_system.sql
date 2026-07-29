/*
  Agency Roster Management — FYM App (rcbzag)

  Lets admins upload CSV rosters for their agencies. Each upload stores
  the raw agent entries (11 template columns + metadata). A summary view
  joins roster agents to policy_cache for book health metrics.

  Template columns (Charlie spec 2026-07-29):
    Mandatory: First Name, Last Name, Email, Phone, Agent NPN, Gender
    Carrier WNs (at least 1 required): UNL, GTL, AHL, Heartland, Manhattan
*/

-- Upload history
CREATE TABLE IF NOT EXISTS agency_roster_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'deleted'))
);

-- Agent roster entries
CREATE TABLE IF NOT EXISTS agency_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES agency_roster_uploads(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  agent_npn text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('Male', 'Female')),
  unl_writing_number text,
  gtl_writing_number text,
  ahl_writing_number text,
  heartland_writing_number text,
  manhattan_writing_number text,
  is_manager boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agency_rosters_agency_id ON agency_rosters(agency_id);
CREATE INDEX idx_agency_rosters_upload_id ON agency_rosters(upload_id);
CREATE INDEX idx_agency_rosters_agent_npn ON agency_rosters(agent_npn);
CREATE INDEX idx_agency_roster_uploads_agency_id ON agency_roster_uploads(agency_id);

-- Summary view: join roster agents to policy_cache across all writing numbers
CREATE OR REPLACE VIEW roster_agent_summary AS
SELECT
  r.id,
  r.upload_id,
  r.agency_id,
  r.first_name,
  r.last_name,
  r.email,
  r.phone,
  r.agent_npn,
  r.gender,
  r.unl_writing_number,
  r.gtl_writing_number,
  r.ahl_writing_number,
  r.heartland_writing_number,
  r.manhattan_writing_number,
  r.is_manager,
  r.status,
  r.created_at,
  r.updated_at,
  COALESCE(ps.total_policies, 0) AS total_policies,
  COALESCE(ps.active_policies, 0) AS active_policies,
  COALESCE(ps.at_risk_policies, 0) AS at_risk_policies,
  COALESCE(ps.total_annual_premium, 0) AS total_annual_premium,
  COALESCE(ps.active_annual_premium, 0) AS active_annual_premium
FROM agency_rosters r
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_policies,
    COUNT(*) FILTER (WHERE pc.status = 'active') AS active_policies,
    COUNT(*) FILTER (WHERE pc.at_risk = true) AS at_risk_policies,
    COALESCE(SUM(pc.annual_premium), 0) AS total_annual_premium,
    COALESCE(SUM(pc.annual_premium) FILTER (WHERE pc.status = 'active'), 0) AS active_annual_premium
  FROM policy_cache pc
  WHERE pc.product_type IN ('HI', 'HHC')
    AND pc.writing_number IN (
      r.unl_writing_number,
      r.gtl_writing_number,
      r.ahl_writing_number,
      r.heartland_writing_number,
      r.manhattan_writing_number
    )
    AND pc.writing_number IS NOT NULL
    AND pc.writing_number != ''
) ps ON true;

-- RLS
ALTER TABLE agency_roster_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_rosters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read roster uploads"
  ON agency_roster_uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert roster uploads"
  ON agency_roster_uploads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update roster uploads"
  ON agency_roster_uploads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read rosters"
  ON agency_rosters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert rosters"
  ON agency_rosters FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update rosters"
  ON agency_rosters FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete rosters"
  ON agency_rosters FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete roster uploads"
  ON agency_roster_uploads FOR DELETE
  TO authenticated
  USING (true);
