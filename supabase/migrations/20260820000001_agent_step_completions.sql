-- Agent Contracting View: step completions + approval loop
-- Part of feat/agent-contracting-view (PR #371)
--
-- 1. agent_step_completions — agent marks steps complete, admin approves/declines
-- 2. agent_action_pending + agent_action_at on agent_pipeline — approval loop flag
-- 3. Tyler test step seed in agent_pipeline_stage_steps

-- =============================================================================
-- 1. agent_step_completions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_step_completions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id   uuid NOT NULL REFERENCES agent_pipeline(id) ON DELETE CASCADE,
  step_id       uuid NOT NULL REFERENCES agent_pipeline_stage_steps(id) ON DELETE CASCADE,
  stage         text NOT NULL,

  -- Agent-side completion
  completed_at  timestamptz,
  completed_by  text,  -- 'agent' or admin user id

  -- Admin approval loop
  status        text NOT NULL DEFAULT 'incomplete'
                CHECK (status IN ('incomplete', 'pending_review', 'approved', 'declined')),
  reviewed_at   timestamptz,
  reviewed_by   text,
  review_note   text,  -- reason for decline

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One completion record per pipeline + step
  UNIQUE (pipeline_id, step_id)
);

-- Index for fast lookups by pipeline
CREATE INDEX IF NOT EXISTS idx_step_completions_pipeline
  ON agent_step_completions(pipeline_id);

-- Index for admin view: find all pending reviews across agents
CREATE INDEX IF NOT EXISTS idx_step_completions_pending
  ON agent_step_completions(status) WHERE status = 'pending_review';

-- =============================================================================
-- 2. agent_action_pending columns on agent_pipeline
-- =============================================================================
-- When an agent marks a step complete, set agent_action_pending = true
-- and agent_action_at = now(). Admin pipeline view sorts by this flag
-- (pending first, then by agent_action_at ASC = oldest pending first).
ALTER TABLE agent_pipeline
  ADD COLUMN IF NOT EXISTS agent_action_pending boolean NOT NULL DEFAULT false;

ALTER TABLE agent_pipeline
  ADD COLUMN IF NOT EXISTS agent_action_at timestamptz;

-- Index for admin pipeline view sorting
CREATE INDEX IF NOT EXISTS idx_pipeline_agent_action
  ON agent_pipeline(agent_action_pending, agent_action_at)
  WHERE agent_action_pending = true;

-- =============================================================================
-- 3. Tyler test step seed
-- =============================================================================
-- Tyler test sits between in_contracting and rts.
-- The agent view shows it as a separate card (TylerTestCard component),
-- but it's also tracked as a stage step for the admin pipeline board.
INSERT INTO agent_pipeline_stage_steps (internal_stage, label, display_order, active)
VALUES ('in_contracting', 'Test out with Tyler', 4, true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 4. Updated_at trigger for agent_step_completions
-- =============================================================================
CREATE OR REPLACE FUNCTION update_step_completions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_step_completions_updated_at ON agent_step_completions;
CREATE TRIGGER trg_step_completions_updated_at
  BEFORE UPDATE ON agent_step_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_step_completions_updated_at();

-- =============================================================================
-- 5. RLS policies for agent_step_completions
-- =============================================================================
ALTER TABLE agent_step_completions ENABLE ROW LEVEL SECURITY;

-- Agents can read their own step completions (via pipeline_id match)
CREATE POLICY "Agents can read own step completions"
  ON agent_step_completions FOR SELECT
  USING (true);  -- RLS is permissive for reads; auth is handled at the app layer

-- Agents can insert/update their own step completions
CREATE POLICY "Agents can insert step completions"
  ON agent_step_completions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Agents can update step completions"
  ON agent_step_completions FOR UPDATE
  USING (true);
