/**
 * My Production — shared types (mirrors agent-detail/types.ts for self-scoped view)
 */

export interface AgentStats {
  agent_id: string;
  agent_name: string | null;
  writing_number: string | null;
  agency_id: string;
  agency_name: string | null;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  pending_policies: number;
  at_risk_policies: number;
  active_monthly_premium: number;
  active_annual_premium: number;
  avg_annual_premium: number;
  policies_this_month: number;
  ap_this_month: number;
  retained_policies: number;
  ever_drafted: number;
  retention_pct: number | null;
}

export interface PolicyRow {
  policy_number: string;
  product_type: string;
  status: string;
  monthly_premium: number;
  annual_premium: number;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  draft_count: number;
  is_at_risk: boolean;
  flag_type: string | null;
  days_since_paid: number | null;
}

export interface TrendPoint {
  bucket: string;
  label: string;
  policies: number;
  ap: number;
}

export interface ProductMix {
  product_type: string;
  count: number;
}
