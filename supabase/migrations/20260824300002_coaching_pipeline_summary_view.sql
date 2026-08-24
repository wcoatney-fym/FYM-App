-- Coaching Pipeline Summary View
-- Provides dashboard-ready counts by flag type and stage,
-- plus overdue and due-this-week metrics.

CREATE OR REPLACE VIEW coaching_pipeline_summary AS
SELECT
  cp.agency_id,
  a.name AS agency_name,
  a.writing_number AS agency_writing_number,
  cp.flag_type,
  cp.stage,
  COUNT(*) AS plan_count,
  COUNT(*) FILTER (WHERE cp.deadline < now() AND cp.stage NOT IN ('resolved', 'escalated')) AS overdue_count,
  COUNT(*) FILTER (WHERE cp.deadline BETWEEN now() AND now() + INTERVAL '7 days' AND cp.stage NOT IN ('resolved', 'escalated')) AS due_this_week_count,
  COUNT(*) FILTER (WHERE cp.stage NOT IN ('resolved', 'escalated')) AS active_count
FROM coaching_plans cp
JOIN agencies a ON a.id = cp.agency_id
GROUP BY cp.agency_id, a.name, a.writing_number, cp.flag_type, cp.stage;

COMMENT ON VIEW coaching_pipeline_summary IS 'Dashboard-ready coaching pipeline counts by agency, flag type, and stage.';

-- Grant access to authenticated users
GRANT SELECT ON coaching_pipeline_summary TO authenticated;
