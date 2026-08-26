-- coaching_training_content — catalog of trainings/quizzes managers can assign
-- via coaching requirements. training_content_id FK already exists on coaching_requirements.

CREATE TABLE IF NOT EXISTS coaching_training_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  content_type text NOT NULL DEFAULT 'training',  -- 'training' | 'quiz'
  url text,
  duration_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coaching_training_content IS
  'Catalog of trainings, quizzes, and learning content that managers can assign to agents via coaching requirements';

CREATE INDEX IF NOT EXISTS idx_coaching_training_content_active
  ON coaching_training_content (is_active, sort_order);

-- FK from coaching_requirements → training content
ALTER TABLE coaching_requirements
  ADD CONSTRAINT fk_coaching_req_training_content
  FOREIGN KEY (training_content_id)
  REFERENCES coaching_training_content(id)
  ON DELETE SET NULL;

-- RLS
ALTER TABLE coaching_training_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active training content"
  ON coaching_training_content FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage training content"
  ON coaching_training_content FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Seed FYM training catalog
INSERT INTO coaching_training_content (title, description, category, content_type, duration_minutes, sort_order) VALUES
  ('HIP Product Training', 'Hospital Indemnity Protection product knowledge — benefits, eligibility, objection handling', 'product', 'training', 60, 1),
  ('HHC Product Training', 'Home Health Care product knowledge — coverage details, pairing with HIP, value proposition', 'product', 'training', 60, 2),
  ('GI HIP Training', 'Guaranteed-Issue HIP — when to use, positioning for declined cases', 'product', 'training', 30, 3),
  ('Sales Script Mastery', 'FYM core sales script — frame, awareness, reframe, close. Must demonstrate fluency.', 'sales', 'training', 45, 4),
  ('SYMTRAIN Simulation', 'Complete simulated sales calls in SYMTRAIN platform', 'sales', 'quiz', 30, 5),
  ('Listen to Sample Calls', 'Review 4 recorded sample sales calls from top producers', 'sales', 'training', 60, 6),
  ('UNL Quote Tool Certification', 'Demonstrate proficiency with UNL eApp quote tool', 'tools', 'quiz', 30, 7),
  ('Compliance & Ethics Review', 'Required compliance training — disclosure requirements, prohibited practices', 'compliance', 'training', 45, 8),
  ('Live Training Attendance', 'Attend FYM 3x weekly live training calls', 'live', 'training', 60, 9),
  ('Tyler 1-on-1 Coaching Session', 'Scheduled coaching session with Tyler Cole — product knowledge and sales technique review', 'coaching', 'training', 60, 10),
  ('Dental 2.0 Product Training', 'Dental product knowledge — eligibility, age bands, cross-sell strategy', 'product', 'training', 30, 11),
  ('Cancer 2.0 Product Training', 'Cancer lump-sum benefit — product details and positioning', 'product', 'training', 30, 12),
  ('FE Life Product Training', 'Final Expense life insurance — newest addition to the FYM book', 'product', 'training', 30, 13),
  ('Retention Best Practices', 'How to write quality business — proper expectations, first-draft success, client follow-up', 'quality', 'training', 45, 14),
  ('Custom Quiz', 'Manager-assigned knowledge check', 'general', 'quiz', NULL, 99)
ON CONFLICT DO NOTHING;
