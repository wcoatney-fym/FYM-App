-- Fix: drop the agent_coaching_flags view (references policy_cache which was dropped).
-- The coaching flags data now comes from the coaching-flags edge function
-- querying Max's prod DB directly.

DROP VIEW IF EXISTS public.agent_coaching_flags;
