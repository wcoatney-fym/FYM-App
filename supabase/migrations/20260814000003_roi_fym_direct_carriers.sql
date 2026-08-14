-- Fix: ROI Producing Agents table was pulling agents from sub-agencies
-- (Highland Health Direct, Wisechoice, American Senior Health, etc.)
-- instead of only FYM direct recruits.
--
-- Also adds carriers column (UNL/GTL tags) to replace the Agency column.

-- Step 1: Add carriers column
ALTER TABLE recruiting_agent_production
  ADD COLUMN IF NOT EXISTS carriers text[] DEFAULT '{}';

-- Step 2: Delete non-FYM-direct agents (those with a populated agency_name)
-- FYM direct agents have blank ga in Max's DB = blank agency_name here.
DELETE FROM recruiting_agent_production
WHERE agency_name IS NOT NULL AND agency_name != '';

-- Step 3: Set all remaining agents to UNL carrier
-- (current data sourced from unl_fym_policy_latest_load)
UPDATE recruiting_agent_production SET carriers = ARRAY['UNL'];
