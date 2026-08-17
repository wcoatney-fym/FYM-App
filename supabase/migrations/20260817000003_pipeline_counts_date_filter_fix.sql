-- Fix: get_pipeline_counts hybrid lead count ignores start_date filter.
--
-- Bug: The GREATEST fallback to recruiting_leads only filtered by end_date,
-- not start_date. When "This Month" passes start_date = Aug 1, the transition
-- side correctly returns ~151 leads, but the recruiting_leads side returns ALL
-- 1,408 non-lost leads. GREATEST picks 1,408 → wrong.
--
-- Also switches from updated_at to lead_at for date filtering on
-- recruiting_leads, since lead_at holds the backfilled contact created date
-- while updated_at changes every sync cycle.

CREATE OR REPLACE FUNCTION get_pipeline_counts(
  start_date timestamptz DEFAULT '2026-02-01T00:00:00Z',
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
    -- Lead count: GREATEST of leads-table count vs transition count.
    -- Both sides now respect start_date AND end_date.
    -- Uses lead_at (backfilled contact created date) not updated_at.
    lead_count AS (
      SELECT 'lead'::text AS stage, 1 AS ord,
        GREATEST(
          (SELECT COUNT(*) FROM recruiting_leads
           WHERE stage != 'lost'
             AND lead_at >= start_date
             AND (end_date IS NULL OR lead_at <= end_date)),
          (SELECT COUNT(*) FROM highest_stage)
        ) AS contact_count
    )
  SELECT stage, ord, contact_count FROM lead_count
  UNION ALL
  SELECT stage, ord, contact_count FROM transition_counts
) sub
ORDER BY ord;
$function$;
