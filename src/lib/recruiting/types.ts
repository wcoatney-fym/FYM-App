// ── Recruiting Tracker Types ───────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'placed' | 'lost';

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
  funnel: {
    leads: number;
    contacted: number;
    quoted: number;
    placed: number;
    lost: number;
  };
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
}
