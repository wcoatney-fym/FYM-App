/**
 * Admin At-Risk types — aligned with prod-api AtRiskPolicy + atrisk_tasks join.
 *
 * Data comes from two sources:
 * 1. retention-data edge function (prod DB) → AtRiskPolicy[] — all at-risk policies
 * 2. atrisk_tasks table (FYM App DB) → pipeline stage/assignment for cases being worked
 */

import type { AtRiskPolicy } from '@/lib/prod-api';

/** atrisk_tasks row shape (relevant columns only) */
export interface TaskRecord {
  policy_number: string;
  stage: string;
  status: string;
  assigned_to: string | null;
  assigned_by: string | null;
  agency_id: string | null;
  flag_type: string | null;
  due_date: string | null;
  created_at: string;
  priority: string | null;
  resolution: string | null;
  escalated_at: string | null;
}

/** Merged policy + task for admin view */
export interface AdminAtRiskPolicy extends AtRiskPolicy {
  // Task fields (null if not in pipeline)
  task_stage: string | null;
  task_status: string | null;
  task_assigned_to: string | null;
  task_created_at: string | null;
  task_priority: string | null;
  task_resolution: string | null;
  task_escalated_at: string | null;
}

/** Pipeline stage labels */
export const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  responded: 'Responded',
  manager_outreach: 'Manager Outreach',
  agent_outreach: 'Agent Outreach',
  code_red: 'Code Red',
  agent_saved_pending: 'Pending Save',
  saved: 'Saved',
  lost: 'Lost',
};

/** Stages that count as "in pipeline" (actively being worked) */
export const ACTIVE_PIPELINE_STAGES = [
  'responded',
  'manager_outreach',
  'agent_outreach',
  'code_red',
  'agent_saved_pending',
];

/** Stages that count as "agent follow-up" */
export const AGENT_FOLLOWUP_STAGES = [
  'agent_outreach',
  'code_red',
  'agent_saved_pending',
];
