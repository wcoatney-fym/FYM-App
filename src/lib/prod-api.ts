/**
 * prod-api.ts — Client for the direct-to-prod edge functions
 *
 * Calls the new edge functions (prod-data, book-of-business,
 * retention-data, agency-roster-data) that query Max's production DB
 * directly instead of the policy_cache table.
 *
 * Uses the same Supabase project URL + anon key for auth.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function callEdgeFunction<T>(
  functionName: string,
  params: Record<string, string | number | boolean | undefined>
): Promise<T> {
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL not configured');

  const url = new URL(`${supabaseUrl}/functions/v1/${functionName}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge function ${functionName} failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── prod-data types ────────────────────────────────────────────────────

export interface AgencyProduction {
  agency_id: string;
  total_policies: number;
  total_annual_premium: number;
  active_policies: number;
  terminated_policies: number;
  pending_policies: number;
  at_risk_policies: number;
  active_monthly_premium: number;
  active_annual_premium: number;
  terminated_annual_premium: number;
  pending_annual_premium: number;
  at_risk_annual_premium: number;
  policies_this_month: number;
  ap_this_month: number;
  policies_last_month: number;
  ap_last_month: number;
  avg_annual_premium: number;
}

export interface AgentProduction {
  agent_id: string;
  agent_name: string | null;
  writing_number: string | null;
  agency_id: string;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  pending_policies: number;
  at_risk_policies: number;
  active_monthly_premium: number;
  active_annual_premium: number;
  policies_this_month: number;
  ap_this_month: number;
  retained_policies: number;
  ever_drafted: number;
  avg_annual_premium: number;
  retention_pct: number | null;
  earliest_issue_date: string | null;
}

export interface DailyProduction {
  agency_id: string;
  day: string;
  policies: number;
  annual_premium: number;
}

export interface MonthlyProduction {
  agency_id: string;
  month: string;
  policies: number;
  annual_premium: number;
}

export interface ProductMix {
  agency_id: string;
  product_type: string;
  count: number;
}

interface ProdDataResponse<T> {
  data: T;
  _source: string;
  _elapsed_ms: number;
}

export async function fetchAgencyProduction(params?: {
  agency_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<AgencyProduction[]> {
  const res = await callEdgeFunction<ProdDataResponse<AgencyProduction[]>>(
    'prod-data',
    { type: 'agency', ...params }
  );
  return res.data;
}

export async function fetchAgentProduction(params?: {
  agency_id?: string;
  agent_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<AgentProduction[]> {
  const res = await callEdgeFunction<ProdDataResponse<AgentProduction[]>>(
    'prod-data',
    { type: 'agent', ...params }
  );
  return res.data;
}

export async function fetchDailyProduction(params?: {
  agency_id?: string;
  agent_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<DailyProduction[]> {
  const res = await callEdgeFunction<ProdDataResponse<DailyProduction[]>>(
    'prod-data',
    { type: 'daily', ...params }
  );
  return res.data;
}

export async function fetchMonthlyProduction(params?: {
  agency_id?: string;
  agent_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<MonthlyProduction[]> {
  const res = await callEdgeFunction<ProdDataResponse<MonthlyProduction[]>>(
    'prod-data',
    { type: 'monthly', ...params }
  );
  return res.data;
}

export async function fetchProductMix(params?: {
  agency_id?: string;
}): Promise<ProductMix[]> {
  const res = await callEdgeFunction<ProdDataResponse<ProductMix[]>>(
    'prod-data',
    { type: 'product_mix', ...params }
  );
  return res.data;
}

// ── book-of-business types ─────────────────────────────────────────────

export interface PolicyRow {
  policy_number: string;
  product_type: string;
  status: string;
  plan_premium: number;
  annual_premium: number;
  paid_to_date: string | null;
  policy_effective_date: string | null;
  term_date: string | null;
  draft_count: number;
  is_at_risk: boolean;
  flag_type: string | null;
  agency_id: string;
  agent_writing_number: string | null;
  client_name: string | null;
  billing_mode: number | null;
  writing_number: string | null;
}

export interface BookOfBusinessSummary {
  total_policies: number;
  active_policies: number;
  at_risk_policies: number;
  active_monthly_premium: number;
  active_annual_premium: number;
  at_risk_annual_premium: number;
  status_breakdown: Record<string, number>;
}

export interface BookOfBusinessResponse {
  data: PolicyRow[];
  summary: BookOfBusinessSummary;
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
  _source: string;
  _elapsed_ms: number;
}

export async function fetchBookOfBusiness(params?: {
  agency_id?: string;
  agent_wn?: string;
  writing_numbers?: string;
  status?: string;
  product_type?: string;
  at_risk?: boolean;
  search?: string;
  sort?: string;
  order?: string;
  page?: number;
  page_size?: number;
}): Promise<BookOfBusinessResponse> {
  return callEdgeFunction<BookOfBusinessResponse>('book-of-business', {
    ...params,
    at_risk: params?.at_risk ? 'true' : undefined,
  });
}

// ── retention-data types ───────────────────────────────────────────────

export interface AgencyRetentionSummary {
  agency_id: string;
  active_policies: number;
  terminated_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  recent_3mo_pct: number | null;
  prior_3mo_pct: number | null;
}

export interface OrgRetentionSummary {
  total_agencies: number;
  total_active_policies: number;
  total_terminated_policies: number;
  total_active_premium: number;
  total_at_risk: number;
  eligible_90d: number;
  retained_90d: number;
  retention_pct: number | null;
}

export interface RetentionSummaryResponse {
  data: {
    org_wide: OrgRetentionSummary;
    agencies: AgencyRetentionSummary[];
  };
  _source: string;
  _elapsed_ms: number;
}

export interface AtRiskPolicy {
  agency_id: string;
  policy_number: string;
  product_type: string;
  status: string;
  plan_premium: number;
  paid_to_date: string | null;
  policy_effective_date: string | null;
  draft_count: number;
  flag_type: string | null;
  agent_writing_number: string | null;
  client_name: string | null;
  days_idle: number;
}

export interface AtRiskResponse {
  data: {
    total_at_risk: number;
    policies: AtRiskPolicy[];
  };
  _source: string;
  _elapsed_ms: number;
}

export interface CohortEntry {
  month: string;
  eligible: number;
  retained: number;
  retention_pct: number | null;
}

export interface AgencyCohortEntry {
  agency_id: string;
  month: string;
  eligible: number;
  retained: number;
  retention_pct: number | null;
}

export interface CohortResponse {
  data: {
    cohorts: CohortEntry[];
    agency_cohorts?: AgencyCohortEntry[];
  };
  _source: string;
  _elapsed_ms: number;
}

export async function fetchRetentionSummary(params?: {
  agency_id?: string;
  days?: number;
}): Promise<RetentionSummaryResponse> {
  return callEdgeFunction<RetentionSummaryResponse>('retention-data', {
    type: 'summary',
    ...params,
  });
}

export async function fetchAtRiskPolicies(params?: {
  agency_id?: string;
  agent_id?: string;
}): Promise<AtRiskResponse> {
  return callEdgeFunction<AtRiskResponse>('retention-data', {
    type: 'at_risk',
    ...params,
  });
}

export async function fetchRetentionCohorts(params?: {
  agency_id?: string;
  days?: number;
}): Promise<CohortResponse> {
  return callEdgeFunction<CohortResponse>('retention-data', {
    type: 'cohort',
    ...params,
  });
}

// ── agency-roster-data types ───────────────────────────────────────────

export interface RosterAgentData {
  writing_number: string;
  agent_name: string | null;
  total_policies: number;
  active_policies: number;
  at_risk_policies: number;
  total_annual_premium: number;
  active_annual_premium: number;
  policies: PolicyRow[];
}

export interface RosterDataResponse {
  data: RosterAgentData[];
  total_agents: number;
  _source: string;
  _elapsed_ms: number;
}

export async function fetchAgencyRosterData(params?: {
  agency_id?: string;
  writing_numbers?: string;
  agent_wn?: string;
}): Promise<RosterDataResponse> {
  return callEdgeFunction<RosterDataResponse>('agency-roster-data', params || {});
}

// ── agent-directory types ──────────────────────────────────────────────

export interface DirectoryAgent {
  writing_number: string;
  agent_name: string;
  agency_wn: string | null;
  agency_name: string | null;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  pending_policies: number;
  at_risk_policies: number;
  total_annual_premium: number;
  active_annual_premium: number;
}

export interface AgentDirectoryResponse {
  data: DirectoryAgent[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
  _source: string;
  _elapsed_ms: number;
}

export async function fetchAgentDirectory(params?: {
  agency_id?: string;
  page?: number;
  page_size?: number;
  search?: string;
}): Promise<AgentDirectoryResponse> {
  return callEdgeFunction<AgentDirectoryResponse>('agent-directory', params || {});
}
