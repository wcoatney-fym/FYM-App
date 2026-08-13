// ── Recruiting Tracker Types ───────────────────────────────────────────────

// ── Insurance Lead Statuses (Meta Ads → Policy Placement) ──────────────────
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'placed' | 'lost';

// ── Recruiting Pipeline Stages (Agent Recruiting) ──────────────────────────
// FB Ad → Lead → Attendee → Hired → Contracting → RTS → First Sale
export type RecruitingStage =
  | 'lead'        // Responded to recruiting ad, generated in recruiting subaccount
  | 'attendee'    // RSVP'd / attended onboarding call
  | 'hired'       // Agreed to join
  | 'contracting' // Populated in contracting subaccount, paperwork in progress
  | 'rts'         // Ready To Sell — fully contracted, appointed, licensed
  | 'producing'   // Has first sale (tracked via NPN)
  | 'lost';       // Dropped out at any stage

export const RECRUITING_STAGES: { key: RecruitingStage; label: string; color: string }[] = [
  { key: 'lead',        label: 'Leads',        color: 'hsl(199,89%,48%)' },
  { key: 'attendee',    label: 'Attendees',    color: 'hsl(38,92%,50%)' },
  { key: 'hired',       label: 'Hired',        color: 'hsl(262,83%,58%)' },
  { key: 'contracting', label: 'Contracting',  color: 'hsl(199,65%,55%)' },
  { key: 'rts',         label: 'RTS',          color: 'hsl(142,71%,45%)' },
  { key: 'producing',   label: 'Producing',    color: 'hsl(80,65%,45%)' },
];

export const RECRUITING_STAGE_ORDER: Record<RecruitingStage, number> = {
  lead: 0,
  attendee: 1,
  hired: 2,
  contracting: 3,
  rts: 4,
  producing: 5,
  lost: -1,
};

export type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';

export interface Campaign {
  id: string;
  name: string;
  platform: 'facebook' | 'instagram' | 'both';
  status: CampaignStatus;
  startDate: string;
  endDate: string | null;
  totalSpend: number;
  totalLeads: number;
  cpl: number;
  cpa: number;
  contactRate: number;
  closeRatio: number;
  placedPolicies: number;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: LeadStatus;
  campaignId: string;
  campaignName: string;
  assignedAgency: string | null;
  assignedAgent: string | null;
  createdAt: string;
  contactedAt: string | null;
  quotedAt: string | null;
  placedAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  notes: string;
}

// ── Recruiting Lead (Agent Pipeline) ───────────────────────────────────────
export interface RecruitingLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: RecruitingStage;
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  npn: string | null;             // NPN gathered during onboarding — enables production tracking
  writingNumber: string | null;   // Writing number once contracting completes
  // Timestamps for each stage transition
  leadAt: string;                 // When they entered as a lead
  attendeeAt: string | null;
  hiredAt: string | null;
  contractingAt: string | null;
  rtsAt: string | null;
  producingAt: string | null;     // First sale date
  lostAt: string | null;
  lostStage: RecruitingStage | null; // Stage at which they dropped
  lostReason: string | null;
  notes: string | null;
}

export interface DailySpend {
  date: string;
  spend: number;
  leads: number;
  cpl: number;
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  dailyData: DailySpend[];
  funnel: RecruitingFunnel;
  adSets: AdSet[];
}

export interface AdSet {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
}

// ── Recruiting Funnel ──────────────────────────────────────────────────────
export interface RecruitingFunnel {
  leads: number;
  attendees: number;
  hired: number;
  contracting: number;
  rts: number;
  producing: number;
  lost: number;
}

// ── Stage Timing (avg days in each stage) ──────────────────────────────────
export interface StageTiming {
  stage: RecruitingStage;
  label: string;
  avgDays: number;
  medianDays: number;
  count: number; // number of leads that have passed through this stage
}

export interface RoiByAgency {
  agencyId: string;
  agencyName: string;
  spend: number;
  leads: number;
  placed: number;
  cpa: number;
  conversionRate: number;
}

export interface RoiByAgent {
  agentId: string;
  agentName: string;
  agencyName: string;
  leads: number;
  placed: number;
  cpa: number;
  conversionRate: number;
}

export interface RecruitingKpis {
  totalSpend: number;
  totalLeads: number;
  cpl: number;
  cpa: number;
  contactRate: number;
  closeRatio: number;
  placedPolicies: number;
  activeAdSets: number;
  spendDelta: number; // % change vs prior period
  leadsDelta: number;
  cplDelta: number;
  cpaDelta: number;
  // Pipeline KPIs
  totalRecruits: number;
  attendeeRate: number;     // % of leads that became attendees
  hireRate: number;         // % of attendees that got hired
  rtsRate: number;          // % of hired that reached RTS
  avgDaysToRts: number;     // Average days from lead to RTS
  avgDaysToFirstSale: number; // Average days from lead to first sale
}

// ── Date-filtered query params ─────────────────────────────────────────────
export interface RecruitingDateFilter {
  startDate: string;  // ISO date string
  endDate: string;    // ISO date string (exclusive)
}

// ── Stage Transition Log ───────────────────────────────────────────────────
export type TransitionCondition =
  | 'tag_applied'    // GHL tag was applied
  | 'pipeline_move'  // GHL pipeline stage change
  | 'manual'         // Manual override
  | 'backfill'       // One-time backfill
  | 'auto_lost'      // Lost threshold triggered
  | 're_entry';      // Re-entered pipeline after Lost

export interface StageTransition {
  id: number;
  leadId: string | null;
  ghlContactId: string;
  stage: RecruitingStage;
  condition: TransitionCondition;
  previousStage: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

// ── Backfill Log ───────────────────────────────────────────────────────────
export type BackfillStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BackfillLogEntry {
  id: number;
  title: string;
  description: string;
  backfillType: string;
  status: BackfillStatus;
  stats: {
    matched?: number;
    fuzzy?: number;
    unmatched?: number;
    total?: number;
    [key: string]: unknown;
  };
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ── Lost Settings ──────────────────────────────────────────────────────────
export interface LostSetting {
  id: number;
  settingKey: string;
  settingValue: string;
  updatedAt: string;
}
