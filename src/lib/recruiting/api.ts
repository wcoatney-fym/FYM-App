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

// ── GHL Live Counts (from recruiting-ghl-sync edge function) ───────────────

interface GhlLiveCounts {
  leads: number;
  attendees: number;
  hired: number;
  pipeline?: string;
  hiredBreakdown?: Record<string, number>;
  contracting: number;
  rts: number;
  producing: number;
  lost: number;
  dateFilter: { startDate: string; endDate: string } | null;
  durationMs: number;
  source: string;
  cachedAt: string;
}

let _ghlCountsCache: { data: GhlLiveCounts; ts: number } | null = null;
const GHL_COUNTS_TTL = 60_000; // Cache for 60s

/**
 * Fetch live recruiting pipeline counts from GHL via edge function.
 * Returns leads, attendees, hired counts from the GHL recruiting sub-account.
 */
export async function fetchGhlLiveCounts(filter?: RecruitingDateFilter): Promise<GhlLiveCounts | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Check cache (only for unfiltered requests)
  if (!filter && _ghlCountsCache && Date.now() - _ghlCountsCache.ts < GHL_COUNTS_TTL) {
    return _ghlCountsCache.data;
  }

  try {
    const body: Record<string, string> = { action: 'counts' };
    if (filter) {
      body.startDate = filter.startDate;
      body.endDate = filter.endDate;
    }

    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/functions/v1/recruiting-ghl-sync?action=counts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
        'x-cron-auth': 'dashboard',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[Recruiting] GHL counts fetch failed:', res.status);
      return null;
    }

    const data: GhlLiveCounts = await res.json();

    // Cache unfiltered results
    if (!filter) {
      _ghlCountsCache = { data, ts: Date.now() };
    }

    return data;
  } catch (err) {
    console.warn('[Recruiting] GHL counts error:', err);
    return null;
  }
}

import type {
  Campaign, Lead, DailySpend, CampaignPerformance,
  AdSet, RoiByAgency, RoiByAgent, RecruitingKpis,
  CampaignStatus, RecruitingDateFilter,
  RecruitingLead, RecruitingFunnel, StageTiming,
  RecruitingStage, ProducingAgent, StageDropoff, StallEntry,
} from './types';


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

// mapRecruitingLead removed — fetchRecruitingLeads now uses mapRpcLead via get_recruiting_leads RPC

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

// ── Campaign fetchers ──────────────────────────────────────────────────────

/**
 * Fetch campaigns flagged as feed_recruiting=true.
 * The Recruiting tab only sees campaigns selected in CRM Ops Ad Spend.
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  const { data, error } = await recruitingSb
    .from('recruiting_campaigns')
    .select('*')
    .eq('feed_recruiting', true)
    .order('synced_at', { ascending: false });

  if (error || !data?.length) {
    if (error) console.warn('[Recruiting] Campaign fetch failed:', error.message);
    return [];
  }

  return (data as DbCampaign[]).map(mapCampaign);
}

const EMPTY_KPIS: RecruitingKpis = {
  totalSpend: 0, totalLeads: 0, cpl: 0, cpa: 0,
  contactRate: 0, closeRatio: 0, placedPolicies: 0, activeAdSets: 0,
  spendDelta: 0, leadsDelta: 0, cplDelta: 0, cpaDelta: 0,
  totalRecruits: 0, attendeeRate: 0, hireRate: 0, rtsRate: 0,
  avgDaysToRts: 0, avgDaysToFirstSale: 0,
};

export async function fetchRecruitingKpis(filter?: RecruitingDateFilter): Promise<RecruitingKpis> {
  if (!supabaseConfigured || !recruitingSb) return EMPTY_KPIS;

  // Get campaign IDs flagged for recruiting — if none are flagged, use empty for spend
  const recruitingCampaignIds = await getRecruitingCampaignIds();

  // Fetch ad spend data (from recruiting_daily_spend)
  let totalSpend = 0;
  let totalLeads = 0;
  if (recruitingCampaignIds.length > 0) {
    let spendQuery = recruitingSb
      .from('recruiting_daily_spend')
      .select('spend, leads')
      .in('campaign_id', recruitingCampaignIds);
    if (filter) {
      spendQuery = spendQuery
        .gte('date', filter.startDate.slice(0, 10))
        .lt('date', filter.endDate.slice(0, 10));
    }
    const { data: spendRows } = await spendQuery;
    totalSpend = (spendRows ?? []).reduce((s: number, r: { spend: number }) => s + Number(r.spend), 0);
    totalLeads = (spendRows ?? []).reduce((s: number, r: { leads: number }) => s + Number(r.leads), 0);
  }

  // Fetch live GHL pipeline counts (from edge function — uses stage log when available)
  const ghlCounts = await fetchGhlLiveCounts(filter);
  // Leads = contacts created in GHL (date-filtered)
  const pipelineLeads = ghlCounts?.leads ?? 0;
  // Attendees = from stage log (date-accurate) or GHL tag fallback
  const attendees = ghlCounts?.attendees ?? 0;
  const hired = ghlCounts?.hired ?? 0;
  const rts = ghlCounts?.rts ?? 0;
  const producing = ghlCounts?.producing ?? 0;

  return {
    totalSpend,
    // Total Leads = contacts created (from GHL, date-filtered)
    totalLeads: pipelineLeads || totalLeads,
    cpl: (pipelineLeads || totalLeads) > 0 ? totalSpend / (pipelineLeads || totalLeads) : 0,
    cpa: producing > 0 ? totalSpend / producing : 0,
    contactRate: pipelineLeads > 0 ? attendees / pipelineLeads : 0,
    closeRatio: attendees > 0 ? hired / attendees : 0,
    placedPolicies: producing,
    activeAdSets: 0,
    spendDelta: 0,
    leadsDelta: 0,
    cplDelta: 0,
    cpaDelta: 0,
    totalRecruits: pipelineLeads,
    attendeeRate: pipelineLeads > 0 ? attendees / pipelineLeads : 0,
    hireRate: attendees > 0 ? hired / attendees : 0,
    rtsRate: hired > 0 ? rts / hired : 0,
    avgDaysToRts: 0, // Populated from stage log timings
    avgDaysToFirstSale: 0, // Populated from stage log timings
  };
}

export async function fetchDailySpendData(campaignId?: string, filter?: RecruitingDateFilter): Promise<DailySpend[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  // Scope to recruiting campaigns unless a specific campaign is requested
  const recruitingCampaignIds = campaignId ? [campaignId] : await getRecruitingCampaignIds();
  if (recruitingCampaignIds.length === 0) return [];

  let query = recruitingSb
    .from('recruiting_daily_spend')
    .select('*')
    .order('date', { ascending: true })
    .in('campaign_id', recruitingCampaignIds);
  if (filter) {
    query = query
      .gte('date', filter.startDate.slice(0, 10))
      .lt('date', filter.endDate.slice(0, 10));
  }

  const { data, error } = await query;
  if (error || !data?.length) return [];
  return (data as DbDailySpend[]).map(mapDailySpend);
}

export async function fetchAdSets(campaignId?: string): Promise<AdSet[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  // Scope to recruiting campaigns unless a specific campaign is requested
  const recruitingCampaignIds = campaignId ? [campaignId] : await getRecruitingCampaignIds();
  if (recruitingCampaignIds.length === 0) return [];

  let query = recruitingSb
    .from('recruiting_ad_sets')
    .select('*')
    .order('total_spend', { ascending: false })
    .in('campaign_id', recruitingCampaignIds);

  const { data, error } = await query;
  if (error || !data?.length) return [];
  return (data as DbAdSet[]).map(mapAdSet);
}

// ── RPC row type (from get_recruiting_leads) ──────────────────────────────

interface RpcRecruitingLead {
  ghl_contact_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  npn: string | null;
  writing_number: string | null;
  current_stage: string;
  lead_at: string | null;
  attendee_at: string | null;
  hired_at: string | null;
  contracting_at: string | null;
  rts_at: string | null;
  producing_at: string | null;
  lost_at: string | null;
  days_in_stage: number | null;
}

function mapRpcLead(row: RpcRecruitingLead): RecruitingLead {
  return {
    id: row.ghl_contact_id,
    name: row.name ?? row.email ?? row.ghl_contact_id,
    email: row.email,
    phone: row.phone,
    stage: (row.current_stage ?? 'lead') as RecruitingLead['stage'],
    campaignId: null,
    campaignName: null,
    adSetId: null,
    adSetName: null,
    npn: row.npn,
    writingNumber: row.writing_number,
    leadAt: row.lead_at ?? row.attendee_at ?? row.hired_at ?? row.contracting_at ?? row.rts_at ?? row.producing_at ?? '',
    attendeeAt: row.attendee_at,
    hiredAt: row.hired_at,
    contractingAt: row.contracting_at,
    rtsAt: row.rts_at,
    producingAt: row.producing_at,
    lostAt: row.lost_at,
    lostStage: null,
    lostReason: null,
    notes: null,
  };
}

// ── Recruiting Pipeline fetchers ───────────────────────────────────────────

/**
 * Fetch recruiting leads derived from recruiting_stage_transitions (source of truth).
 * Uses get_recruiting_leads RPC which joins recruiting_leads for contact info
 * and falls back to transition metadata for backfill-only contacts.
 *
 * Replaces the old approach of reading directly from recruiting_leads table.
 */
export async function fetchRecruitingLeads(filter?: RecruitingDateFilter): Promise<RecruitingLead[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  const params: Record<string, string> = {
    start_date: filter?.startDate ?? '2026-02-01T00:00:00.000Z',
  };
  if (filter?.endDate) {
    params.end_date = filter.endDate;
  }

  // Paginate — RPC can return >1K rows (currently ~1,500)
  const PAGE_SIZE = 1000;
  const allRows: RpcRecruitingLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await recruitingSb
      .rpc('get_recruiting_leads', params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.warn('[Recruiting] Leads RPC error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as RpcRecruitingLead[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows.map(mapRpcLead);
}

const EMPTY_FUNNEL: RecruitingFunnel = { leads: 0, attendees: 0, hired: 0, contracting: 0, rts: 0, producing: 0, lost: 0 };

export async function fetchRecruitingFunnel(filter?: RecruitingDateFilter): Promise<RecruitingFunnel> {
  // Use live GHL counts for the funnel — stage log provides date-accurate counts
  const ghlCounts = await fetchGhlLiveCounts(filter);
  if (ghlCounts) {
    return {
      leads: ghlCounts.leads,
      attendees: ghlCounts.attendees,
      hired: ghlCounts.hired,
      contracting: ghlCounts.contracting || 0,
      rts: ghlCounts.rts || 0,
      producing: ghlCounts.producing || 0,
      lost: ghlCounts.lost || 0,
    };
  }

  // Fallback: derive funnel from recruiting_stage_transitions via RPC
  if (!supabaseConfigured || !recruitingSb) return EMPTY_FUNNEL;

  const params: Record<string, string> = {
    start_date: filter?.startDate ?? '2026-02-01T00:00:00.000Z',
  };
  if (filter?.endDate) {
    params.end_date = filter.endDate;
  }

  const PAGE_SIZE = 1000;
  const allRows: RpcRecruitingLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await recruitingSb
      .rpc('get_recruiting_leads', params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    allRows.push(...(data as RpcRecruitingLead[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allRows.length === 0) return EMPTY_FUNNEL;

  return {
    leads: allRows.length,
    attendees: allRows.filter(r => r.attendee_at || ['attendee','hired','contracting','rts','producing'].includes(r.current_stage)).length,
    hired: allRows.filter(r => r.hired_at || ['hired','contracting','rts','producing'].includes(r.current_stage)).length,
    contracting: allRows.filter(r => r.contracting_at || ['contracting','rts','producing'].includes(r.current_stage)).length,
    rts: allRows.filter(r => r.rts_at || ['rts','producing'].includes(r.current_stage)).length,
    producing: allRows.filter(r => r.producing_at || r.current_stage === 'producing').length,
    lost: 0, // Lost contacts excluded from RPC by default
  };
}

export async function fetchStageTimings(filter?: RecruitingDateFilter): Promise<StageTiming[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  // Derive timings from recruiting_stage_transitions via RPC (same source as Leads tab)
  const params: Record<string, string> = {
    start_date: filter?.startDate ?? '2026-02-01T00:00:00.000Z',
  };
  if (filter?.endDate) {
    params.end_date = filter.endDate;
  }

  // Paginate to get all leads with their stage timestamps
  const PAGE_SIZE = 1000;
  const allRows: RpcRecruitingLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await recruitingSb
      .rpc('get_recruiting_leads', params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.warn('[Recruiting] Timings RPC error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as RpcRecruitingLead[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allRows.length === 0) return [];

  // Map RPC rows to the shape computeTimingsFromRows expects
  const rows = allRows.map(r => ({
    lead_at: r.lead_at ?? '',
    attendee_at: r.attendee_at,
    hired_at: r.hired_at,
    contracting_at: r.contracting_at,
    rts_at: r.rts_at,
    producing_at: r.producing_at,
  }));
  return computeTimingsFromRows(rows as Pick<DbRecruitingLead, 'lead_at' | 'attendee_at' | 'hired_at' | 'contracting_at' | 'rts_at' | 'producing_at'>[]);
}

// ── Campaign Performance (for Analytics tab) ───────────────────────────────

export async function fetchCampaignPerformance(campaignId: string, filter?: RecruitingDateFilter): Promise<CampaignPerformance | null> {
  if (!supabaseConfigured || !recruitingSb) return null;

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

// ── ROI: Producing agents matched to Max's production DB ─────────────────

/**
 * Fetch producing agents with their production data from Max's DB.
 * Matches recruited agents by name (case-insensitive) via the prod-data edge function.
 */
export async function fetchProducingAgents(): Promise<ProducingAgent[]> {
  if (!supabaseConfigured || !recruitingSb || !supabaseUrl || !supabaseAnonKey) return [];

  // Step 1: Get all recruited agents from the RPC
  const params = { start_date: '2026-02-01T00:00:00.000Z' };
  const PAGE_SIZE = 1000;
  const allLeads: RpcRecruitingLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await recruitingSb
      .rpc('get_recruiting_leads', params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allLeads.push(...(data as RpcRecruitingLead[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allLeads.length === 0) return [];

  // Step 2: Get names of recruited agents to match against Max's DB
  const recruitedNames = allLeads
    .map(l => l.name?.trim())
    .filter(Boolean) as string[];

  // Step 3: Call prod-data edge function with names
  const baseUrl = supabaseUrl.replace(/\/$/, '');
  let prodData: Array<{
    writing_number: string;
    agent_name: string;
    agency_wn: string;
    agency_name: string;
    total_policies: number;
    active_policies: number;
    active_ap: number;
    total_ap: number;
    first_issue_date: string | null;
    last_issue_date: string | null;
  }> = [];

  try {
    const res = await fetch(`${baseUrl}/functions/v1/prod-data?type=recruiting_roi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ names: recruitedNames }),
    });
    if (res.ok) {
      const json = await res.json();
      prodData = json.data ?? [];
    }
  } catch (err) {
    console.warn('[Recruiting] Prod-data ROI fetch error:', err);
  }

  // Step 4: Match production data back to recruited agents by name
  const prodByName = new Map<string, typeof prodData[0]>();
  for (const p of prodData) {
    prodByName.set(p.agent_name.toUpperCase().trim(), p);
  }

  const results: ProducingAgent[] = [];
  for (const lead of allLeads) {
    const nameKey = (lead.name ?? '').toUpperCase().trim();
    const prod = prodByName.get(nameKey);
    if (!prod) continue; // No production match

    results.push({
      name: lead.name ?? '',
      npn: lead.npn ?? null,
      writingNumber: prod.writing_number,
      agencyName: prod.agency_name || prod.agency_wn,
      activePolicies: Number(prod.active_policies) || 0,
      activeAp: Number(prod.active_ap) || 0,
      totalPolicies: Number(prod.total_policies) || 0,
      totalAp: Number(prod.total_ap) || 0,
      firstIssueDate: prod.first_issue_date,
      lastIssueDate: prod.last_issue_date,
      stage: (lead.current_stage ?? 'producing') as RecruitingStage,
      leadAt: lead.lead_at ?? null,
      hiredAt: lead.hired_at ?? null,
      rtsAt: lead.rts_at ?? null,
      producingAt: lead.producing_at ?? null,
    });
  }

  // Sort by active AP descending
  results.sort((a, b) => b.activeAp - a.activeAp);
  return results;
}

/**
 * Fetch ROI summary KPIs for the recruiting program.
 */
export interface RecruitingRoiSummary {
  totalSpend: number;
  totalLeads: number;
  totalHired: number;
  totalProducing: number;
  cpl: number;              // cost per lead
  cpa: number;              // cost per acquisition (hire)
  totalActivePolicies: number;
  totalActiveAp: number;
}

export async function fetchRecruitingRoiSummary(): Promise<RecruitingRoiSummary> {
  if (!supabaseConfigured || !recruitingSb) {
    return { totalSpend: 0, totalLeads: 0, totalHired: 0, totalProducing: 0, cpl: 0, cpa: 0, totalActivePolicies: 0, totalActiveAp: 0 };
  }

  // Get total spend + leads from recruiting_daily_spend
  const { data: spendRows } = await recruitingSb
    .from('recruiting_daily_spend')
    .select('spend, leads');
  const totalSpend = (spendRows ?? []).reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const totalLeads = (spendRows ?? []).reduce((s, r) => s + (Number(r.leads) || 0), 0);

  // Get hired + producing counts from GHL live counts
  const ghlCounts = await fetchGhlLiveCounts();
  const totalHired = ghlCounts?.hired ?? 0;
  const totalProducing = ghlCounts?.producing ?? 0;

  return {
    totalSpend,
    totalLeads,
    totalHired,
    totalProducing,
    cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
    cpa: totalHired > 0 ? totalSpend / totalHired : 0,
    totalActivePolicies: 0, // Populated by component from producing agents data
    totalActiveAp: 0,
  };
}

// Legacy ROI interfaces — kept for backward compat
export async function fetchRoiByAgency(): Promise<RoiByAgency[]> {
  return [];
}

export async function fetchRoiByAgent(): Promise<RoiByAgent[]> {
  return [];
}

// ── Conversion Analysis: drop-off + stall data ─────────────────────────

/**
 * Compute stage drop-off data from the recruiting leads RPC.
 */
export async function fetchStageDropoffs(filter?: RecruitingDateFilter): Promise<StageDropoff[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  const params: Record<string, string> = {
    start_date: filter?.startDate ?? '2026-02-01T00:00:00.000Z',
  };
  if (filter?.endDate) params.end_date = filter.endDate;

  const PAGE_SIZE = 1000;
  const allRows: RpcRecruitingLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await recruitingSb
      .rpc('get_recruiting_leads', params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...(data as RpcRecruitingLead[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allRows.length === 0) return [];

  const stages: { from: string; to: string; fromField: keyof RpcRecruitingLead; toField: keyof RpcRecruitingLead; fromStages: string[]; toStages: string[] }[] = [
    { from: 'Lead', to: 'Attendee', fromField: 'lead_at', toField: 'attendee_at', fromStages: ['lead','attendee','hired','contracting','rts','producing'], toStages: ['attendee','hired','contracting','rts','producing'] },
    { from: 'Attendee', to: 'Hired', fromField: 'attendee_at', toField: 'hired_at', fromStages: ['attendee','hired','contracting','rts','producing'], toStages: ['hired','contracting','rts','producing'] },
    { from: 'Hired', to: 'Contracting', fromField: 'hired_at', toField: 'contracting_at', fromStages: ['hired','contracting','rts','producing'], toStages: ['contracting','rts','producing'] },
    { from: 'Contracting', to: 'RTS', fromField: 'contracting_at', toField: 'rts_at', fromStages: ['contracting','rts','producing'], toStages: ['rts','producing'] },
    { from: 'RTS', to: 'Producing', fromField: 'rts_at', toField: 'producing_at', fromStages: ['rts','producing'], toStages: ['producing'] },
  ];

  return stages.map(s => {
    // Count entered = has timestamp for 'from' OR current_stage is at/past 'from'
    const entered = allRows.filter(r => r[s.fromField] || s.fromStages.includes(r.current_stage ?? '')).length;
    const converted = allRows.filter(r => r[s.toField] || s.toStages.includes(r.current_stage ?? '')).length;

    // Compute timing for those that have both timestamps
    const durations = allRows
      .filter(r => r[s.fromField] && r[s.toField])
      .map(r => daysBetween(r[s.fromField] as string, r[s.toField] as string))
      .filter(d => d >= 0);

    return {
      from: s.from,
      to: s.to,
      entered,
      converted,
      dropped: entered - converted,
      convRate: entered > 0 ? Math.round(converted / entered * 1000) / 10 : 0,
      avgDays: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : 0,
      medianDays: Math.round(median(durations) * 10) / 10,
    };
  });
}

/**
 * Fetch recruits stalled in a stage beyond a threshold (default 30 days).
 */
export async function fetchStalledRecruits(thresholdDays = 30, filter?: RecruitingDateFilter): Promise<StallEntry[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  const params: Record<string, string> = {
    start_date: filter?.startDate ?? '2026-02-01T00:00:00.000Z',
  };
  if (filter?.endDate) params.end_date = filter.endDate;

  const PAGE_SIZE = 1000;
  const allRows: RpcRecruitingLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await recruitingSb
      .rpc('get_recruiting_leads', params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...(data as RpcRecruitingLead[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const stageTimestampField: Record<string, keyof RpcRecruitingLead> = {
    lead: 'lead_at',
    attendee: 'attendee_at',
    hired: 'hired_at',
    contracting: 'contracting_at',
    rts: 'rts_at',
  };

  const now = Date.now();
  const results: StallEntry[] = [];

  for (const row of allRows) {
    const stage = (row.current_stage ?? 'lead') as RecruitingStage;
    if (stage === 'producing' || stage === 'lost') continue;
    const field = stageTimestampField[stage];
    if (!field || !row[field]) continue;
    const entered = new Date(row[field] as string).getTime();
    const daysInStage = Math.round((now - entered) / 86400000);
    if (daysInStage < thresholdDays) continue;

    results.push({
      name: row.name ?? '',
      email: row.email ?? null,
      stage,
      daysInStage,
      enteredStageAt: row[field] as string,
      npn: row.npn ?? null,
    });
  }

  results.sort((a, b) => b.daysInStage - a.daysInStage);
  return results;
}

// Insurance leads — original type, still used by LeadsTab
export async function fetchLeads(): Promise<Lead[]> {
  // TODO: implement live query
  return [];
}

// ── Stage Transition Log fetchers ─────────────────────────────────────────

export interface StageTransitionRow {
  id: number;
  lead_id: string | null;
  ghl_contact_id: string;
  stage: string;
  condition: string;
  previous_stage: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

/**
 * Fetch stage transitions for a specific contact or all contacts.
 * Used by CRM Command to show the full activity log.
 */
export async function fetchStageTransitions(
  ghlContactId?: string,
  filter?: RecruitingDateFilter,
  limit = 200
): Promise<StageTransitionRow[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  let query = recruitingSb
    .from('recruiting_stage_transitions')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (ghlContactId) {
    query = query.eq('ghl_contact_id', ghlContactId);
  }
  if (filter) {
    query = query
      .gte('occurred_at', filter.startDate)
      .lt('occurred_at', filter.endDate);
  }

  const { data, error } = await query;
  if (error || !data?.length) return [];
  return data as StageTransitionRow[];
}

// ── Backfill Log fetchers ───────────────────────────────────────────────

export interface BackfillLogRow {
  id: number;
  title: string;
  description: string;
  backfill_type: string;
  status: string;
  stats: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * Fetch backfill log entries for CRM Command "FYM APP Backfill" section.
 */
export async function fetchBackfillLog(): Promise<BackfillLogRow[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  const { data, error } = await recruitingSb
    .from('recruiting_backfill_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];
  return data as BackfillLogRow[];
}

// ── Lost Settings fetchers ──────────────────────────────────────────────

export interface LostSettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  updated_at: string;
}

/**
 * Fetch Lost threshold settings.
 */
export async function fetchLostSettings(): Promise<LostSettingRow[]> {
  if (!supabaseConfigured || !recruitingSb) return [];

  const { data, error } = await recruitingSb
    .from('recruiting_lost_settings')
    .select('*')
    .order('setting_key');

  if (error || !data?.length) return [];
  return data as LostSettingRow[];
}

/**
 * Update a Lost setting (e.g., threshold days).
 * Requires service role or admin auth.
 */
export async function updateLostSetting(
  settingKey: string,
  settingValue: string
): Promise<boolean> {
  if (!supabaseConfigured || !recruitingSb) return false;

  const { error } = await recruitingSb
    .from('recruiting_lost_settings')
    .upsert(
      {
        setting_key: settingKey,
        setting_value: settingValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'setting_key' }
    );

  if (error) {
    console.warn('[Recruiting] Lost setting update failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Trigger the check-lost action on the edge function.
 * Returns the number of contacts flagged as lost.
 */
export async function triggerCheckLost(): Promise<{ flagged: number; thresholdDays: number } | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/functions/v1/recruiting-ghl-sync?action=check-lost`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
        'x-cron-auth': 'dashboard',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'check-lost' }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[Recruiting] Check-lost error:', err);
    return null;
  }
}

// ── Compute helpers ────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
