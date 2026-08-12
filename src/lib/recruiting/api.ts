/**
 * recruiting/api.ts — Live data fetchers for recruiting tabs
 *
 * Reads from recruiting_campaigns, recruiting_ad_sets, recruiting_daily_spend,
 * and recruiting_leads tables in rcbzag. Falls back to mock data when
 * Supabase isn't configured or tables are empty.
 *
 * All fetchers accept optional date filter for period-scoped KPIs/charts.
 */

import { supabaseConfigured } from '../supabase';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const recruitingSb = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

import type {
  Campaign, Lead, DailySpend, CampaignPerformance,
  AdSet, RoiByAgency, RoiByAgent, RecruitingKpis,
  CampaignStatus, RecruitingDateFilter,
  RecruitingLead, RecruitingFunnel, StageTiming,
} from './types';
import {
  MOCK_CAMPAIGNS, MOCK_LEADS, MOCK_DAILY_SPEND, MOCK_KPIS,
  MOCK_CAMPAIGN_PERFORMANCE, MOCK_ROI_BY_AGENCY, MOCK_ROI_BY_AGENT,
  MOCK_RECRUITING_LEADS, MOCK_STAGE_TIMINGS,
} from './mock-data';
import { isInRange } from '../dateUtils';

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
  feed_recruiting: boolean;
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

interface DbRecruitingLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  campaign_id: string | null;
  ad_set_id: string | null;
  npn: string | null;
  writing_number: string | null;
  lead_at: string;
  attendee_at: string | null;
  hired_at: string | null;
  contracting_at: string | null;
  rts_at: string | null;
  producing_at: string | null;
  lost_at: string | null;
  lost_stage: string | null;
  lost_reason: string | null;
  notes: string | null;
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
    platform: 'facebook',
    status: mapStatus(row.status),
    startDate: row.start_time?.slice(0, 10) ?? '',
    endDate: row.stop_time?.slice(0, 10) ?? null,
    totalSpend: spend,
    totalLeads: leads,
    cpl: leads > 0 ? spend / leads : 0,
    cpa: 0,
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

function mapRecruitingLead(row: DbRecruitingLead, campaignName?: string): RecruitingLead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    stage: row.stage as RecruitingLead['stage'],
    campaignId: row.campaign_id,
    campaignName: campaignName ?? null,
    adSetId: row.ad_set_id,
    adSetName: null,
    npn: row.npn,
    writingNumber: row.writing_number,
    leadAt: row.lead_at,
    attendeeAt: row.attendee_at,
    hiredAt: row.hired_at,
    contractingAt: row.contracting_at,
    rtsAt: row.rts_at,
    producingAt: row.producing_at,
    lostAt: row.lost_at,
    lostStage: row.lost_stage as RecruitingLead['lostStage'],
    lostReason: row.lost_reason,
    notes: row.notes,
  };
}

// ── Recruiting campaign ID cache ───────────────────────────────────────────
// Fetches IDs of campaigns flagged as feed_recruiting=true.
// Cached for 30s to avoid repeated queries within the same page load.
let _recruitingIdsCache: { ids: string[]; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

async function getRecruitingCampaignIds(): Promise<string[]> {
  if (_recruitingIdsCache && Date.now() - _recruitingIdsCache.ts < CACHE_TTL) {
    return _recruitingIdsCache.ids;
  }
  if (!recruitingSb) return [];
  const { data, error } = await recruitingSb
    .from('recruiting_campaigns')
    .select('id')
    .eq('feed_recruiting', true);
  if (error || !data) return [];
  const ids = data.map((r: { id: string }) => r.id);
  _recruitingIdsCache = { ids, ts: Date.now() };
  return ids;
}

/** Invalidate the recruiting campaign ID cache (call after toggling feed_recruiting). */
export function invalidateRecruitingCampaignCache(): void {
  _recruitingIdsCache = null;
}

// ── Date filter helpers ────────────────────────────────────────────────────

function filterByDateRange<T>(items: T[], dateKey: keyof T, filter?: RecruitingDateFilter): T[] {
  if (!filter) return items;
  return items.filter(item => {
    const dateVal = item[dateKey];
    if (typeof dateVal !== 'string') return false;
    return isInRange(dateVal, { startDate: filter.startDate, endDate: filter.endDate, label: '' });
  });
}

// ── Campaign fetchers ──────────────────────────────────────────────────────

/**
 * Fetch campaigns flagged as feed_recruiting=true.
 * The Recruiting tab only sees campaigns selected in CRM Ops Ad Spend.
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  if (!supabaseConfigured || !recruitingSb) return MOCK_CAMPAIGNS;

  const { data, error } = await recruitingSb
    .from('recruiting_campaigns')
    .select('*')
    .eq('feed_recruiting', true)
    .order('synced_at', { ascending: false });

  if (error || !data?.length) {
    console.warn('[Recruiting] Campaign fetch failed or empty, falling back to mock:', error?.message);
    return MOCK_CAMPAIGNS;
  }

  return (data as DbCampaign[]).map(mapCampaign);
}

export async function fetchRecruitingKpis(filter?: RecruitingDateFilter): Promise<RecruitingKpis> {
  if (!supabaseConfigured || !recruitingSb) {
    // For mock data, simulate date filtering
    const mockLeads = filter
      ? MOCK_RECRUITING_LEADS.filter(l => isInRange(l.leadAt, { startDate: filter.startDate, endDate: filter.endDate, label: '' }))
      : MOCK_RECRUITING_LEADS;
    const mockSpend = filter
      ? MOCK_DAILY_SPEND.filter(d => isInRange(d.date, { startDate: filter.startDate, endDate: filter.endDate, label: '' }))
      : MOCK_DAILY_SPEND;

    const totalSpend = mockSpend.reduce((s, d) => s + d.spend, 0);
    const totalLeads = mockSpend.reduce((s, d) => s + d.leads, 0);
    const attendees = mockLeads.filter(l => l.attendeeAt).length;
    const hired = mockLeads.filter(l => l.hiredAt).length;
    const rts = mockLeads.filter(l => l.rtsAt).length;

    return {
      ...MOCK_KPIS,
      totalSpend: Math.round(totalSpend),
      totalLeads,
      cpl: totalLeads > 0 ? Math.round(totalSpend / totalLeads * 100) / 100 : 0,
      totalRecruits: mockLeads.length,
      attendeeRate: mockLeads.length > 0 ? attendees / mockLeads.length : 0,
      hireRate: attendees > 0 ? hired / attendees : 0,
      rtsRate: hired > 0 ? rts / hired : 0,
      avgDaysToRts: MOCK_KPIS.avgDaysToRts,
      avgDaysToFirstSale: MOCK_KPIS.avgDaysToFirstSale,
    };
  }

  // Get campaign IDs flagged for recruiting
  const recruitingCampaignIds = await getRecruitingCampaignIds();

  // Live: aggregate from daily_spend + recruiting_leads (scoped to recruiting campaigns)
  let spendQuery = recruitingSb
    .from('recruiting_daily_spend')
    .select('spend, leads');
  if (recruitingCampaignIds.length > 0) {
    spendQuery = spendQuery.in('campaign_id', recruitingCampaignIds);
  }
  if (filter) {
    spendQuery = spendQuery
      .gte('date', filter.startDate.slice(0, 10))
      .lt('date', filter.endDate.slice(0, 10));
  }
  const { data: spendRows } = await spendQuery;
  const totalSpend = (spendRows ?? []).reduce((s: number, r: { spend: number }) => s + Number(r.spend), 0);
  const totalLeads = (spendRows ?? []).reduce((s: number, r: { leads: number }) => s + Number(r.leads), 0);

  let leadsQuery = recruitingSb.from('recruiting_leads').select('*');
  if (recruitingCampaignIds.length > 0) {
    leadsQuery = leadsQuery.in('campaign_id', recruitingCampaignIds);
  }
  if (filter) {
    leadsQuery = leadsQuery
      .gte('lead_at', filter.startDate)
      .lt('lead_at', filter.endDate);
  }
  const { data: leadsRows } = await leadsQuery;
  const leads = (leadsRows ?? []) as DbRecruitingLead[];
  const attendees = leads.filter(l => l.attendee_at).length;
  const hired = leads.filter(l => l.hired_at).length;
  const rts = leads.filter(l => l.rts_at).length;
  const producing = leads.filter(l => l.producing_at).length;

  // Avg days calculations
  const rtsLeads = leads.filter(l => l.rts_at && l.lead_at);
  const avgDaysToRts = rtsLeads.length > 0
    ? rtsLeads.reduce((s, l) => s + (new Date(l.rts_at!).getTime() - new Date(l.lead_at).getTime()) / 86400000, 0) / rtsLeads.length
    : 0;
  const prodLeads = leads.filter(l => l.producing_at && l.lead_at);
  const avgDaysToFirstSale = prodLeads.length > 0
    ? prodLeads.reduce((s, l) => s + (new Date(l.producing_at!).getTime() - new Date(l.lead_at).getTime()) / 86400000, 0) / prodLeads.length
    : 0;

  return {
    totalSpend,
    totalLeads,
    cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
    cpa: producing > 0 ? totalSpend / producing : 0,
    contactRate: totalLeads > 0 ? attendees / totalLeads : 0,
    closeRatio: attendees > 0 ? hired / attendees : 0,
    placedPolicies: producing,
    activeAdSets: 0,
    spendDelta: 0,
    leadsDelta: 0,
    cplDelta: 0,
    cpaDelta: 0,
    totalRecruits: leads.filter(l => l.stage !== 'lost').length,
    attendeeRate: leads.length > 0 ? attendees / leads.length : 0,
    hireRate: attendees > 0 ? hired / attendees : 0,
    rtsRate: hired > 0 ? rts / hired : 0,
    avgDaysToRts: Math.round(avgDaysToRts * 10) / 10,
    avgDaysToFirstSale: Math.round(avgDaysToFirstSale * 10) / 10,
  };
}

export async function fetchDailySpendData(campaignId?: string, filter?: RecruitingDateFilter): Promise<DailySpend[]> {
  if (!supabaseConfigured || !recruitingSb) {
    let data = MOCK_DAILY_SPEND;
    if (filter) data = filterByDateRange(data, 'date', filter);
    return data;
  }

  // Scope to recruiting campaigns unless a specific campaign is requested
  const recruitingCampaignIds = campaignId ? [campaignId] : await getRecruitingCampaignIds();

  let query = recruitingSb
    .from('recruiting_daily_spend')
    .select('*')
    .order('date', { ascending: true });
  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  } else if (recruitingCampaignIds.length > 0) {
    query = query.in('campaign_id', recruitingCampaignIds);
  }
  if (filter) {
    query = query
      .gte('date', filter.startDate.slice(0, 10))
      .lt('date', filter.endDate.slice(0, 10));
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    let fallback = MOCK_DAILY_SPEND;
    if (filter) fallback = filterByDateRange(fallback, 'date', filter);
    return fallback;
  }
  return (data as DbDailySpend[]).map(mapDailySpend);
}

export async function fetchAdSets(campaignId?: string): Promise<AdSet[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  // Scope to recruiting campaigns unless a specific campaign is requested
  const recruitingCampaignIds = campaignId ? [campaignId] : await getRecruitingCampaignIds();

  let query = recruitingSb
    .from('recruiting_ad_sets')
    .select('*')
    .order('total_spend', { ascending: false });
  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  } else if (recruitingCampaignIds.length > 0) {
    query = query.in('campaign_id', recruitingCampaignIds);
  }

  const { data, error } = await query;
  if (error || !data?.length) return [];
  return (data as DbAdSet[]).map(mapAdSet);
}

// ── Recruiting Pipeline fetchers ───────────────────────────────────────────

export async function fetchRecruitingLeads(filter?: RecruitingDateFilter): Promise<RecruitingLead[]> {
  if (!supabaseConfigured || !recruitingSb) {
    let data = MOCK_RECRUITING_LEADS;
    if (filter) data = filterByDateRange(data, 'leadAt', filter);
    return data;
  }

  // Scope to recruiting campaigns
  const recruitingCampaignIds = await getRecruitingCampaignIds();

  let query = recruitingSb
    .from('recruiting_leads')
    .select('*, recruiting_campaigns(name)')
    .order('lead_at', { ascending: false });
  if (recruitingCampaignIds.length > 0) {
    query = query.in('campaign_id', recruitingCampaignIds);
  }
  if (filter) {
    query = query
      .gte('lead_at', filter.startDate)
      .lt('lead_at', filter.endDate);
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    let fallback = MOCK_RECRUITING_LEADS;
    if (filter) fallback = filterByDateRange(fallback, 'leadAt', filter);
    return fallback;
  }

  return (data as (DbRecruitingLead & { recruiting_campaigns?: { name: string } })[])
    .map(row => mapRecruitingLead(row, row.recruiting_campaigns?.name ?? undefined));
}

export async function fetchRecruitingFunnel(filter?: RecruitingDateFilter): Promise<RecruitingFunnel> {
  if (!supabaseConfigured || !recruitingSb) {
    const leads = filter
      ? filterByDateRange(MOCK_RECRUITING_LEADS, 'leadAt', filter)
      : MOCK_RECRUITING_LEADS;
    return computeFunnelFromLeads(leads);
  }

  // Scope to recruiting campaigns
  const recruitingCampaignIds = await getRecruitingCampaignIds();

  let query = recruitingSb.from('recruiting_leads').select('stage, attendee_at, hired_at, contracting_at, rts_at, producing_at, campaign_id');
  if (recruitingCampaignIds.length > 0) {
    query = query.in('campaign_id', recruitingCampaignIds);
  }
  if (filter) {
    query = query
      .gte('lead_at', filter.startDate)
      .lt('lead_at', filter.endDate);
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    const leads = filter
      ? filterByDateRange(MOCK_RECRUITING_LEADS, 'leadAt', filter)
      : MOCK_RECRUITING_LEADS;
    return computeFunnelFromLeads(leads);
  }

  const rows = data as Pick<DbRecruitingLead, 'stage' | 'attendee_at' | 'hired_at' | 'contracting_at' | 'rts_at' | 'producing_at'>[];
  return {
    leads: rows.length,
    attendees: rows.filter(r => r.stage !== 'lost' && (r.attendee_at || ['attendee','hired','contracting','rts','producing'].includes(r.stage))).length,
    hired: rows.filter(r => r.stage !== 'lost' && (r.hired_at || ['hired','contracting','rts','producing'].includes(r.stage))).length,
    contracting: rows.filter(r => r.stage !== 'lost' && (r.contracting_at || ['contracting','rts','producing'].includes(r.stage))).length,
    rts: rows.filter(r => r.stage !== 'lost' && (r.rts_at || ['rts','producing'].includes(r.stage))).length,
    producing: rows.filter(r => r.producing_at || r.stage === 'producing').length,
    lost: rows.filter(r => r.stage === 'lost').length,
  };
}

export async function fetchStageTimings(filter?: RecruitingDateFilter): Promise<StageTiming[]> {
  if (!supabaseConfigured || !recruitingSb) {
    // Compute from mock data
    const leads = filter
      ? filterByDateRange(MOCK_RECRUITING_LEADS, 'leadAt', filter)
      : MOCK_RECRUITING_LEADS;
    return computeTimingsFromLeads(leads);
  }

  // Scope to recruiting campaigns
  const recruitingCampaignIds = await getRecruitingCampaignIds();

  let query = recruitingSb.from('recruiting_leads').select('lead_at, attendee_at, hired_at, contracting_at, rts_at, producing_at, campaign_id');
  if (recruitingCampaignIds.length > 0) {
    query = query.in('campaign_id', recruitingCampaignIds);
  }
  if (filter) {
    query = query
      .gte('lead_at', filter.startDate)
      .lt('lead_at', filter.endDate);
  }

  const { data, error } = await query;
  if (error || !data?.length) return MOCK_STAGE_TIMINGS;

  const rows = data as Pick<DbRecruitingLead, 'lead_at' | 'attendee_at' | 'hired_at' | 'contracting_at' | 'rts_at' | 'producing_at'>[];
  return computeTimingsFromRows(rows);
}

// ── Campaign Performance (for Analytics tab) ───────────────────────────────

export async function fetchCampaignPerformance(campaignId: string, filter?: RecruitingDateFilter): Promise<CampaignPerformance | null> {
  if (!supabaseConfigured || !recruitingSb) {
    const perf = MOCK_CAMPAIGN_PERFORMANCE.find(p => p.campaignId === campaignId) ?? MOCK_CAMPAIGN_PERFORMANCE[0];
    if (filter) {
      return {
        ...perf,
        dailyData: filterByDateRange(perf.dailyData, 'date', filter),
      };
    }
    return perf;
  }

  const dailyData = await fetchDailySpendData(campaignId, filter);
  const adSets = await fetchAdSets(campaignId);

  const { data: campData } = await recruitingSb
    .from('recruiting_campaigns')
    .select('name')
    .eq('id', campaignId)
    .eq('feed_recruiting', true)
    .single();

  // Get funnel from recruiting_leads for this campaign
  let leadsQuery = recruitingSb.from('recruiting_leads')
    .select('stage, attendee_at, hired_at, contracting_at, rts_at, producing_at')
    .eq('campaign_id', campaignId);
  if (filter) {
    leadsQuery = leadsQuery
      .gte('lead_at', filter.startDate)
      .lt('lead_at', filter.endDate);
  }
  const { data: leadsRows } = await leadsQuery;
  const rows = (leadsRows ?? []) as Pick<DbRecruitingLead, 'stage' | 'attendee_at' | 'hired_at' | 'contracting_at' | 'rts_at' | 'producing_at'>[];

  const funnel: RecruitingFunnel = {
    leads: rows.length || dailyData.reduce((s, d) => s + d.leads, 0),
    attendees: rows.filter(r => r.attendee_at || ['attendee','hired','contracting','rts','producing'].includes(r.stage)).length,
    hired: rows.filter(r => r.hired_at || ['hired','contracting','rts','producing'].includes(r.stage)).length,
    contracting: rows.filter(r => r.contracting_at || ['contracting','rts','producing'].includes(r.stage)).length,
    rts: rows.filter(r => r.rts_at || ['rts','producing'].includes(r.stage)).length,
    producing: rows.filter(r => r.producing_at || r.stage === 'producing').length,
    lost: rows.filter(r => r.stage === 'lost').length,
  };

  return {
    campaignId,
    campaignName: campData?.name ?? 'Unknown Campaign',
    dailyData,
    funnel,
    adSets,
  };
}

// ROI — still requires NPN-based join to production data (future)
export async function fetchRoiByAgency(): Promise<RoiByAgency[]> {
  return MOCK_ROI_BY_AGENCY;
}

export async function fetchRoiByAgent(): Promise<RoiByAgent[]> {
  return MOCK_ROI_BY_AGENT;
}

// Insurance leads — original type, still used by LeadsTab
export async function fetchLeads(): Promise<Lead[]> {
  return MOCK_LEADS;
}

// ── Compute helpers ────────────────────────────────────────────────────────

function computeFunnelFromLeads(leads: RecruitingLead[]): RecruitingFunnel {
  return {
    leads: leads.length,
    attendees: leads.filter(l => l.attendeeAt || ['attendee','hired','contracting','rts','producing'].includes(l.stage)).length,
    hired: leads.filter(l => l.hiredAt || ['hired','contracting','rts','producing'].includes(l.stage)).length,
    contracting: leads.filter(l => l.contractingAt || ['contracting','rts','producing'].includes(l.stage)).length,
    rts: leads.filter(l => l.rtsAt || ['rts','producing'].includes(l.stage)).length,
    producing: leads.filter(l => l.producingAt || l.stage === 'producing').length,
    lost: leads.filter(l => l.stage === 'lost').length,
  };
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeTimingsFromLeads(leads: RecruitingLead[]): StageTiming[] {
  const transitions: { stage: RecruitingLead['stage']; label: string; from: keyof RecruitingLead; to: keyof RecruitingLead }[] = [
    { stage: 'lead', label: 'Lead → Attendee', from: 'leadAt', to: 'attendeeAt' },
    { stage: 'attendee', label: 'Attendee → Hired', from: 'attendeeAt', to: 'hiredAt' },
    { stage: 'hired', label: 'Hired → Contracting', from: 'hiredAt', to: 'contractingAt' },
    { stage: 'contracting', label: 'Contracting → RTS', from: 'contractingAt', to: 'rtsAt' },
    { stage: 'rts', label: 'RTS → First Sale', from: 'rtsAt', to: 'producingAt' },
  ];

  return transitions.map(t => {
    const durations = leads
      .filter(l => l[t.from] && l[t.to])
      .map(l => daysBetween(l[t.from] as string, l[t.to] as string))
      .filter(d => d >= 0);

    return {
      stage: t.stage,
      label: t.label,
      avgDays: durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length * 10) / 10 : 0,
      medianDays: Math.round(median(durations) * 10) / 10,
      count: durations.length,
    };
  });
}

function computeTimingsFromRows(rows: Pick<DbRecruitingLead, 'lead_at' | 'attendee_at' | 'hired_at' | 'contracting_at' | 'rts_at' | 'producing_at'>[]): StageTiming[] {
  const transitions: { stage: RecruitingLead['stage']; label: string; from: keyof typeof rows[0]; to: keyof typeof rows[0] }[] = [
    { stage: 'lead', label: 'Lead → Attendee', from: 'lead_at', to: 'attendee_at' },
    { stage: 'attendee', label: 'Attendee → Hired', from: 'attendee_at', to: 'hired_at' },
    { stage: 'hired', label: 'Hired → Contracting', from: 'hired_at', to: 'contracting_at' },
    { stage: 'contracting', label: 'Contracting → RTS', from: 'contracting_at', to: 'rts_at' },
    { stage: 'rts', label: 'RTS → First Sale', from: 'rts_at', to: 'producing_at' },
  ];

  return transitions.map(t => {
    const durations = rows
      .filter(r => r[t.from] && r[t.to])
      .map(r => daysBetween(r[t.from] as string, r[t.to] as string))
      .filter(d => d >= 0);

    return {
      stage: t.stage,
      label: t.label,
      avgDays: durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length * 10) / 10 : 0,
      medianDays: Math.round(median(durations) * 10) / 10,
      count: durations.length,
    };
  });
}
