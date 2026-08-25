-- Migration: Consolidate coaching plans to one card per agent with multi-flag support.
--
-- Before: one coaching_plan per agent per flag_type → duplicate cards.
-- After:  one coaching_plan per agent with a `flags` JSONB array tracking
--         each flag independently (type, deadline, trigger/target metrics).
--
-- The card's display deadline = the earliest flag deadline.
-- Flags auto-resolve independently; the plan resolves when ALL flags clear.

-- 1. Add the flags JSONB column (array of flag objects)
ALTER TABLE coaching_plans
  ADD COLUMN IF NOT EXISTS flags JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Migrate existing single flag_type → flags array for all plans
UPDATE coaching_plans
SET flags = jsonb_build_array(
  jsonb_build_object(
    'type', flag_type::text,
    'flagged_at', flagged_at,
    'deadline', deadline,
    'trigger_metric', COALESCE(trigger_metric, '{}'::jsonb),
    'target_metric', COALESCE(target_metric, '{}'::jsonb),
    'resolved', false
  )
)
WHERE flags = '[]'::jsonb;

-- 3. Consolidate duplicates: for each agent with multiple plans,
--    merge all flags into the earliest-created plan and delete the rest.
--    Only consolidate plans that are NOT in terminal states.
WITH ranked AS (
  SELECT
    id,
    roster_agent_id,
    flags,
    stage,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY roster_agent_id
      ORDER BY created_at ASC
    ) AS rn
  FROM coaching_plans
  WHERE stage NOT IN ('resolved', 'escalated')
),
-- The "keeper" is rn=1 (earliest created) per agent
keepers AS (
  SELECT id AS keeper_id, roster_agent_id
  FROM ranked WHERE rn = 1
),
-- The "dupes" are rn>1 — their flags get merged into the keeper
dupes AS (
  SELECT r.id AS dupe_id, r.roster_agent_id, r.flags AS dupe_flags, k.keeper_id
  FROM ranked r
  JOIN keepers k ON r.roster_agent_id = k.roster_agent_id
  WHERE r.rn > 1
),
-- Build merged flags: keeper's flags || all dupe flags
merged AS (
  SELECT
    k.keeper_id,
    k.roster_agent_id,
    (
      SELECT jsonb_agg(elem)
      FROM (
        -- Keeper's existing flags
        SELECT jsonb_array_elements(kr.flags) AS elem
        FROM coaching_plans kr WHERE kr.id = k.keeper_id
        UNION ALL
        -- All dupe flags
        SELECT jsonb_array_elements(d.dupe_flags) AS elem
        FROM dupes d WHERE d.keeper_id = k.keeper_id
      ) combined
    ) AS merged_flags
  FROM keepers k
  WHERE EXISTS (SELECT 1 FROM dupes d WHERE d.keeper_id = k.keeper_id)
)
-- Apply the merge
UPDATE coaching_plans cp
SET
  flags = m.merged_flags,
  updated_at = now()
FROM merged m
WHERE cp.id = m.keeper_id;

-- Move coaching notes + requirements from dupes to keepers
WITH ranked AS (
  SELECT id, roster_agent_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY roster_agent_id ORDER BY created_at ASC) AS rn
  FROM coaching_plans
  WHERE stage NOT IN ('resolved', 'escalated')
),
keepers AS (
  SELECT id AS keeper_id, roster_agent_id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r JOIN keepers k ON r.roster_agent_id = k.roster_agent_id
  WHERE r.rn > 1
)
UPDATE coaching_notes cn
SET plan_id = d.keeper_id
FROM dupes d
WHERE cn.plan_id = d.dupe_id;

WITH ranked AS (
  SELECT id, roster_agent_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY roster_agent_id ORDER BY created_at ASC) AS rn
  FROM coaching_plans
  WHERE stage NOT IN ('resolved', 'escalated')
),
keepers AS (
  SELECT id AS keeper_id, roster_agent_id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r JOIN keepers k ON r.roster_agent_id = k.roster_agent_id
  WHERE r.rn > 1
)
UPDATE coaching_requirements cr
SET plan_id = d.keeper_id
FROM dupes d
WHERE cr.plan_id = d.dupe_id;

WITH ranked AS (
  SELECT id, roster_agent_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY roster_agent_id ORDER BY created_at ASC) AS rn
  FROM coaching_plans
  WHERE stage NOT IN ('resolved', 'escalated')
),
keepers AS (
  SELECT id AS keeper_id, roster_agent_id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r JOIN keepers k ON r.roster_agent_id = k.roster_agent_id
  WHERE r.rn > 1
)
UPDATE coaching_stage_history csh
SET plan_id = d.keeper_id
FROM dupes d
WHERE csh.plan_id = d.dupe_id;

-- Now delete the duplicate plans
WITH ranked AS (
  SELECT id, roster_agent_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY roster_agent_id ORDER BY created_at ASC) AS rn
  FROM coaching_plans
  WHERE stage NOT IN ('resolved', 'escalated')
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM coaching_plans WHERE id IN (SELECT id FROM dupes);

-- 4. Update the deadline column to reflect the earliest flag deadline
UPDATE coaching_plans
SET deadline = (
  SELECT MIN((elem->>'deadline')::timestamptz)
  FROM jsonb_array_elements(flags) AS elem
  WHERE (elem->>'resolved')::boolean = false
)
WHERE flags != '[]'::jsonb
  AND jsonb_array_length(flags) > 0;

-- 5. Drop the old unique constraint (roster_agent_id, flag_type, stage)
ALTER TABLE coaching_plans
  DROP CONSTRAINT IF EXISTS coaching_plans_roster_agent_id_flag_type_stage_key;

-- 6. Add new unique constraint: one active plan per agent
--    (We use a partial unique index instead of a constraint for the stage filter)
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaching_plans_one_active_per_agent
  ON coaching_plans (roster_agent_id)
  WHERE stage NOT IN ('resolved', 'escalated');

-- 7. Make flag_type nullable (kept for backward compat / quick queries, but flags[] is source of truth)
ALTER TABLE coaching_plans ALTER COLUMN flag_type DROP NOT NULL;

-- 8. Recreate the coaching_pipeline_summary view to handle multi-flag
DROP VIEW IF EXISTS coaching_pipeline_summary;

CREATE VIEW coaching_pipeline_summary AS
WITH flag_expanded AS (
  SELECT
    cp.agency_id,
    cp.stage,
    cp.deadline,
    (elem->>'type') AS flag_type,
    ((elem->>'resolved')::boolean) AS flag_resolved
  FROM coaching_plans cp,
       jsonb_array_elements(cp.flags) AS elem
  WHERE cp.stage NOT IN ('resolved', 'escalated')
)
SELECT
  fe.agency_id,
  a.name AS agency_name,
  a.writing_number AS agency_writing_number,
  fe.flag_type,
  fe.stage,
  count(*) AS plan_count,
  count(*) FILTER (WHERE fe.deadline < now()) AS overdue_count,
  count(*) FILTER (WHERE fe.deadline >= now() AND fe.deadline <= now() + interval '7 days') AS due_this_week_count,
  count(*) AS active_count
FROM flag_expanded fe
JOIN agencies a ON a.id = fe.agency_id
WHERE fe.flag_resolved = false
GROUP BY fe.agency_id, a.name, a.writing_number, fe.flag_type, fe.stage;
