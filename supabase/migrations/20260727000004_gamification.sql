-- Battles: head-to-head or agency-vs-agency competitions
CREATE TABLE IF NOT EXISTS battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  battle_type text NOT NULL DEFAULT 'agent_vs_agent', -- agent_vs_agent | agency_vs_agency
  metric text NOT NULL DEFAULT 'policies', -- policies | ap | retention
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'upcoming', -- upcoming | active | completed
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Battle participants (agents or agencies)
CREATE TABLE IF NOT EXISTS battle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  participant_type text NOT NULL DEFAULT 'agent', -- agent | agency
  agent_id uuid REFERENCES profiles(id),
  agency_id text, -- tracker_id from agencies table
  display_name text NOT NULL,
  starting_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(battle_id, agent_id),
  UNIQUE(battle_id, agency_id)
);

-- Challenges: org-wide or agency-specific time-boxed goals
CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  challenge_type text NOT NULL DEFAULT 'org_wide', -- org_wide | agency
  target_agency_id text, -- null = org-wide, otherwise specific agency
  metric text NOT NULL DEFAULT 'policies', -- policies | ap | retention
  goal_value numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'upcoming', -- upcoming | active | completed
  is_achieved boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Challenge participants (tracking individual contributions)
CREATE TABLE IF NOT EXISTS challenge_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES profiles(id),
  agency_id text,
  display_name text NOT NULL,
  contribution numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, agent_id)
);

-- Enable RLS
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

-- RLS policies: all authenticated users can read; admins/managers can write
CREATE POLICY "battles_read" ON battles FOR SELECT TO authenticated USING (true);
CREATE POLICY "battles_write" ON battles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "battle_participants_read" ON battle_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "battle_participants_write" ON battle_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "challenges_read" ON challenges FOR SELECT TO authenticated USING (true);
CREATE POLICY "challenges_write" ON challenges FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "challenge_participants_read" ON challenge_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "challenge_participants_write" ON challenge_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
