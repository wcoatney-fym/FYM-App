-- Coaching Pipeline Schema
-- Agent-focused coaching pipeline with 3 flag types:
--   production (yellow) — low production, 30-day window
--   quality    (red)    — high at-risk/terminated %, 30-day window
--   rts_watch  (green)  — moved to RTS in contracting, 7-day window
--
-- Every flag follows the same pipeline:
--   flagged → assigned → action_plan → in_progress → review → resolved | escalated

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Extend coaching_thresholds with production threshold
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE coaching_thresholds
  ADD COLUMN IF NOT EXISTS production_min_policies    integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS production_lookback_days   integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS production_deadline_days   integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS quality_lookback_days      integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS quality_deadline_days      integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS rts_deadline_days          integer NOT NULL DEFAULT 30;

COMMENT ON COLUMN coaching_thresholds.production_min_policies IS 'Minimum policies in trailing lookback window to avoid a production flag';
COMMENT ON COLUMN coaching_thresholds.production_lookback_days IS 'Trailing days to evaluate production (default 14 = bi-weekly)';
COMMENT ON COLUMN coaching_thresholds.production_deadline_days IS 'Days the agent has to resolve a production flag (default 30)';
COMMENT ON COLUMN coaching_thresholds.quality_lookback_days IS 'Trailing days to evaluate quality metrics — at-risk %, terminated % (default 60)';
COMMENT ON COLUMN coaching_thresholds.quality_deadline_days IS 'Days the agent has to resolve a quality flag (default 30)';
COMMENT ON COLUMN coaching_thresholds.rts_deadline_days IS 'Days the agent has to resolve an RTS watch flag (default 30)';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Enum types
-- ═══════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE coaching_flag_type AS ENUM ('production', 'quality', 'rts_watch');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE coaching_stage AS ENUM (
    'flagged',
    'assigned',
    'action_plan',
    'in_progress',
    'review',
    'resolved',
    'escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE coaching_requirement_type AS ENUM (
    'training',         -- assigned training content from portal DB
    'coaching_meeting', -- scheduled 1:1 meeting
    'live_attendance',  -- attend N live training sessions
    'custom_task'       -- free-text checklist item
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. coaching_plans — one card per coaching engagement
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coaching_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id),
  -- Agent reference: FK to agency_rosters for the coached agent
  roster_agent_id uuid NOT NULL REFERENCES agency_rosters(id),
  -- Flag type determines color + window
  flag_type       coaching_flag_type NOT NULL,
  stage           coaching_stage NOT NULL DEFAULT 'flagged',

  -- Who's coaching this agent
  assigned_to     uuid REFERENCES profiles(id),  -- manager/admin profile
  assigned_at     timestamptz,

  -- Timing
  flagged_at      timestamptz NOT NULL DEFAULT now(),
  deadline        timestamptz NOT NULL,  -- auto-set based on flag window
  resolved_at     timestamptz,
  escalated_at    timestamptz,

  -- Trigger context
  trigger_metric  jsonb,  -- snapshot of the metric that caused the flag
                          -- e.g. {"policies_30d": 1, "threshold": 3}
                          -- or   {"at_risk_pct": 22.5, "threshold": 15.0}

  -- Target metric for resolution
  target_metric   jsonb,  -- e.g. {"metric": "policies_30d", "target": 3}
                          -- or   {"metric": "at_risk_pct", "target": 15.0}

  -- Resolution details
  resolution_note text,
  resolution_type text,   -- 'met_target', 'manager_override', 'auto_resolved', 'terminated'

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- An agent should have at most one active plan per flag type
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaching_plans_active_unique
  ON coaching_plans (roster_agent_id, flag_type)
  WHERE stage NOT IN ('resolved', 'escalated');

-- Fast lookups by agency + stage
CREATE INDEX IF NOT EXISTS idx_coaching_plans_agency_stage
  ON coaching_plans (agency_id, stage);

-- Fast lookups by assignee
CREATE INDEX IF NOT EXISTS idx_coaching_plans_assigned
  ON coaching_plans (assigned_to)
  WHERE assigned_to IS NOT NULL;

COMMENT ON TABLE coaching_plans IS 'Agent coaching cards — one per flag type per agent. Tracks the full pipeline from flagged through resolution/escalation.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. coaching_requirements — action plan items on each card
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coaching_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           uuid NOT NULL REFERENCES coaching_plans(id) ON DELETE CASCADE,
  requirement_type  coaching_requirement_type NOT NULL,

  -- For 'training': portal training content ID
  training_content_id text,

  -- For 'coaching_meeting': scheduled date/time
  meeting_scheduled_at timestamptz,
  meeting_attended     boolean NOT NULL DEFAULT false,
  meeting_notes        text,

  -- For 'live_attendance': required count
  required_count    integer,   -- e.g. "attend 3 live trainings"
  completed_count   integer NOT NULL DEFAULT 0,

  -- For 'custom_task': description
  title             text NOT NULL DEFAULT '',
  description       text,

  -- Universal completion tracking
  is_completed      boolean NOT NULL DEFAULT false,
  completed_at      timestamptz,
  completed_by      uuid REFERENCES profiles(id),

  -- Ordering within the plan
  sort_order        integer NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_requirements_plan
  ON coaching_requirements (plan_id);

COMMENT ON TABLE coaching_requirements IS 'Action plan items assigned to a coaching card. Trainings, meetings, live attendance targets, and custom tasks.';

-- ═══════════════════════════════════════════════════════════════════════
-- 5. coaching_notes — timestamped notes on coaching cards
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coaching_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES coaching_plans(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_notes_plan
  ON coaching_notes (plan_id, created_at);

COMMENT ON TABLE coaching_notes IS 'Timestamped notes on coaching cards from managers and agents.';

-- ═══════════════════════════════════════════════════════════════════════
-- 6. coaching_stage_history — audit trail of stage transitions
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coaching_stage_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES coaching_plans(id) ON DELETE CASCADE,
  from_stage  coaching_stage,
  to_stage    coaching_stage NOT NULL,
  changed_by  uuid REFERENCES profiles(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_stage_history_plan
  ON coaching_stage_history (plan_id, created_at);

COMMENT ON TABLE coaching_stage_history IS 'Audit trail of coaching plan stage transitions.';

-- ═══════════════════════════════════════════════════════════════════════
-- 7. RLS policies — all tables
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE coaching_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_stage_history ENABLE ROW LEVEL SECURITY;

-- coaching_plans: authenticated users can read/write
CREATE POLICY "Authenticated users can read coaching plans"
  ON coaching_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert coaching plans"
  ON coaching_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update coaching plans"
  ON coaching_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete coaching plans"
  ON coaching_plans FOR DELETE TO authenticated USING (true);

-- coaching_requirements: authenticated users can read/write
CREATE POLICY "Authenticated users can read coaching requirements"
  ON coaching_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert coaching requirements"
  ON coaching_requirements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update coaching requirements"
  ON coaching_requirements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete coaching requirements"
  ON coaching_requirements FOR DELETE TO authenticated USING (true);

-- coaching_notes: authenticated users can read/write
CREATE POLICY "Authenticated users can read coaching notes"
  ON coaching_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert coaching notes"
  ON coaching_notes FOR INSERT TO authenticated WITH CHECK (true);

-- coaching_stage_history: authenticated users can read, system inserts
CREATE POLICY "Authenticated users can read coaching stage history"
  ON coaching_stage_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert coaching stage history"
  ON coaching_stage_history FOR INSERT TO authenticated WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Updated_at triggers
-- ═══════════════════════════════════════════════════════════════════════

-- Reuse existing trigger function if available, otherwise create
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_coaching_plans_updated_at
  BEFORE UPDATE ON coaching_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_coaching_requirements_updated_at
  BEFORE UPDATE ON coaching_requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
