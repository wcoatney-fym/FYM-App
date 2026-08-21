-- Add terminated offboarding substeps to agent_pipeline_stage_steps
-- These are the substeps that appear in the Contracting Pipeline UI
-- when an agent is moved to the 'terminated' stage.
--
-- NOTE: This migration targets the FYM App DB (rcbzag).
-- The actual agent_pipeline_stage_steps table lives in the Portal DB (akhojh).
-- This migration is a REFERENCE ONLY — the actual insert must be run
-- against the Portal DB via Management API or the Portal's migration system.
--
-- Documenting here so the substeps are version-controlled with the lifecycle feature.

-- Portal DB (akhojhncsswyzcnicedt) — run via Management API:
--
-- INSERT INTO agent_pipeline_stage_steps (internal_stage, label, display_order, active)
-- VALUES
--   ('terminated', 'Remove from GHL CRM', 1, true),
--   ('terminated', 'Revoke app access', 2, true),
--   ('terminated', 'Remove from Daily Pulse', 3, true),
--   ('terminated', 'Remove from agency roster', 4, true),
--   ('terminated', 'Post Slack offboarding notice', 5, true),
--   ('terminated', 'Notify agency owner', 6, true),
--   ('terminated', 'Archive production data', 7, true)
-- ON CONFLICT DO NOTHING;

-- No-op in FYM App DB — this file exists for documentation only.
SELECT 1;
