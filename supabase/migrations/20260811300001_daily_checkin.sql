-- Daily Agent Check-In tables
-- Supports SMS-based daily check-in for FYM internal agents

-- Motivational quote library
CREATE TABLE IF NOT EXISTS checkin_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_text text NOT NULL,
  attribution text,
  category text NOT NULL DEFAULT 'sales'
    CHECK (category IN ('sales', 'persistence', 'mindset', 'follow_up', 'insurance')),
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Check-in recipients — which agents get the daily SMS
CREATE TABLE IF NOT EXISTS checkin_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_agent_id uuid NOT NULL,        -- FK to portal agents table (akhojh)
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,                   -- E.164 format
  active boolean NOT NULL DEFAULT true,
  added_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(portal_agent_id)
);

-- Manager summary recipients
CREATE TABLE IF NOT EXISTS checkin_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,                   -- E.164 format
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone)
);

-- Daily responses
CREATE TABLE IF NOT EXISTS checkin_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES checkin_recipients(id) ON DELETE CASCADE,
  check_in_date date NOT NULL,
  is_working boolean,                    -- Q1: working today?
  has_four_plus_hours boolean,           -- Q2: 4+ hrs talk time?
  app_goal smallint CHECK (app_goal BETWEEN 1 AND 5), -- Q3: apps planned (5 = "5+")
  quote_shown text,                      -- which quote was sent
  conversation_state text NOT NULL DEFAULT 'pending'
    CHECK (conversation_state IN ('pending', 'q1_sent', 'q2_sent', 'q3_sent', 'complete', 'declined', 'nudged')),
  nudge_sent boolean NOT NULL DEFAULT false,
  responded_at timestamptz,              -- when last reply came in
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id, check_in_date)
);

-- Indexes
CREATE INDEX idx_checkin_responses_date ON checkin_responses(check_in_date);
CREATE INDEX idx_checkin_responses_state ON checkin_responses(conversation_state);
CREATE INDEX idx_checkin_recipients_active ON checkin_recipients(active) WHERE active = true;
CREATE INDEX idx_checkin_managers_active ON checkin_managers(active) WHERE active = true;

-- RLS
ALTER TABLE checkin_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_responses ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users (managers/admins see everything via app)
CREATE POLICY checkin_quotes_read ON checkin_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY checkin_recipients_read ON checkin_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY checkin_managers_read ON checkin_managers FOR SELECT TO authenticated USING (true);
CREATE POLICY checkin_responses_read ON checkin_responses FOR SELECT TO authenticated USING (true);

-- Write access for service role only (edge functions handle all writes)
-- Authenticated users can insert/update recipients and managers (admin UI)
CREATE POLICY checkin_recipients_insert ON checkin_recipients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY checkin_recipients_update ON checkin_recipients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY checkin_managers_insert ON checkin_managers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY checkin_managers_update ON checkin_managers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY checkin_managers_delete ON checkin_managers FOR DELETE TO authenticated USING (true);
CREATE POLICY checkin_recipients_delete ON checkin_recipients FOR DELETE TO authenticated USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_checkin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checkin_recipients_updated_at
  BEFORE UPDATE ON checkin_recipients
  FOR EACH ROW EXECUTE FUNCTION update_checkin_updated_at();

CREATE TRIGGER checkin_responses_updated_at
  BEFORE UPDATE ON checkin_responses
  FOR EACH ROW EXECUTE FUNCTION update_checkin_updated_at();

-- Seed managers
INSERT INTO checkin_managers (name, phone) VALUES
  ('Will Coatney', '+18163846282'),
  ('Jon Cole', '+13363024992'),
  ('James Walker', '+13106999698'),
  ('Peter Walker', '+18182016979')
ON CONFLICT (phone) DO NOTHING;

-- Seed motivational quotes (30 insurance/sales-specific)
INSERT INTO checkin_quotes (quote_text, attribution, category) VALUES
  ('The sale begins when the customer says no.', 'Elmer Wheeler', 'sales'),
  ('Every policy you write is a family you protect.', NULL, 'insurance'),
  ('Persistence beats resistance. Every. Single. Time.', NULL, 'persistence'),
  ('You don''t close deals sitting in your car. Dial the phone.', NULL, 'sales'),
  ('The best time to plant a tree was 20 years ago. The second best time is this call.', NULL, 'mindset'),
  ('Premium is just a number. Protection is the promise.', NULL, 'insurance'),
  ('Your competitor is on the phone right now. Are you?', NULL, 'sales'),
  ('The money is in the follow-up. Always has been.', NULL, 'follow_up'),
  ('Discipline is choosing between what you want now and what you want most.', 'Abraham Lincoln', 'mindset'),
  ('An at-risk policy is a family about to lose protection. That''s the urgency.', NULL, 'insurance'),
  ('Every no gets you closer to a yes. That''s just math.', NULL, 'sales'),
  ('Retention is the unsexy work that pays the best.', NULL, 'persistence'),
  ('Three more dials. That''s all that separates good from great today.', NULL, 'sales'),
  ('The agent who follows up wins. Not the fastest, not the smartest — the most persistent.', NULL, 'follow_up'),
  ('You don''t rise to the level of your goals. You fall to the level of your systems.', 'James Clear', 'mindset'),
  ('One more app today is 12 more premiums this year.', NULL, 'sales'),
  ('Nobody cares how much you know until they know how much you care.', 'Zig Ziglar', 'insurance'),
  ('Talk time is money time. Protect it like it pays your mortgage — because it does.', NULL, 'sales'),
  ('The pipeline doesn''t fill itself. You do.', NULL, 'sales'),
  ('Consistency compounds. A good week is seven good days. Start with today.', NULL, 'persistence'),
  ('Your clients don''t remember your pitch. They remember how you made them feel.', NULL, 'insurance'),
  ('Speed to lead wins. The first agent who calls gets the app.', NULL, 'sales'),
  ('Pain is temporary. A bad month is temporary. Quitting is permanent.', NULL, 'mindset'),
  ('The close doesn''t happen at the end. It happens with the first question you ask.', NULL, 'sales'),
  ('Hospital Indemnity isn''t optional — it''s the gap between covered and catastrophe.', NULL, 'insurance'),
  ('If you''re not embarrassed by the number of times you follow up, you''re not following up enough.', NULL, 'follow_up'),
  ('The best agents aren''t the most talented. They''re the most consistent.', NULL, 'persistence'),
  ('Write the app. Collect the premium. Protect the family. Repeat.', NULL, 'insurance'),
  ('Motivation gets you started. Habits keep you writing.', NULL, 'mindset'),
  ('Your biggest competition isn''t another agent — it''s yesterday''s version of you.', NULL, 'mindset')
ON CONFLICT DO NOTHING;
