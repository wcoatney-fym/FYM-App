-- Add client_name and writing_number to policy_cache
ALTER TABLE policy_cache ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE policy_cache ADD COLUMN IF NOT EXISTS writing_number text;

-- Recreate book_of_business view with client_name
DROP VIEW IF EXISTS public.book_of_business;
CREATE VIEW public.book_of_business AS
SELECT
  pc.policy_number,
  pc.client_name,
  pc.agent_id,
  p.full_name AS agent_name,
  p.writing_number,
  pc.agency_id,
  a.name AS agency_name,
  pc.product_type,
  pc.status,
  pc.plan_premium AS monthly_premium,
  pc.plan_premium * 12 AS annual_premium,
  pc.billing_mode,
  pc.policy_effective_date,
  pc.paid_to_date,
  pc.draft_count,
  pc.is_at_risk,
  pc.flag_type,
  pc.last_contact_date,
  pc.synced_at,
  CASE WHEN pc.paid_to_date IS NOT NULL
       THEN CURRENT_DATE - pc.paid_to_date
       ELSE NULL
  END AS days_since_paid
FROM policy_cache pc
LEFT JOIN profiles p ON p.id = pc.agent_id
LEFT JOIN agencies a ON a.tracker_id = pc.agency_id
WHERE pc.product_type = ANY(ARRAY['HI', 'HHC']);

-- Recreate manager_at_risk_board view with agent_name + client_name
DROP VIEW IF EXISTS public.manager_at_risk_board;
CREATE VIEW public.manager_at_risk_board AS
SELECT
  pc.policy_number,
  pc.client_name,
  pc.agency_id,
  COALESCE(ag.name, pc.agency_id) AS agency_name,
  pc.agent_id,
  p.full_name AS agent_name,
  p.writing_number,
  pc.product_type,
  pc.plan_premium,
  pc.flag_type,
  pc.paid_to_date,
  pc.policy_effective_date,
  pc.draft_count,
  pc.is_at_risk,
  pc.synced_at,
  CURRENT_DATE - pc.paid_to_date AS days_since_draft,
  t.id AS task_id,
  t.status AS task_status,
  t.assigned_to AS task_assigned_to,
  t.due_date AS task_due_date,
  t.created_at AS task_created_at
FROM policy_cache pc
LEFT JOIN agencies ag ON pc.agency_id = ag.tracker_id
LEFT JOIN profiles p ON p.id = pc.agent_id
LEFT JOIN LATERAL (
  SELECT id, status, assigned_to, due_date, created_at
  FROM atrisk_tasks
  WHERE policy_number = pc.policy_number
  ORDER BY created_at DESC
  LIMIT 1
) t ON true
WHERE pc.status = 'active'
  AND pc.paid_to_date IS NOT NULL
  AND pc.paid_to_date < CURRENT_DATE;
