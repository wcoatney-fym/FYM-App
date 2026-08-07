-- Migration: Auto-advance agent from in_contracting → actively_selling on WN add
--
-- Phase C of agent-facing contracting feature.
-- 
-- When a writing number is added to agent_lob_assignments (from any source:
-- UI, carrier upload, bulk import, direct DB insert), this trigger checks if
-- the agent's pipeline record is in 'in_contracting' with the
-- 'active_agent_request' tag. If so, it auto-moves them to 'actively_selling'
-- and clears the tag.
--
-- This is a server-side safety net that catches WN additions from paths not
-- covered by the client-side Phase B logic (LobAssignment, WritingNumberReviewPanel).

-- ── Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_advance_on_wn_add()
RETURNS TRIGGER AS $$
DECLARE
  v_pipeline RECORD;
  v_remaining_pending INT;
BEGIN
  -- Look up the agent's pipeline record
  SELECT id, stage, tags, wn_pending_count
    INTO v_pipeline
    FROM agent_pipeline
   WHERE agent_id = NEW.agent_id
   LIMIT 1;

  -- Only act if agent is in_contracting with active_agent_request tag
  IF v_pipeline.id IS NOT NULL
     AND v_pipeline.stage = 'in_contracting'
     AND v_pipeline.tags @> ARRAY['active_agent_request']
  THEN
    -- Check if there are still pending WN submissions
    SELECT COUNT(*)
      INTO v_remaining_pending
      FROM agent_writing_number_submissions
     WHERE agent_id = NEW.agent_id
       AND status = 'pending';

    -- Auto-verify any remaining pending submissions for this carrier
    UPDATE agent_writing_number_submissions
       SET status = 'verified',
           reviewed_by = 'system_trigger',
           reviewed_at = NOW()
     WHERE agent_id = NEW.agent_id
       AND carrier = NEW.carrier
       AND status = 'pending';

    -- Recount after auto-verifying
    SELECT COUNT(*)
      INTO v_remaining_pending
      FROM agent_writing_number_submissions
     WHERE agent_id = NEW.agent_id
       AND status = 'pending';

    -- If no pending submissions remain, move to actively_selling
    IF v_remaining_pending = 0 THEN
      UPDATE agent_pipeline
         SET stage = 'actively_selling',
             stage_entered_at = NOW(),
             tags = array_remove(tags, 'active_agent_request'),
             wn_pending_review = FALSE,
             wn_pending_count = 0,
             last_updated_by = 'system_trigger',
             updated_by_source = 'system'
       WHERE id = v_pipeline.id;
    ELSE
      -- Still has pending submissions for other carriers — just update counts
      UPDATE agent_pipeline
         SET wn_pending_count = v_remaining_pending
       WHERE id = v_pipeline.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger on INSERT and UPDATE ───────────────────────────────────────────
-- Fires on both INSERT (new assignment) and UPDATE (WN changed/verified)
DROP TRIGGER IF EXISTS trg_auto_advance_on_wn_add ON agent_lob_assignments;

CREATE TRIGGER trg_auto_advance_on_wn_add
  AFTER INSERT OR UPDATE ON agent_lob_assignments
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_advance_on_wn_add();

-- ── Grant execute to anon/authenticated so RLS-governed clients can trigger it
GRANT EXECUTE ON FUNCTION fn_auto_advance_on_wn_add() TO anon, authenticated;

COMMENT ON FUNCTION fn_auto_advance_on_wn_add() IS
  'Phase C: Auto-advance agent from in_contracting → actively_selling when a '
  'writing number is added/updated, if the agent has an active_agent_request tag. '
  'Auto-verifies pending WN submissions for the same carrier. Server-side safety net.';
