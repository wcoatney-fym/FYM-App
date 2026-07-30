-- Stage history table to track pipeline transitions for at-risk policies.
-- Admins need to see previous stages, who moved it, and when.

CREATE TABLE IF NOT EXISTS atrisk_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES atrisk_tasks(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_atrisk_stage_history_task ON atrisk_stage_history(task_id);
CREATE INDEX IF NOT EXISTS idx_atrisk_stage_history_changed_at ON atrisk_stage_history(changed_at DESC);

-- Enable RLS
ALTER TABLE atrisk_stage_history ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users (scoped by app-level auth, not RLS)
CREATE POLICY "Authenticated read stage history"
  ON atrisk_stage_history FOR SELECT
  TO authenticated
  USING (true);

-- Insert for authenticated users
CREATE POLICY "Authenticated insert stage history"
  ON atrisk_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (true);
