/**
 * recruiting/api.ts — Live data fetchers for Meta Ads recruiting tab
 *
 * Reads from recruiting_campaigns, recruiting_ad_sets, and
 * recruiting_daily_spend tables in rcbzag. Falls back to mock
 * data when Supabase isn't configured.
 */

import { supabaseConfigured } from '../supabase';
import { createClient } from '@supabase/supabase-js';

// Use an untyped client for recruiting tables — they aren't in database.types.ts
// until the migration is applied and types are regenerated.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const recruitingSb = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
import type {
  Campaign, Lead, DailySpend, CampaignPerformance,
  AdSet, RoiByAgency, RoiByAgent, RecruitingKpis,
  CampaignStatus,
} from './types';
import {
  MOCK_CAMPAIGNS, MOCK_LEADS, MOCK_DAILY_SPEND, MOCK_KPIS,
  MOCK_CAMPAIGN_PERFORMANCE, MOCK_ROI_BY_AGENCY, MOCK_ROI_BY_AGENT,
} from './mock-data';

// ── DB row types ───────────────────────────────────────────────────────────

interface DbCampaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  start_time: string | null;
  stop_time: string | null;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
  synced_at: string;
}

interface DbAdSet {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  cpl: number | null;
  ctr: number | null;
  synced_at: string;
}

interface DbDailySpend {
  campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
}

interface DbKpis {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  cpl: number | null;
  ctr: number | null;
}

// ── Mappers ────────────────────────────────────────────────────────────────

function mapStatus(metaStatus: string): CampaignStatus {
  const m: Record<string, CampaignStatus> = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    DELETED: 'completed',
    ARCHIVED: 'completed',
  };
  return m[metaStatus] ?? 'draft';
}

function mapCampaign(row: DbCampaign): Campaign {
  const spend = Number(row.total_spend) || 0;
  const leads = Number(row.total_leads) || 0;

  return {
    id: row.id,
    name: row.name,
    platform: 'facebook', // Meta campaigns are all FB/IG
    status: mapStatus(row.status),
    startDate: row.start_time?.slice(0, 10) ?? '',
    endDate: row.stop_time?.slice(0, 10) ?? null,
    totalSpend: spend,
    totalLeads: leads,
    cpl: leads > 0 ? spend / leads : 0,
    cpa: 0, // CPA requires placement data from GHL — future integration
    contactRate: 0,
    closeRatio: 0,
    placedPolicies: 0,
  };
}

function mapAdSet(row: DbAdSet): AdSet {
  const spend = Number(row.total_spend) || 0;
  const impressions = Number(row.total_impressions) || 0;
  const clicks = Number(row.total_clicks) || 0;
  const leads = Number(row.total_leads) || 0;

  return {
    id: row.id,
    name: row.name,
    spend,
    impressions,
    clicks,
    leads,
    cpl: leads > 0 ? spend / leads : 0,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}

function mapDailySpend(row: DbDailySpend): DailySpend {
  const spend = Number(row.spend) || 0;
  const leads = Number(row.leads) || 0;
  return {
    date: row.date,
    spend,
    leads,
    cpl: leads > 0 ? spend / leads : 0,
  };
}

// ── Fetchers ───────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
  if (!supabaseConfigured || !recruitingSb) return MOCK_CAMPAIGNS;

  const { data, error } = await recruitingSb
    .from('recruiting_campaigns')
    .select('*')
    .order('synced_at', { ascending: false });

  if (error || !data?.length) {
    console.warn('[Recruiting] Campaign fetch failed or empty, falling back to mock:', error?.message);
    return MOCK_CAMPAIGNS;
  }

  return (data as DbCampaign[]).map(mapCampaign);
}

export async function fetchRecruitingKpis(): Promise<RecruitingKpis> {
  if (!supabaseConfigured || !recruitingSb) return MOCK_KPIS;

  const { data, error } = await recruitingSb
    .from('recruiting_kpis')
    .select('*')
    .single();

  if (error || !data) {
    console.warn('[Recruiting] KPIs fetch failed, falling back to mock:', error?.message);
    return MOCK_KPIS;
  }

  const kpis = data as DbKpis;
  const spend = Number(kpis.total_spend) || 0;
  const leads = Number(kpis.total_leads) || 0;

  return {
    totalSpend: spend,
    totalLeads: leads,
    cpl: leads > 0 ? spend / leads : 0,
    cpa: 0, // Requires GHL placement data
    contactRate: 0,
    closeRatio: 0,
    placedPolicies: 0,
    activeAdSets: 0, // Will be populated when ad set count query is added
    spendDelta: 0,
    leadsDelta: 0,
    cplDelta: 0,
    cpaDelta: 0,
  };
}

export async function fetchDailySpendData(campaignId?: string): Promise<DailySpend[]> {
  if (!supabaseConfigured || !recruitingSb) return MOCK_DAILY_SPEND;

  let query = recruitingSb
    .from('recruiting_daily_spend')
    .select('*')
    .order('date', { ascending: true });

  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }

  const { data, error } = await query;

  if (error || !data?.length) {
    console.warn('[Recruiting] Daily spend fetch failed or empty, falling back to mock:', error?.message);
    return MOCK_DAILY_SPEND;
  }

  return (data as DbDailySpend[]).map(mapDailySpend);
}

export async function fetchAdSets(campaignId?: string): Promise<AdSet[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  let query = recruitingSb
    .from('recruiting_ad_sets')
    .select('*')
    .order('total_spend', { ascending: false });

  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }

  const { data, error } = await query;

  if (error || !data?.length) {
    console.warn('[Recruiting] Ad sets fetch failed or empty:', error?.message);
    return [];
  }

  return (data as DbAdSet[]).map(mapAdSet);
}

export async function fetchCampaignPerformance(campaignId: string): Promise<CampaignPerformance | null> {
  if (!supabaseConfigured || !recruitingSb) {
    return MOCK_CAMPAIGN_PERFORMANCE.find(p => p.campaignId === campaignId) ?? MOCK_CAMPAIGN_PERFORMANCE[0];
  }

  // Fetch daily data for this campaign
  const dailyData = await fetchDailySpendData(campaignId);
  const adSets = await fetchAdSets(campaignId);

  // Get campaign name
  const { data: campData } = await recruitingSb
    .from('recruiting_campaigns')
    .select('name, total_leads')
    .eq('id', campaignId)
    .single();

  const totalLeads = dailyData.reduce((s, d) => s + d.leads, 0);

  return {
    campaignId,
    campaignName: campData?.name ?? 'Unknown Campaign',
    dailyData,
    funnel: {
      leads: totalLeads,
      contacted: 0, // Requires GHL data
      quoted: 0,
      placed: 0,
      lost: 0,
    },
    adSets,
  };
}

// ROI by agency/agent — requires GHL lead-to-placement mapping (future)
export async function fetchRoiByAgency(): Promise<RoiByAgency[]> {
  return MOCK_ROI_BY_AGENCY;
}

export async function fetchRoiByAgent(): Promise<RoiByAgent[]> {
  return MOCK_ROI_BY_AGENT;
}

// Leads — requires GHL integration (future)
export async function fetchLeads(): Promise<Lead[]> {
  return MOCK_LEADS;
}
