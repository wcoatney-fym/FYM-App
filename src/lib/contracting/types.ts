/**
 * Contracting types — ported from CRM Portal (contracting-portal)
 *
 * These types mirror the Portal's Supabase schema for the contracting
 * admin views. During the parallel-run period, FYM App reads portal
 * tables via portal-supabase.ts using these types.
 *
 * Source: contracting-portal/src/lib/supabase.ts + pages/hub/admin/adminTypes.ts
 */

// ─── Agent Contracting Form Types ────────────────────────────────────────────

export type AgentFormType =
  | 'life-only'
  | 'field'
  | 'direct-pay'
  | 'telesales'
  | 'hip'
  | 'hip-broker'
  | 'hip-career'
  | 'field-hip'
  | 'direct-pay-hip'
  | 'telesales-hip'
  | 'life-only-hip';

export type AgentFormStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'expired'
  | 'terminated';

export type AgencyName = 'FYM' | 'Wisechoice' | 'Aspire';

/** Core agent record — the `agents` table in portal DB */
export type PortalAgent = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  form_type: AgentFormType;
  agency: AgencyName;
  security_code: string;
  status: AgentFormStatus;
  date_sent: string;
  date_completed: string | null;
  expiration_date: string;
  form_url: string;
  crm_onboarded: boolean;
  terminated_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Submitted intake form data — `agent_intake` table */
export type PortalIntakeRecord = {
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

/** Uploaded documents — `uploaded_files` table */
export type PortalUploadedFile = {
  id: string;
  agent_id: string;
  file_name: string;
  file_type: string;
  file_data: string;
  uploaded_at: string;
};

/** Activity log entry — `activity_log` table */
export type PortalActivityLog = {
  id: string;
  agent_id: string | null;
  action: string;
  details: string;
  created_at: string;
};

/** New hire queue entry — `new_hires` table (GHL → Zapier → webhook) */
export type PortalNewHire = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  agency: string;
  source: string | null;
  processed: boolean;
  created_at: string;
};

// ─── Pipeline Types ──────────────────────────────────────────────────────────

export type AgentPipelineStage =
  | 'hip_broker'
  | 'hip_career'
  | 'iaa'
  | 'signed_iaa'
  | 'bill_com'
  | 'crm'
  | 'in_contracting'
  | 'waiting_for_numbers'
  | 'rts'
  | 'hip_broker_ready'
  | 'hip_career_ready'
  | 'actively_selling'
  | 'terminated'
  | 'dnf';

/**
 * Pipeline record — `agent_pipeline` table
 *
 * `agent_id` column added 2026-07-27 — FK to portal `agents` table.
 * Backfilled via email match (20/20 records populated).
 */
export type PortalPipelineRecord = {
  id: string;
  ghl_opportunity_id: string;
  ghl_contact_id: string | null;
  ghl_pipeline_id: string | null;
  ghl_stage_id: string | null;
  stage: AgentPipelineStage;
  agent_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  agency: string | null;
  agency_id: string | null;
  agent_id: string | null;
  writing_numbers: string | null;
  notes: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  completed_steps: Record<string, string>;
  last_updated_by: string;
  last_updated_by_display: string | null;
  updated_by_source: UpdateSource;
  ghl_sync_status: 'synced' | 'pending_push' | 'pushing';
  stage_entered_at: string;
  created_at: string;
  updated_at: string;
  wn_pending_review: boolean;
  wn_pending_count: number;
  /** Agent has submitted a step completion or writing number — needs admin review */
  agent_action_pending?: boolean;
  /** Timestamp of the most recent agent action */
  agent_action_at?: string;
};

/** LOB / writing number assignment — `agent_lob_assignments` table */
export type PortalLobAssignment = {
  id: string;
  agent_id: string;
  line_of_business: string;
  carrier: string;
  writing_number: string;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  submitted_by_agent: boolean;
  ai_extracted: boolean;
  source_submission_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Pipeline stage step (checklist) — `agent_pipeline_stage_steps` table */
export type PortalPipelineStageStep = {
  id: string;
  internal_stage: AgentPipelineStage;
  label: string;
  display_order: number;
  active: boolean;
  /** Whether this step is visible to agents (false = admin-only) */
  agent_visible: boolean;
  created_at: string;
};

// ─── CRM Agency Types ───────────────────────────────────────────────────────

export type AgencyOnboardingStatus =
  | 'pending_csr_assignment'
  | 'awaiting_agency_phone'
  | 'awaiting_subaccount_setup'
  | 'awaiting_roster_upload'
  | 'awaiting_dba_upload'
  | 'onboarding_complete';

export type AgencyContact = {
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
};

export type AgencyNote = {
  text: string;
  created_at: string;
};

/** CRM agency record — `crm_agencies` table */
export type PortalCrmAgency = {
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
  onboarding_status: AgencyOnboardingStatus;
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
  setup_subaccount: boolean;
  setup_snapshot: boolean;
  setup_ghl_api: boolean;
  ghl_api_enabled: boolean;
  setup_zapier: boolean;
  zaps_paused: boolean;
  price_per_contact: number;
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
  principal_agent_email: string | null;
  contracting_email: string | null;
  contracting_contact: string | null;
  comp_tier: string | null;
  variant: string | null;
  carriers: string[];
  agency_state: string | null;
  unl_writing_number: string | null;
  unl_status: string | null;
  street_address: string | null;
  city: string | null;
  zip: string | null;
  additional_contacts: AgencyContact[];
  internal_notes: AgencyNote[] | null;
  created_at: string;
  updated_at: string;
};

// ─── Training / Hub Types ────────────────────────────────────────────────────

/** Training event — `agent_training_events` table */
export type PortalTrainingEvent = {
  id: string;
  agent_id: string;
  event_type: string;
  content_id: string | null;
  content_title: string | null;
  quiz_score: number | null;
  quiz_max_score: number | null;
  session_duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Training content item — `agent_training_content` table */
export type PortalTrainingContent = {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  content_url: string | null;
  content_format: string | null;
  carrier: string | null;
  category: string | null;
  has_quiz: boolean;
  quiz_questions: Record<string, unknown>[] | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Live session — `agent_live_sessions` table */
export type PortalLiveSession = {
  id: string;
  title: string;
  session_datetime: string;
  join_url: string;
  is_active: boolean;
  created_at: string;
};

/** Hub login — `agent_hub_logins` table */
export type PortalHubLogin = {
  id: string;
  agent_id: string;
  logged_in_at: string;
  login_method: string;
  user_agent: string | null;
  ip_address: string | null;
};

/** Live attendance — `agent_live_attendance` table */
export type PortalLiveAttendance = {
  id: string;
  agent_id: string;
  session_id: string;
  clicked_join_at: string;
};

// ─── Derived / Composite Types ───────────────────────────────────────────────

export type UpdateSource =
  | 'contracting_portal'
  | 'training_hub'
  | 'ghl_webhook'
  | 'system'
  | null;

/** Derived agent summary — computed in-memory from multiple portal tables */
export type PortalAgentSummary = {
  agent_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  agency: string | null;
  stage: AgentPipelineStage | null;
  npn: string | null;
  form_type: string | null;
  crm_onboarded: boolean;
  tags: string[];
  video_views: number;
  quiz_attempts: number;
  quiz_passes: number;
  avg_quiz_score: number | null;
  live_clicks: number;
  last_event_at: string | null;
  last_login_at: string | null;
  login_count: number;
  days_in_stage: number | null;
  stage_entered_at: string | null;
  training_pct: number;
  intake: PortalIntakeRecord | null;
  lob_assignments: PortalLobAssignment[];
};

/** Content stat — derived from training events + content */
export type PortalContentStat = {
  content_id: string;
  title: string;
  carrier: string;
  category: string;
  has_quiz: boolean;
  view_count: number;
  quiz_attempt_count: number;
  quiz_pass_count: number;
  avg_score: number | null;
  pass_rate: number | null;
};

/** Contracting tab type — maps to the tab layout in FYM App */
export type ContractingTab =
  | 'dashboard'
  | 'intake'
  | 'tracking'
  | 'pipeline'
  | 'training'
  | 'database'
  | 'hierarchy'
  | 'roster-import'
  | 'carrier-upload'
  | 'onboarding';

// ─── Agency Intake Submission Types ──────────────────────────────────────────

/** Public agency intake submission — `agency_intake_submissions` table */
export type AgencyIntakeSubmission = {
  id: string;
  agency_name: string;
  principal_agent: string;
  principal_agent_npn: string | null;
  contracting_email: string;
  contracting_contact: string | null;
  agency_npn: string;
  agency_ein: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  additional_contacts: AgencyContact[] | null;
  invited_by_agency_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_agency_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** HIP carriers list */
export const HIP_CARRIERS = ['UNL', 'GTL'] as const;

/** US States list for address forms */
export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC'
] as const;
