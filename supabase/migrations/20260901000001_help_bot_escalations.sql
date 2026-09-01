-- Help Bot Escalations
-- Stores unanswered questions flagged by users through the help chatbot.
-- FYM admins triage these during normal task review.

CREATE TABLE IF NOT EXISTS help_bot_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT,
  question TEXT NOT NULL,
  page_context TEXT,  -- which page the user was on when they asked
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_help_bot_escalations_status ON help_bot_escalations (status);
CREATE INDEX idx_help_bot_escalations_user ON help_bot_escalations (user_id);
CREATE INDEX idx_help_bot_escalations_created ON help_bot_escalations (created_at DESC);

-- RLS
ALTER TABLE help_bot_escalations ENABLE ROW LEVEL SECURITY;

-- Users can see their own escalations
CREATE POLICY "Users see own escalations"
  ON help_bot_escalations FOR SELECT
  USING (auth.uid() = user_id);

-- FYM admins see all escalations
CREATE POLICY "FYM admins see all escalations"
  ON help_bot_escalations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM fym_admins WHERE user_id = auth.uid())
  );

-- Users can create escalations (own only)
CREATE POLICY "Users can create escalations"
  ON help_bot_escalations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- FYM admins can update any escalation (resolve/dismiss)
CREATE POLICY "FYM admins can update escalations"
  ON help_bot_escalations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM fym_admins WHERE user_id = auth.uid())
  );
