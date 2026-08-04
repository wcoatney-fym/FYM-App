/**
 * meta-ads-sync — Sync Meta Marketing API data into recruiting tables
 *
 * Pulls campaigns, ad sets, and daily spend from Meta's Marketing API
 * and upserts into recruiting_campaigns, recruiting_ad_sets, and
 * recruiting_daily_spend tables.
 *
 * Designed to run on a cron (daily) or be triggered manually.
 *
 * Required env vars (Supabase edge function secrets):
 *   META_ADS_ACCOUNT_ID  — numeric ad account ID
 *   META_ACCESS_TOKEN    — system user access token with ads_read scope
 *   APP_SUPABASE_URL     — rcbzag Supabase URL
 *   APP_SUPABASE_SERVICE_KEY — service role key for writes
 *
 * Query params:
 *   days: number of days to sync (default 90, max 365)
 *   campaign_id: optional — sync only one campaign
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

// Lead action types we count (Meta uses different names depending on campaign type)
const LEAD_ACTION_TYPES = new Set([
  "lead",
  "onsite_web_lead",
  "offsite_complete_registration_add_meta_leads",
]);

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  spend: string;
  impressions: string;
  clicks: string;
  cpc?: string;
  ctr?: string;
  actions?: MetaAction[];
  date_start?: string;
  date_stop?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

function extractLeads(actions?: MetaAction[]): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (LEAD_ACTION_TYPES.has(a.action_type)) {
      total += parseInt(a.value, 10) || 0;
    }
  }
  return total;
}

function dateRange(days: number): { since: string; until: string } {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return {
    since: since.toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
  };
}

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  token: string
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${GRAPH_BASE}/${path}`;
  const searchParams = new URLSearchParams({ ...params, access_token: token, limit: "500" });

  while (url) {
    const fullUrl = url.includes("?") ? url : `${url}?${searchParams.toString()}`;
    const res = await fetch(fullUrl);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta API ${res.status}: ${err}`);
    }
    const json = await res.json();
    if (json.data) results.push(...json.data);
    url = json.paging?.next ?? null;
  }

  return results;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
    },
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
      },
    });
  }

  try {
    const accountId = getEnvOrThrow("META_ADS_ACCOUNT_ID");
    const token = getEnvOrThrow("META_ACCESS_TOKEN");
    const supabaseUrl = getEnvOrThrow("APP_SUPABASE_URL");
    const serviceKey = getEnvOrThrow("APP_SUPABASE_SERVICE_KEY");

    const url = new URL(req.url);
    const days = Math.min(parseInt(url.searchParams.get("days") ?? String(DEFAULT_DAYS), 10), MAX_DAYS);
    const campaignFilter = url.searchParams.get("campaign_id");
    const { since, until } = dateRange(days);

    const sb = createClient(supabaseUrl, serviceKey);

    // ── 1. Fetch & upsert campaigns ─────────────────────────────────────
    const campaigns = await graphGet<MetaCampaign>(
      `act_${accountId}/campaigns`,
      { fields: "name,status,objective,daily_budget,lifetime_budget,start_time,stop_time" },
      token
    );

    const campaignRows = campaigns
      .filter((c) => !campaignFilter || c.id === campaignFilter)
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective ?? null,
        daily_budget_cents: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
        lifetime_budget_cents: c.lifetime_budget ? parseInt(c.lifetime_budget, 10) : null,
        start_time: c.start_time ?? null,
        stop_time: c.stop_time ?? null,
        synced_at: new Date().toISOString(),
      }));

    if (campaignRows.length > 0) {
      const { error: campErr } = await sb
        .from("recruiting_campaigns")
        .upsert(campaignRows, { onConflict: "id" });
      if (campErr) throw new Error(`Campaign upsert failed: ${campErr.message}`);
    }

    // ── 2. Fetch campaign-level insights & update aggregates ────────────
    const campaignIds = campaignRows.map((c) => c.id);
    const timeRange = JSON.stringify({ since, until });

    const campaignInsights = await graphGet<MetaInsightRow>(
      `act_${accountId}/insights`,
      {
        fields: "campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr,actions",
        time_range: timeRange,
        level: "campaign",
      },
      token
    );

    for (const ins of campaignInsights) {
      if (!ins.campaign_id || (campaignFilter && ins.campaign_id !== campaignFilter)) continue;
      const leads = extractLeads(ins.actions);
      const spend = parseFloat(ins.spend) || 0;

      const { error: updErr } = await sb
        .from("recruiting_campaigns")
        .update({
          total_spend: spend,
          total_impressions: parseInt(ins.impressions, 10) || 0,
          total_clicks: parseInt(ins.clicks, 10) || 0,
          total_leads: leads,
          cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
          ctr: ins.ctr ? parseFloat(ins.ctr) : null,
          cpc: ins.cpc ? parseFloat(ins.cpc) : null,
          synced_at: new Date().toISOString(),
        })
        .eq("id", ins.campaign_id);
      if (updErr) console.error(`Campaign insight update failed for ${ins.campaign_id}: ${updErr.message}`);
    }

    // ── 3. Fetch & upsert ad sets ───────────────────────────────────────
    const adSetInsights = await graphGet<MetaInsightRow>(
      `act_${accountId}/insights`,
      {
        fields: "campaign_id,adset_id,adset_name,spend,impressions,clicks,ctr,actions",
        time_range: timeRange,
        level: "adset",
      },
      token
    );

    const adSetRows = adSetInsights
      .filter((a) => a.adset_id && (!campaignFilter || a.campaign_id === campaignFilter))
      .map((a) => {
        const leads = extractLeads(a.actions);
        const spend = parseFloat(a.spend) || 0;
        return {
          id: a.adset_id!,
          campaign_id: a.campaign_id!,
          name: a.adset_name ?? "Unknown",
          status: "ACTIVE", // Meta insights only returns ad sets with data
          total_spend: spend,
          total_impressions: parseInt(a.impressions, 10) || 0,
          total_clicks: parseInt(a.clicks, 10) || 0,
          total_leads: leads,
          cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
          ctr: a.ctr ? parseFloat(a.ctr) : null,
          synced_at: new Date().toISOString(),
        };
      });

    if (adSetRows.length > 0) {
      const { error: asErr } = await sb
        .from("recruiting_ad_sets")
        .upsert(adSetRows, { onConflict: "id" });
      if (asErr) throw new Error(`Ad set upsert failed: ${asErr.message}`);
    }

    // ── 4. Fetch & upsert daily spend ───────────────────────────────────
    const dailyInsights = await graphGet<MetaInsightRow>(
      `act_${accountId}/insights`,
      {
        fields: "campaign_id,spend,impressions,clicks,actions",
        time_range: timeRange,
        time_increment: "1",
        level: "campaign",
      },
      token
    );

    const dailyRows = dailyInsights
      .filter((d) => d.campaign_id && d.date_start && (!campaignFilter || d.campaign_id === campaignFilter))
      .map((d) => {
        const leads = extractLeads(d.actions);
        const spend = parseFloat(d.spend) || 0;
        return {
          campaign_id: d.campaign_id!,
          date: d.date_start!,
          spend,
          impressions: parseInt(d.impressions, 10) || 0,
          clicks: parseInt(d.clicks, 10) || 0,
          leads,
          cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
        };
      });

    // Upsert daily rows in batches of 100
    const BATCH_SIZE = 100;
    let dailyUpserted = 0;
    for (let i = 0; i < dailyRows.length; i += BATCH_SIZE) {
      const batch = dailyRows.slice(i, i + BATCH_SIZE);
      const { error: dayErr } = await sb
        .from("recruiting_daily_spend")
        .upsert(batch, { onConflict: "campaign_id,date", ignoreDuplicates: false });
      if (dayErr) console.error(`Daily spend batch ${i} failed: ${dayErr.message}`);
      else dailyUpserted += batch.length;
    }

    // ── 5. Response ─────────────────────────────────────────────────────
    return jsonResponse({
      ok: true,
      synced_at: new Date().toISOString(),
      range: { since, until },
      campaigns: campaignRows.length,
      campaign_insights: campaignInsights.length,
      ad_sets: adSetRows.length,
      daily_rows: dailyUpserted,
    });
  } catch (err) {
    console.error("meta-ads-sync error:", err);
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
