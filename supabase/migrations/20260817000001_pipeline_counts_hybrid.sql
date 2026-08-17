-- Fix 2: Hybrid get_pipeline_counts — uses recruiting_leads for base lead
-- count (always current) and recruiting_stage_transitions for progression
-- stages. Prevents dashboard freeze if transitions ever lag behind leads.
--
-- Also fixes lead upsert dedup bug (edge function side, not SQL).
CREATE OR REPLACE FUNCTION public.get_pipeline_counts(
  start_date timestamptz DEFAULT '2026-02-01T00:00:00Z'::timestamptz,
  end_date   timestamptz DEFAULT NULL
)
RETURNS TABLE(stage text, contact_count bigint)
LANGUAGE sql STABLE
AS $function$
SELECT stage, contact_count
FROM (
  WITH
    -- All contacts from transitions (progression tracking)
    stage_contacts AS (
      SELECT DISTINCT ghl_contact_id, stage
      FROM recruiting_stage_transitions
      WHERE condition != 'auto_lost'
        AND occurred_at >= start_date
        AND (end_date IS NULL OR occurred_at <= end_date)
    ),
    -- Highest stage per contact from transitions
    highest_stage AS (
      SELECT
        ghl_contact_id,
        CASE
          WHEN bool_or(stage = 'producing')   THEN 6
          WHEN bool_or(stage = 'rts')         THEN 5
          WHEN bool_or(stage = 'contracting') THEN 4
          WHEN bool_or(stage = 'hired')       THEN 3
          WHEN bool_or(stage = 'attendee')    THEN 2
          WHEN bool_or(stage = 'lead')        THEN 1
          ELSE 0
        END AS max_stage
      FROM stage_contacts
      GROUP BY ghl_contact_id
    ),
    -- Transition-based cumulative counts (attendee through producing)
    transition_counts AS (
      SELECT s.stage, s.ord, COUNT(*) AS contact_count
      FROM (VALUES
        ('attendee', 2), ('hired', 3), ('contracting', 4),
        ('rts', 5), ('producing', 6)
      ) AS s(stage, ord)
      CROSS JOIN highest_stage h
      WHERE h.max_stage >= s.ord
      GROUP BY s.stage, s.ord
    ),
    -- Lead count: use the GREATER of leads-table count vs transition count.
    -- recruiting_leads is always current (upserted every sync); transitions
    -- may lag if inserts fail. This ensures leads are never undercounted.
    lead_count AS (
      SELECT 'lead'::text AS stage, 1 AS ord,
        GREATEST(
          (SELECT COUNT(*) FROM recruiting_leads
           WHERE stage != 'lost'
             AND (end_date IS NULL OR updated_at <= end_date)),
          (SELECT COUNT(*) FROM highest_stage)
        ) AS contact_count
    )
  SELECT stage, ord, contact_count FROM lead_count
  UNION ALL
  SELECT stage, ord, contact_count FROM transition_counts
) sub
ORDER BY ord;
$function$;
