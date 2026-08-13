-- RPC: get_recruiting_leads
-- Derives the full lead list from recruiting_stage_transitions (source of truth),
-- joining recruiting_leads for contact info (name, email, phone, NPN).
-- Falls back to transition metadata for backfill-only contacts not in recruiting_leads.
--
-- This replaces reading directly from recruiting_leads table, which missed
-- 133 intake-only contacts from Charlie's CSV backfills.

CREATE OR REPLACE FUNCTION get_recruiting_leads(
  start_date timestamptz DEFAULT '2026-02-01'::timestamptz,
  end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  ghl_contact_id text,
  name text,
  email text,
  phone text,
  npn text,
  writing_number text,
  current_stage text,
  lead_at timestamptz,
  attendee_at timestamptz,
  hired_at timestamptz,
  contracting_at timestamptz,
  rts_at timestamptz,
  producing_at timestamptz,
  lost_at timestamptz,
  days_in_stage integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
WITH stage_events AS (
  SELECT
    t.ghl_contact_id,
    t.stage,
    MIN(t.occurred_at) AS first_at
  FROM recruiting_stage_transitions t
  WHERE t.condition != 'auto_lost'
    AND t.occurred_at >= start_date
    AND (end_date IS NULL OR t.occurred_at <= end_date)
  GROUP BY t.ghl_contact_id, t.stage
),
contact_stages AS (
  SELECT
    ghl_contact_id,
    MAX(CASE WHEN stage = 'lead' THEN first_at END) AS lead_at,
    MAX(CASE WHEN stage = 'attendee' THEN first_at END) AS attendee_at,
    MAX(CASE WHEN stage = 'hired' THEN first_at END) AS hired_at,
    MAX(CASE WHEN stage = 'contracting' THEN first_at END) AS contracting_at,
    MAX(CASE WHEN stage = 'rts' THEN first_at END) AS rts_at,
    MAX(CASE WHEN stage = 'producing' THEN first_at END) AS producing_at,
    CASE
      WHEN bool_or(stage = 'producing') THEN 'producing'
      WHEN bool_or(stage = 'rts') THEN 'rts'
      WHEN bool_or(stage = 'contracting') THEN 'contracting'
      WHEN bool_or(stage = 'hired') THEN 'hired'
      WHEN bool_or(stage = 'attendee') THEN 'attendee'
      ELSE 'lead'
    END AS current_stage
  FROM stage_events
  GROUP BY ghl_contact_id
),
contact_info AS (
  SELECT
    cs.ghl_contact_id,
    COALESCE(
      l.name,
      (SELECT t2.metadata->>'name'
       FROM recruiting_stage_transitions t2
       WHERE t2.ghl_contact_id = cs.ghl_contact_id
         AND t2.metadata->>'name' IS NOT NULL
       LIMIT 1)
    ) AS name,
    COALESCE(
      l.email,
      (SELECT t2.metadata->>'email'
       FROM recruiting_stage_transitions t2
       WHERE t2.ghl_contact_id = cs.ghl_contact_id
         AND t2.metadata->>'email' IS NOT NULL
       LIMIT 1)
    ) AS email,
    l.phone,
    l.npn,
    l.writing_number,
    cs.current_stage,
    cs.lead_at,
    cs.attendee_at,
    cs.hired_at,
    cs.contracting_at,
    cs.rts_at,
    cs.producing_at,
    NULL::timestamptz AS lost_at,
    CASE
      WHEN cs.current_stage = 'producing' AND cs.producing_at IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - cs.producing_at)::integer
      WHEN cs.current_stage = 'rts' AND cs.rts_at IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - cs.rts_at)::integer
      WHEN cs.current_stage = 'contracting' AND cs.contracting_at IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - cs.contracting_at)::integer
      WHEN cs.current_stage = 'hired' AND cs.hired_at IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - cs.hired_at)::integer
      WHEN cs.current_stage = 'attendee' AND cs.attendee_at IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - cs.attendee_at)::integer
      WHEN cs.lead_at IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - cs.lead_at)::integer
      ELSE NULL
    END AS days_in_stage
  FROM contact_stages cs
  LEFT JOIN recruiting_leads l ON l.ghl_contact_id = cs.ghl_contact_id
)
SELECT * FROM contact_info
ORDER BY
  CASE current_stage
    WHEN 'producing' THEN 6
    WHEN 'rts' THEN 5
    WHEN 'contracting' THEN 4
    WHEN 'hired' THEN 3
    WHEN 'attendee' THEN 2
    ELSE 1
  END DESC,
  COALESCE(lead_at, attendee_at, hired_at, contracting_at, rts_at, producing_at) DESC NULLS LAST;
$$;

-- Grant access to frontend roles
GRANT EXECUTE ON FUNCTION get_recruiting_leads(timestamptz, timestamptz) TO anon, authenticated;
