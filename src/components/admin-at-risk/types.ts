/**
 * Shared types for admin at-risk oversight components.
 *
 * PipelinePolicy is the shape returned by the manager_at_risk_board view,
 * enriched with agency_name and agent_name from the join.
 */

export interface PipelinePolicy {
  policy_number: string;
  agency_id: string;
  agency_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  writing_number: string | null;
  product_type: string;
  plan_premium: number;
  flag_type: string;
  paid_to_date: string;
  policy_effective_date: string;
  draft_count: number;
  is_at_risk: boolean;
  days_since_draft: number;
  client_name: string | null;
  // Task fields from atrisk_tasks join
  task_id: string | null;
  task_status: string | null;
  task_assigned_to: string | null;
  task_due_date: string | null;
  task_created_at: string | null;
}

export interface StageCount {
  stage: string;
  label: string;
  count: number;
  premium: number;
}
