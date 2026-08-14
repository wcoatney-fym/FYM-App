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
import {
  fetchAgentProduction,
  fetchBookOfBusiness,
  fetchMonthlyProduction,
  type MonthlyProduction,
} from '@/lib/prod-api';
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
    if (!effectiveWritingNumber) return;
    setLoading(true);
    setError(null);

    const startDate = period.dateRange.startDate.split('T')[0];
    const endDate = period.dateRange.endDate.split('T')[0];
    const useDateFilter = period.preset !== 'allTime';

    try {
      // ── Agent stats via edge function ──
      const agentParams: { agent_id: string; start_date?: string; end_date?: string } = {
        agent_id: effectiveWritingNumber,
      };
      if (useDateFilter) {
        agentParams.start_date = startDate;
        agentParams.end_date = endDate;
      }
      const agentRows = await fetchAgentProduction(agentParams);
      const match = agentRows.find(
        (r) => r.agent_id === effectiveWritingNumber || r.writing_number === effectiveWritingNumber
      );
      const agentStats: AgentStats | null = match
        ? {
            agent_id: match.agent_id,
            agent_name: match.agent_name,
            writing_number: match.writing_number,
            agency_id: match.agency_id,
            agency_name: null,
            total_policies: match.total_policies,
            active_policies: match.active_policies,
            terminated_policies: match.terminated_policies,
            pending_policies: match.pending_policies,
            at_risk_policies: match.at_risk_policies,
            active_monthly_premium: match.active_monthly_premium,
            active_annual_premium: match.active_annual_premium,
            avg_annual_premium: match.avg_annual_premium,
            policies_this_month: match.policies_this_month,
            ap_this_month: match.ap_this_month,
            retained_policies: match.retained_policies,
            ever_drafted: match.ever_drafted,
            retention_pct: match.retention_pct,
          }
        : null;
      setStats(agentStats);

      // ── Policies via book-of-business edge function ──
      const allPolicies: PolicyRow[] = [];
      const PAGE_SIZE = 500;
      let page = 1;
      let done = false;
      while (!done) {
        const bobRes = await fetchBookOfBusiness({
          agent_wn: effectiveWritingNumber,
          page,
          page_size: PAGE_SIZE,
        });
        const mapped = (bobRes.data || []).map((p) => ({
          policy_number: p.policy_number,
          product_type: p.product_type,
          status: p.status,
          monthly_premium: p.plan_premium ?? 0,
          annual_premium: p.annual_premium ?? 0,
          policy_effective_date: p.policy_effective_date,
          paid_to_date: p.paid_to_date,
          draft_count: p.draft_count ?? 0,
          is_at_risk: p.is_at_risk ?? false,
          flag_type: p.flag_type,
          days_since_paid: null as number | null,
        }));
        // Date-filter client-side when a period is active
        const filtered = useDateFilter
          ? mapped.filter((p) => {
              if (!p.policy_effective_date) return false;
              return p.policy_effective_date >= startDate && p.policy_effective_date < endDate;
            })
          : mapped;
        allPolicies.push(...filtered);
        if (page >= (bobRes.pagination?.total_pages || 1)) done = true;
        else page++;
      }
      setPolicies(allPolicies);

      // ── Trend via monthly edge function ──
      const monthlyParams: { agent_id: string; start_date?: string; end_date?: string } = {
        agent_id: effectiveWritingNumber,
      };
      if (useDateFilter) {
        monthlyParams.start_date = startDate;
        monthlyParams.end_date = endDate;
      }
      const monthlyRows = await fetchMonthlyProduction(monthlyParams);
      const gran = getGranularity(period.dateRange);
      // For monthly edge fn data, bucket by month
      const byBucket = new Map<string, { policies: number; ap: number }>();
      monthlyRows.forEach((r: MonthlyProduction) => {
        if (!r.month) return;
        const key = bucketKey(r.month + '-01', gran);
        const existing = byBucket.get(key) || { policies: 0, ap: 0 };
        existing.policies += r.policies;
        existing.ap += r.annual_premium;
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
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No production data found for your writing number.</p>
              <p className="text-xs text-muted-foreground mt-1">
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
                <p className="text-[10px] text-muted-foreground mt-0.5">
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
                      <p className="text-[10px] text-muted-foreground mt-0.5">
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
                      <p className="text-[10px] text-muted-foreground mt-0.5">
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
                        className={`text-2xl font-bold mt-1 block ${stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground'}`}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {stats.terminated_policies} terminated
                      </p>
                    </div>
                    <div className={`p-1.5 rounded-lg ${stats.at_risk_policies > 0 ? 'bg-red-500/10' : 'bg-secondary'}`}>
                      <AlertTriangle size={14} className={stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground'} />
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
