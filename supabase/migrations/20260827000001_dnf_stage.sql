-- Add DNF (Did Not Finish) stage after Terminated
-- Charlie request (2026-08-27): agents who drop out before completing contracting.

-- ─── 1. Seed stage steps for DNF (all admin-only) ───────────────────────────
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('dnf_note', 'dnf', 'Add reason for DNF', 1, true, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;

-- ─── 2. Stage map for GHL sync (portal DB — akhojh) ─────────────────────────
-- NOTE: The stage map table lives in the portal DB, not rcbzag.
-- This INSERT must be run against akhojh separately or via the portal migration path.
-- GHL stage: "DNF ( Did not Finish)" — id 1ab887d9-2e57-4ab1-adfd-fefff1b10bce
-- Pipeline: New Agents Pipeline (8h8F2lAFHXUkEJgZa2KD)
