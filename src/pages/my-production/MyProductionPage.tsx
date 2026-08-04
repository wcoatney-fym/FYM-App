/**
 * My Production Page (P10) — Agent's full production read
 *
 * Three tabs: Volume / Quality / Policies
 * - Volume: total apps, AP trend, product family breakdown, daily sparkline
 * - Quality: full 8-metric tile grid (P7 priority order), retention gauge, at-risk breakdown
 * - Policies: searchable/filterable/sortable policy table with CSV export
 *
 * Data: edge functions (prod-data, book-of-business) scoped to effectiveWritingNumber.
 * PeriodPills (P9) for time-period selection.
 *
 * Route: /my-production
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { PeriodPills } from '@/components/filters/PeriodPills';
import { usePeriodCompare } from '@/hooks/usePeriodCompare';
import { supabase } from '@/lib/supabase';
import {
  getGranularity,
  bucketKey,
  fmtBucketLabel,
} from '@/lib/dateUtils';
import {
  DollarSign,
  FileText,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { VolumeTab } from './tabs/VolumeTab';
import { QualityTab } from './tabs/QualityTab';
import { PoliciesTab } from './tabs/PoliciesTab';
import type { AgentStats, PolicyRow, TrendPoint, ProductMix } from './types';
import { fmt$, fmtNum, retentionColor, retentionBg } from './helpers';

// ── Component ──────────────────────────────────────────────────────────────
export function MyProductionPage() {
  const { effectiveWritingNumber, profile } = useEffectiveAuth();

  const period = usePeriodCompare({ storageKey: 'my-production' });

  const [stats, setStats] = useState<AgentStats | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('volume');

  const agentName = profile?.full_name || 'Agent';
  const firstName = agentName.split(' ')[0];

  const loadData = useCallback(async () => {
    if (!effectiveWritingNumber || !supabase) return;
    setLoading(true);
    setError(null);

    const startDate = period.dateRange.startDate.split('T')[0];
    const endDate = period.dateRange.endDate.split('T')[0];
    const useRpc = period.preset !== 'allTime';

    try {
      // ── Agent stats ──
      let agentStats: AgentStats | null = null;
      if (useRpc) {
        const { data: rpcData } = await supabase.rpc('filtered_agent_production', {
          start_date: startDate,
          end_date: endDate,
        });
        const match = ((rpcData || []) as unknown as AgentStats[]).find(
          r => r.agent_id === effectiveWritingNumber || r.writing_number === effectiveWritingNumber
        );
        agentStats = match || null;
      } else {
        const { data: agentData } = await supabase
          .from('agent_production')
          .select('*')
          .eq('agent_id', effectiveWritingNumber!)
          .single();
        agentStats = agentData as unknown as AgentStats | null;
      }
      setStats(agentStats);

      // ── Policies — paginate ──
      const allPolicies: PolicyRow[] = [];
      const PAGE = 1000;
      let offset = 0;
      let done = false;
      while (!done) {
        let q = supabase
          .from('book_of_business')
          .select('policy_number, product_type, status, monthly_premium, annual_premium, policy_effective_date, paid_to_date, draft_count, is_at_risk, flag_type, days_since_paid')
          .eq('agent_id', effectiveWritingNumber!)
          .order('policy_effective_date', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (useRpc) {
          q = q.gte('policy_effective_date', startDate).lt('policy_effective_date', endDate);
        }
        const { data: policyData } = await q;
        if (!policyData || policyData.length === 0) { done = true; break; }
        allPolicies.push(...(policyData as unknown as PolicyRow[]));
        if (policyData.length < PAGE) done = true;
        else offset += PAGE;
      }
      setPolicies(allPolicies);

      // ── Trend — daily from policy_cache ──
      let trendQuery = supabase
        .from('policy_cache')
        .select('policy_effective_date, plan_premium, product_type')
        .eq('agent_id', effectiveWritingNumber!)
        .not('policy_effective_date', 'is', null);
      if (useRpc) {
        trendQuery = trendQuery.gte('policy_effective_date', startDate).lt('policy_effective_date', endDate);
      }
      const { data: cacheRows } = await trendQuery;

      const gran = getGranularity(period.dateRange);
      const byBucket = new Map<string, { policies: number; ap: number }>();
      (cacheRows || []).forEach((r: any) => {
        if (!r.policy_effective_date) return;
        const key = bucketKey(r.policy_effective_date, gran);
        const existing = byBucket.get(key) || { policies: 0, ap: 0 };
        existing.policies += 1;
        existing.ap += (Number(r.plan_premium) || 0) * 12;
        byBucket.set(key, existing);
      });
      setTrend(
        Array.from(byBucket.entries())
          .map(([bucket, v]) => ({
            bucket,
            label: fmtBucketLabel(bucket, gran),
            policies: v.policies,
            ap: v.ap,
          }))
          .sort((a, b) => a.bucket.localeCompare(b.bucket))
      );
    } catch (err) {
      console.error('MyProduction load error:', err);
      setError('Failed to load your production data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [effectiveWritingNumber, period.dateRange, period.preset]);

  useEffect(() => { loadData(); }, [loadData]);

  // Product mix from policies
  const productMix: ProductMix[] = useMemo(() => {
    const mixMap = new Map<string, number>();
    policies
      .filter(p => p.status === 'active')
      .forEach(p => { mixMap.set(p.product_type, (mixMap.get(p.product_type) || 0) + 1); });
    return Array.from(mixMap.entries()).map(([product_type, count]) => ({ product_type, count }));
  }, [policies]);

  // ── Loading state ──
  if (loading) {
    return (
      <>
        <Header title="My Production" />
        <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <>
        <Header title="My Production" />
        <div className="p-6">
          <Card className="border-red-500/30">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={loadData}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // ── No data state ──
  if (!stats) {
    return (
      <>
        <Header title="My Production" />
        <div className="p-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No production data found for your writing number.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Writing number: {effectiveWritingNumber || 'not set'}
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const retPct = stats.retention_pct !== null ? Number(stats.retention_pct) : null;

  return (
    <>
      <Header title="My Production" />
      <div className="p-6 space-y-5 max-w-screen-xl mx-auto">
        <StaggerContainer>

          {/* ── Header row: welcome + PeriodPills ── */}
          <StaggerItem>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">
                  {firstName}'s Production
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {effectiveWritingNumber} · Full production detail
                </p>
              </div>
              <PeriodPills {...period.pillProps} storageKey="my-production" />
            </div>
          </StaggerItem>

          {/* ── Hero KPI strip ── */}
          <StaggerItem>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* MTD AP — hero gradient */}
              <div className="relative overflow-hidden rounded-lg border border-border p-4 bg-gradient-to-br from-[hsl(217,33%,12%)] to-[hsl(222,47%,9%)]">
                <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/5 rounded-bl-full" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {period.preset === 'thisMonth' ? 'MTD' : period.dateRange.label} AP
                </p>
                <CountUp
                  end={Number(stats.ap_this_month || 0)}
                  format={fmt$}
                  className="text-2xl font-bold mt-1 block text-foreground"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {fmtNum(stats.policies_this_month || 0)} apps
                </p>
                <DollarSign size={14} className="absolute top-3 right-3 text-cyan-500/30" />
              </div>

              {/* Active Policies */}
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active Policies</p>
                      <CountUp
                        end={stats.active_policies}
                        format={fmtNum}
                        className="text-2xl font-bold mt-1 block text-foreground"
                      />
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {fmtNum(stats.total_policies)} total
                      </p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-cyan-500/10">
                      <FileText size={14} className="text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 90d Retention */}
              <Card className={`border-border ${retentionBg(retPct)}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">90d Retention</p>
                      <CountUp
                        end={retPct ?? 0}
                        format={(n: number) => retPct !== null ? `${n.toFixed(1)}%` : '—'}
                        className={`text-2xl font-bold mt-1 block ${retentionColor(retPct)}`}
                      />
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {stats.ever_drafted > 0 ? `${stats.retained_policies}/${stats.ever_drafted}` : 'No drafts'}
                      </p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                      <ShieldCheck size={14} className={retentionColor(retPct)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* At Risk */}
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Needs Attention</p>
                      <CountUp
                        end={stats.at_risk_policies}
                        format={fmtNum}
                        className={`text-2xl font-bold mt-1 block ${stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}
                      />
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {stats.terminated_policies} terminated
                      </p>
                    </div>
                    <div className={`p-1.5 rounded-lg ${stats.at_risk_policies > 0 ? 'bg-red-500/10' : 'bg-secondary'}`}>
                      <AlertTriangle size={14} className={stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground/40'} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </StaggerItem>

          {/* ── Tabs: Volume / Quality / Policies ── */}
          <StaggerItem>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="bg-secondary/50 border border-border/30 p-1">
                <TabsTrigger value="volume" className="text-xs gap-1.5">
                  <TrendingUp size={14} /> Volume
                </TabsTrigger>
                <TabsTrigger value="quality" className="text-xs gap-1.5">
                  <ShieldCheck size={14} /> Quality
                </TabsTrigger>
                <TabsTrigger value="policies" className="text-xs gap-1.5">
                  <BarChart3 size={14} /> Policies
                </TabsTrigger>
              </TabsList>

              <TabsContent value="volume">
                <VolumeTab
                  stats={stats}
                  trend={trend}
                  productMix={productMix}
                  dateRange={period.dateRange}
                />
              </TabsContent>

              <TabsContent value="quality">
                <QualityTab stats={stats} policies={policies} />
              </TabsContent>

              <TabsContent value="policies">
                <PoliciesTab
                  policies={policies}
                  writingNumber={effectiveWritingNumber}
                />
              </TabsContent>
            </Tabs>
          </StaggerItem>

        </StaggerContainer>
      </div>
    </>
  );
}
