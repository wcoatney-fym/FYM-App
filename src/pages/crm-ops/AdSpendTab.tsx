/**
 * CRM Ops — Ad Spend Tab
 *
 * Shows ALL campaigns (recruiting + insurance lead campaigns) with full KPIs,
 * spend/leads trend, campaign table, and a feed_recruiting toggle per campaign.
 *
 * The toggle controls which campaigns are visible in the Recruiting tab.
 * Data source: recruiting_campaigns, recruiting_daily_spend, recruiting_ad_sets
 * in rcbzag (same tables the Recruiting tab reads from).
 */
import { useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import {
  DollarSign, Users, Target, BarChart3, Activity,
  Megaphone, Loader2,
} from 'lucide-react';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';
import { supabaseConfigured } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useCachedMultiFetch } from '@/hooks/useCachedFetch';
import type { Campaign, CampaignStatus, DailySpend, RecruitingDateFilter } from '@/lib/recruiting/types';

// Untyped client for recruiting tables (not in Database types).
// Auth session is shared via localStorage with the main typed client,
// so RLS policies for authenticated users apply to reads AND writes.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const sb = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ── Extended campaign type with feed_recruiting flag ───────────────────────
interface AdSpendCampaign extends Campaign {
  feed_recruiting: boolean;
}

// ── DB row type ────────────────────────────────────────────────────────────
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

interface DbDailySpend {
  campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
}

// ── Mappers ────────────────────────────────────────────────────────────────
function mapStatus(metaStatus: string): CampaignStatus {
  const m: Record<string, CampaignStatus> = {
    ACTIVE: 'active', PAUSED: 'paused', DELETED: 'completed', ARCHIVED: 'completed',
  };
  return m[metaStatus] ?? 'draft';
}

function mapCampaign(row: DbCampaign): AdSpendCampaign {
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
    feed_recruiting: row.feed_recruiting ?? false,
  };
}

function mapDailySpend(row: DbDailySpend): DailySpend {
  const spend = Number(row.spend) || 0;
  const leads = Number(row.leads) || 0;
  return { date: row.date, spend, leads, cpl: leads > 0 ? spend / leads : 0 };
}

// ── Fetchers (all campaigns, no feed_recruiting filter) ────────────────────
async function fetchAllCampaigns(): Promise<AdSpendCampaign[]> {
  if (!supabaseConfigured || !sb) return [];
  const { data, error } = await sb
    .from('recruiting_campaigns')
    .select('*')
    .order('synced_at', { ascending: false });
  if (error || !data?.length) return [];
  return (data as DbCampaign[]).map(mapCampaign);
}

async function fetchAllDailySpend(filter?: RecruitingDateFilter): Promise<DailySpend[]> {
  if (!supabaseConfigured || !sb) return [];
  let query = sb.from('recruiting_daily_spend').select('*').order('date', { ascending: true });
  if (filter) {
    query = query.gte('date', filter.startDate.slice(0, 10)).lt('date', filter.endDate.slice(0, 10));
  }
  const { data, error } = await query;
  if (error || !data?.length) return [];
  return (data as DbDailySpend[]).map(mapDailySpend);
}

// ── Toggle handler ─────────────────────────────────────────────────────────
async function toggleFeedRecruiting(campaignId: string, value: boolean): Promise<boolean> {
  if (!sb) return false;
  const { error } = await sb
    .from('recruiting_campaigns')
    .update({ feed_recruiting: value })
    .eq('id', campaignId);
  return !error;
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, prefix, suffix, icon: Icon }: {
  label: string; value: number; prefix?: string; suffix?: string; icon: React.ElementType;
}) {
  return (
    <Card className="bg-card/60 border-border/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold tracking-tight">
              {prefix}<CountUp end={value} decimals={prefix === '$' ? 0 : 0} />{suffix}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-[hsl(199,89%,48%)]/10 border border-[hsl(199,89%,48%)]/20">
            <Icon size={18} className="text-[hsl(199,89%,48%)]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    paused: { label: 'Paused', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    completed: { label: 'Completed', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    draft: { label: 'Draft', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  };
  const { label, className } = map[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

// ── Main Component ─────────────────────────────────────────────────────────
export function AdSpendTab() {
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const dateFilter: RecruitingDateFilter = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange]);

  const cacheKey = `adspend-all-${datePreset}-${dateRange.startDate.slice(0, 10)}-${refreshKey}`;

  const { data: multiData, loading } = useCachedMultiFetch(cacheKey, {
    campaigns: () => fetchAllCampaigns(),
    dailySpend: () => fetchAllDailySpend(dateFilter),
  }, { deps: [datePreset, dateRange.startDate, dateRange.endDate, refreshKey] });

  const campaigns: AdSpendCampaign[] = useMemo(() => {
    const raw = multiData?.campaigns ?? [];
    // Apply local overrides for optimistic UI
    return raw.map(c => ({
      ...c,
      feed_recruiting: localOverrides[c.id] !== undefined ? localOverrides[c.id] : c.feed_recruiting,
    }));
  }, [multiData?.campaigns, localOverrides]);

  const dailySpend = multiData?.dailySpend ?? [];

  // ── KPIs (all campaigns, no filter) ────────────────────────────────────
  const kpis = useMemo(() => {
    const totalSpend = campaigns.reduce((s, c) => s + c.totalSpend, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.totalLeads, 0);
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const recruitingCount = campaigns.filter(c => c.feed_recruiting).length;
    return {
      totalSpend,
      totalLeads,
      cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      activeCampaigns,
      recruitingCount,
    };
  }, [campaigns]);

  // ── Sort ───────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<keyof Campaign | 'feed_recruiting'>('totalSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      if (sortKey === 'feed_recruiting') {
        const av = a.feed_recruiting ? 1 : 0;
        const bv = b.feed_recruiting ? 1 : 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const av = a[sortKey as keyof Campaign];
      const bv = b[sortKey as keyof Campaign];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return 0;
    });
  }, [campaigns, sortKey, sortDir]);

  function toggleSort(key: keyof Campaign | 'feed_recruiting') {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const SortArrow = ({ col }: { col: keyof Campaign | 'feed_recruiting' }) =>
    sortKey === col ? <span className="ml-1 text-[hsl(199,89%,48%)]">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  const chartData = useMemo(() =>
    dailySpend.map(d => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })), [dailySpend]);

  const isLive = Boolean(multiData?.campaigns && campaigns.some(c => c.totalSpend > 0));

  const handleToggle = useCallback(async (campaignId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    // Optimistic update
    setLocalOverrides(prev => ({ ...prev, [campaignId]: newValue }));
    setTogglingIds(prev => new Set(prev).add(campaignId));

    const success = await toggleFeedRecruiting(campaignId, newValue);

    setTogglingIds(prev => {
      const next = new Set(prev);
      next.delete(campaignId);
      return next;
    });

    if (!success) {
      // Revert on failure
      setLocalOverrides(prev => {
        const next = { ...prev };
        delete next[campaignId];
        return next;
      });
    } else {
      // Clear override and refresh from server
      setLocalOverrides(prev => {
        const next = { ...prev };
        delete next[campaignId];
        return next;
      });
      setRefreshKey(k => k + 1);
    }
  }, []);

  function handleDateChange(range: DateRange, preset: DatePreset) {
    setDateRange(range);
    setDatePreset(preset);
  }

  return (
    <div className="space-y-6">
      {/* Header with date selector */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Toggle *Feed Recruiting* to control which campaigns appear in the Recruiting tab
          </p>
        </div>
        <TimePeriodSelector preset={datePreset} dateRange={dateRange} onChange={handleDateChange} />
      </div>

      {/* Data source banner */}
      {!isLive && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <Activity size={14} />
          <span>Displaying sample data — connect Meta Ads API to see live campaign metrics</span>
        </div>
      )}

      {/* KPIs */}
      <StaggerContainer className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StaggerItem><KpiCard label="Total Spend" value={kpis.totalSpend} prefix="$" icon={DollarSign} /></StaggerItem>
        <StaggerItem><KpiCard label="Total Leads" value={kpis.totalLeads} icon={Users} /></StaggerItem>
        <StaggerItem><KpiCard label="Avg CPL" value={kpis.cpl} prefix="$" icon={Target} /></StaggerItem>
        <StaggerItem><KpiCard label="Active Campaigns" value={kpis.activeCampaigns} icon={BarChart3} /></StaggerItem>
        <StaggerItem><KpiCard label="Feeding Recruiting" value={kpis.recruitingCount} icon={Megaphone} /></StaggerItem>
      </StaggerContainer>

      {/* Spend vs Leads trend */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
              Spend vs Leads — All Campaigns
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={4} />
                  <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                  <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [name === 'spend' ? `$${value.toFixed(2)}` : value, name === 'spend' ? 'Spend' : 'Leads']}
                  />
                  <Legend />
                  <Bar yAxisId="leads" dataKey="leads" name="Leads" fill="hsl(199,89%,48%)" opacity={0.4} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="spend" dataKey="spend" name="Spend" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </HudFrame>

      {/* Campaign Table with feed_recruiting toggle */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30 overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading campaigns…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Campaign</th>
                      <th className="text-center px-3 py-3">Status</th>
                      <th
                        className="text-center px-3 py-3 cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('feed_recruiting')}
                      >
                        Feed Recruiting<SortArrow col="feed_recruiting" />
                      </th>
                      <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('totalSpend')}>
                        Spend<SortArrow col="totalSpend" />
                      </th>
                      <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('totalLeads')}>
                        Leads<SortArrow col="totalLeads" />
                      </th>
                      <th className="text-right px-3 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('cpl')}>
                        CPL<SortArrow col="cpl" />
                      </th>
                      <th className="text-right px-4 py-3">Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(c => (
                      <tr key={c.id} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.startDate ? new Date(c.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                            {c.endDate ? ` — ${new Date(c.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ' — ongoing'}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-center"><StatusBadge status={c.status} /></td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={c.feed_recruiting}
                              onCheckedChange={() => handleToggle(c.id, c.feed_recruiting)}
                              disabled={togglingIds.has(c.id)}
                              className="data-[state=checked]:bg-emerald-500"
                            />
                            {togglingIds.has(c.id) && (
                              <Loader2 size={12} className="animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">${c.totalSpend.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono">{c.totalLeads}</td>
                        <td className="px-3 py-3 text-right font-mono">${c.cpl.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-muted-foreground capitalize">{c.platform}</span>
                        </td>
                      </tr>
                    ))}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          No campaigns found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </HudFrame>
    </div>
  );
}
