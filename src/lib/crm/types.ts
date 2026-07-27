/**
 * CRM Ops types — mirrored from OpenClaw-Dashboard crm-portal-client.ts
 *
 * All types reference tables in the portal DB (akhojh…).
 */

export type CrmAgency = {
  id: string;
  name: string;
  assigned_csr: string | null;
  csr_first_name: string | null;
  csr_last_name: string | null;
  csr_phone: string | null;
  csr_email: string | null;
  csr_npn: string | null;
  csr_gender: string | null;
  csr_can_fill_seat: boolean;
  onboarding_status:
    | 'pending_csr_assignment'
    | 'awaiting_agency_phone'
    | 'awaiting_subaccount_setup'
    | 'awaiting_roster_upload'
    | 'awaiting_dba_upload'
    | 'onboarding_complete';
  date_added: string;
  seat_count: number;
  is_active: boolean;
  csr_confirmed: boolean;
  roster_confirmed: boolean;
  dba_confirmed: boolean;
  is_test: boolean;
  agency_type: 'main' | 'sub';
  parent_agency_id: string | null;
  crm_number: string | null;
  agency_phone: string | null;
  slug: string | null;
  portal_password: string | null;
  date_created: string | null;
  roster_sent_back_reason: string | null;
  dba_sent_back_reason: string | null;
  setup_subaccount: boolean;
  setup_snapshot: boolean;
  setup_ghl_api: boolean;
  setup_zapier: boolean;
  zaps_paused: boolean;
  price_per_contact: number;
  dba_client_count: number;
  portal_hidden_tabs: string[];
  calendar_embed_code: string | null;
  agency_url_prefix: string | null;
  business_name: string | null;
  business_logo_url: string | null;
  cross_sell_confirmed: boolean;
  is_alumni: boolean;
  crm_enabled: boolean;
  agency_npn: string | null;
  agency_ein: string | null;
  principal_agent: string | null;
  principal_agent_npn: string | null;
  contracting_email: string | null;
  contracting_contact: string | null;
  carriers: string[];
  created_at: string;
  updated_at: string;
};

export type CrmNotification = {
  id: string;
  agency_id: string | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type CrmDbaUpload = {
  id: string;
  agency: string;
  file_name: string;
  row_count: number;
  headers: string[];
  uploaded_at: string;
};

export type CrmDbaRow = {
  id: string;
  upload_id: string;
  row_data: Record<string, string>;
  created_at: string;
};

export type CrmTemplate = {
  id: string;
  name: string;
  description: string;
  file_name: string;
  headers: string[];
  sample_rows: Record<string, string>[];
  defaults_uploaded: boolean | null;
  created_at: string;
  updated_at: string;
};

export type AgencyGhlConfig = {
  id: string;
  agency_id: string;
  ghl_api_key: string;
  ghl_location_id: string;
  connection_status: 'connected' | 'error' | 'disconnected';
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyKpi = {
  id: string;
  agency_id: string;
  period_type: 'week' | 'month' | 'quarter' | 'year' | 'snapshot';
  period_start: string;
  period_end: string;
  deals_closed: number;
  revenue: number;
  pipeline_value: number;
  total_contacts: number;
  contacts_week: number;
  contacts_month: number;
  cross_sell_opportunities: number;
  saved_policies: number;
  cancellations: number;
  agents_onboarded: number;
  agents_in_pipeline: number;
  active_clients: number;
  terminated_clients: number;
  at_risk_clients: number;
  total_policies: number;
  policies_this_month: number;
  top_carrier: string;
  avg_policies_per_agent: number;
  computed_at: string;
};

export type CrmTicket = {
  id: string;
  agency_id: string;
  subject: string;
  description: string;
  category: 'agent-issue' | 'crm-issue' | 'billing' | 'other';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high';
  submitted_by: string;
  roster_row_id: string | null;
  order_type: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type CrmTicketMessage = {
  id: string;
  ticket_id: string;
  sender_type: 'agency' | 'admin';
  sender_name: string;
  message: string;
  created_at: string;
};

export type CrmAgent = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  form_type: 'life-only' | 'field' | 'direct-pay' | 'telesales';
  agency: 'FYM' | 'Wisechoice' | 'Aspire';
  security_code: string;
  status: 'pending' | 'in-progress' | 'completed' | 'expired' | 'terminated';
  date_sent: string;
  date_completed: string | null;
  expiration_date: string;
  form_url: string;
  crm_onboarded: boolean;
  terminated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmFormSubmission = {
  id: string;
  agent_id: string;
  date_of_birth: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  ssn: string;
  resident_license_number: string;
  npn: string;
  resident_state: string;
  ctm_acknowledgment: string | null;
  agent_type: string | null;
  gender: string | null;
  release_needed: string;
  state_licenses: string[];
  submitted_at: string;
};

export type AgencyDeal = {
  id: string;
  agency_id: string;
  ghl_deal_id: string | null;
  deal_name: string;
  contact_name: string | null;
  value: number;
  stage: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  assigned_agent_name: string | null;
  close_date: string | null;
  source: string | null;
  synced_at: string;
  created_at: string;
};

export type AgencyClient = {
  id: string;
  agency_id: string;
  agent_id: string | null;
  ghl_contact_id: string | null;
  first_name: string;
  last_name: string;
  client_name: string;
  phone: string;
  email: string;
  submit_date: string | null;
  ghl_assigned_to: string;
  policy_number: string;
  carrier: string;
  status: 'active' | 'terminated' | 'at_risk' | 'lapsed';
  premium_amount: number;
  product_type: string;
  effective_date: string | null;
  termination_date: string | null;
  risk_flag_reason: string | null;
  created_at: string;
  updated_at: string;
};

export const RESERVED_SLUGS = new Set([
  'life',
  'field',
  'direct-pay',
  'telesales',
  'hip',
  'hip-career',
  'hip-broker',
  'field-hip',
  'direct-pay-hip',
  'telesales-hip',
  'thank-you',
  'dashboard',
  'agent-intake',
  'new-hires',
  'populate-form',
  'populate',
  'agent-tracking',
  'agent-database',
  'crm-team',
  'crm',
  'agency-intake',
]);

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
