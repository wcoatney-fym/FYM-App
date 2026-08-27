-- Add Reactivated stage to contracting pipeline (after DNF)
-- Charlie request (2026-08-27): agents who were terminated/DNF but are re-entering the pipeline.
--
-- NOTE: The check constraint and stage map live in the portal DB (akhojh).
-- This migration runs against rcbzag — it seeds stage steps only.
-- Portal DB changes (check constraint + stage map row) are applied via Management API.

-- ─── Seed stage steps for Reactivated (admin-only) ──────────────────────────
INSERT INTO agent_pipeline_stage_steps (id, internal_stage, label, display_order, active, agent_visible)
VALUES
  ('reactivated_note', 'reactivated', 'Reason for reactivation', 1, true, false),
  ('reactivated_review', 'reactivated', 'Review previous history', 2, true, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  agent_visible = EXCLUDED.agent_visible;
