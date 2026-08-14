-- Fix: Producing stage shows duplicate entries for the same person
-- Root cause: same person exists in both recruiting + contracting GHL
-- sub-accounts with different ghl_contact_ids and slightly different
-- name casing (e.g. "patricia ofoegbu" sync vs "Patricia Ofoegbu" backfill).
-- The UNIQUE(ghl_contact_id, stage) from PR #288 only dedupes by contact ID,
-- not by person name across contact IDs.

-- Step 1: Delete duplicate producing transitions (keep the row with earliest occurred_at)
-- For each group of producing transitions with the same normalized name,
-- keep only the one with the lowest id (which corresponds to the earliest insert).
DELETE FROM recruiting_stage_transitions
WHERE id IN (
  WITH producing_named AS (
    SELECT
      t.id,
      t.ghl_contact_id,
      LOWER(TRIM(COALESCE(l.name, ''))) AS norm_name,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(COALESCE(l.name, '')))
        ORDER BY t.occurred_at ASC, t.id ASC
      ) AS rn
    FROM recruiting_stage_transitions t
    LEFT JOIN recruiting_leads l ON l.ghl_contact_id = t.ghl_contact_id
    WHERE t.stage = 'producing'
      AND COALESCE(l.name, '') != ''
  )
  SELECT id FROM producing_named WHERE rn > 1
);
