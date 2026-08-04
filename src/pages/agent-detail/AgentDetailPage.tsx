/**
 * Agent Detail Page — PRD §11 (Phase 2B Agency Manager)
 *
 * First-class drill-down destination for any individual agent.
 * Hero strip (avatar, name, WN, MTD AP, goal %, retention, apps) + 4 tabs.
 * Reachable from: Team Table, Leaderboard, Needs Attention, Production.
 *
 * Route: /production/:agencyId/agent/:agentId
 *
 * Back navigation is context-aware: returns to wherever the user came from
 * with the right sub-tab restored (§11.6).
 */
import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  ArrowLeft, DollarSign, FileText, ShieldCheck,
  TrendingUp, AlertTriangle, Users,
} from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { VolumeTab } from './tabs/VolumeTab';
import { QualityTab } from './tabs/QualityTab';
import { PoliciesTab } from './tabs/PoliciesTab';
import type { AgentStats, PolicyRow, TrendPoint } from './types';
import { fmt$, fmtNum, retentionColor, retentionBg } from './helpers';
import { PeriodPills } from '@/components/filters/PeriodPills';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange, getGranularity, bucketKey, fmtBucketLabel } from '@/lib/dateUtils';

// ── Resolve back-navigation label from referrer ────────────────────────────
function resolveBackLabel(pathname: string): string {
  if (pathname.includes('/my-team')) return 'My Team';
  if (pathname.includes('/quality/at-risk') || pathname.includes('/at-risk')) return 'Needs Attention';
  if (pathname.includes('/quality')) return 'Quality';
  if (pathname.includes('/leaderboard')) return 'Leaderboard';
  if (pathname.includes('/production')) return 'Production';
  if (pathname.includes('/workboard')) return 'Workboard';
  return 'Back';
}

// ── Avatar color from name hash ────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-indigo-600',
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────────────
export function AgentDetailPage() {
  const { agencyId, agentId } = useParams<{ agencyId: string; agentId: string }>();
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Context-aware tab selection (§13.6)
  const defaultTab = searchParams.get('tab') || 'overview';

  const [stats, setStats] = useState<AgentStats | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Back navigation (§11.6)
  const backPath = useMemo(() => {
    // If we came from a specific page, use referrer state
    const from = (location.state as any)?.from;
    if (from) return from;
    // Fallback: go to agency production page or production index
    return agencyId ? `/production/${agencyId}` : '/production';
  }, [location.state, agencyId]);

  const backLabel = useMemo(() => {
    const from = (location.state as any)?.from;
    if (from) return resolveBackLabel(from);
    return stats?.agency_name || 'Production';
  }, [location.state, stats?.agency_name]);

  // ── Data loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!agentId || !supabase) return;

    async function load() {
      setLoading(true);
      if (!supabase) { setLoading(false); return; }

      try {
        const startDate = dateRange.startDate.split('T')[0];
        const endDate = dateRange.endDate.split('T')[0];
        const useRpc = datePreset !== 'allTime';

        // Agent stats
        if (useRpc) {
          const { data: rpcData } = await supabase.rpc('filtered_agent_production', {
            start_date: startDate,
            end_date: endDate,
          });
          const match = ((rpcData || []) as unknown as AgentStats[]).find(r => r.agent_id === agentId);
          if (match) setStats(match);
          else setStats(null);
        } else {
          const { data: agentData } = await supabase
            .from('agent_production')
            .select('*')
            .eq('agent_id', agentId!)
            .single();
          if (agentData) setStats(agentData as unknown as AgentStats);
        }

        // Policies — paginate
        const allPolicies: PolicyRow[] = [];
        const PAGE = 1000;
        let offset = 0;
        let done = false;
        while (!done) {
          let q = supabase
            .from('book_of_business')
            .select('policy_number, product_type, status, monthly_premium, annual_premium, policy_effective_date, paid_to_date, draft_count, is_at_risk, flag_type, days_since_paid')
            .eq('agent_id', agentId!)
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

        // Trend — daily from policy_cache
        let trendQuery = supabase
          .from('policy_cache')
          .select('policy_effective_date, plan_premium, product_type')
          .eq('agent_id', agentId!)
          .not('policy_effective_date', 'is', null);
        if (useRpc) {
          trendQuery = trendQuery.gte('policy_effective_date', startDate).lt('policy_effective_date', endDate);
        }
        const { data: cacheRows } = await trendQuery;

        const gran = getGranularity(dateRange);
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
            .map(([bucket, v]) => ({ bucket, label: fmtBucketLabel(bucket, gran), policies: v.policies, ap: v.ap }))
            .sort((a, b) => a.bucket.localeCompare(b.bucket))
        );
      } catch (err) {
        console.error('Agent detail load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId, dateRange, datePreset]);

  // Product mix from active policies
  const productMix = useMemo(() => {
    const mixMap = new Map<string, number>();
    policies
      .filter(p => p.status === 'active')
      .forEach(p => { mixMap.set(p.product_type, (mixMap.get(p.product_type) || 0) + 1); });
    return Array.from(mixMap.entries()).map(([product_type, count]) => ({ product_type, count }));
  }, [policies]);

  // Guard: agency admins cannot view another agency's agent
  if (!isOrgWide && effectiveAgencyId && agencyId !== effectiveAgencyId) {
    return <Navigate to="/production" replace />;
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
        {/* Back bar skeleton */}
        <Skeleton className="h-4 w-32" />
        {/* Hero strip skeleton */}
        <div className="flex items-center gap-6 p-6 rounded-xl border border-border bg-card">
          <Skeleton className="w-16 h-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-32 rounded-lg" />)}
          </div>
        </div>
        {/* Tab skeleton */}
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
        <Link
          to={backPath}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} /> Back to {backLabel}
        </Link>
        <div className="text-center py-16">
          <Users size={48} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Agent Not Found</p>
          <p className="text-sm text-muted-foreground mt-1">No production data found for this agent.</p>
        </div>
      </div>
    );
  }

  const agentName = stats.agent_name || 'Unknown Agent';
  const grad = avatarGradient(agentName);

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* ── Back bar + breadcrumb (§11.2) ───────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            to={backPath}
            className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} /> Back to {backLabel}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">{agentName}</span>
        </div>
        <PeriodPills
          preset={datePreset}
          dateRange={dateRange}
          onChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
          showCompare={false}
          storageKey="agent-detail"
          compact
        />
      </div>

      {/* ── Hero strip (§11.2) ──────────────────────────────────────────── */}
      <StaggerContainer className="flex flex-col md:flex-row items-start md:items-center gap-6 p-6 rounded-xl border border-border bg-card">
        {/* Avatar + identity */}
        <StaggerItem className="flex items-center gap-4 flex-shrink-0">
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-lg font-bold shadow-lg`}>
            {initials(agentName)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{agentName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {stats.writing_number && (
                <Badge className="bg-secondary text-muted-foreground border-border text-[10px] px-1.5 py-0">
                  WN: {stats.writing_number}
                </Badge>
              )}
              <Badge className="bg-secondary text-muted-foreground border-border text-[10px] px-1.5 py-0">
                {stats.agency_name || stats.agency_id}
              </Badge>
            </div>
          </div>
        </StaggerItem>

        {/* KPI tiles — 4 hero tiles per PRD §11.2 */}
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3 w-full md:w-auto">
          {/* MTD AP — navy gradient hero tile */}
          <StaggerItem>
            <div className="relative overflow-hidden rounded-lg border border-border p-4 bg-gradient-to-br from-[hsl(217,33%,12%)] to-[hsl(222,47%,9%)]">
              <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/5 rounded-bl-full" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">MTD AP</p>
              <CountUp
                end={Number(stats.ap_this_month || 0)}
                format={fmt$}
                className="text-2xl font-bold mt-1 block text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {fmtNum(stats.policies_this_month || 0)} apps this month
              </p>
              <DollarSign size={14} className="absolute top-3 right-3 text-cyan-500/30" />
            </div>
          </StaggerItem>

          {/* Policies Taken (primary quality KPI) */}
          <StaggerItem>
            <Card className="border-border h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Policies Taken</p>
                    <CountUp
                      end={stats.active_policies}
                      format={fmtNum}
                      className="text-2xl font-bold mt-1 block text-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fmtNum(stats.total_policies)} total</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10">
                    <FileText size={14} className="text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* 90-Day Retention */}
          <StaggerItem>
            <Card className={`border-border h-full ${retentionBg(stats.retention_pct)}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">90d Retention</p>
                    <CountUp
                      end={stats.retention_pct !== null ? Number(stats.retention_pct) : 0}
                      format={(n: number) => stats.retention_pct !== null ? `${n.toFixed(1)}%` : '—'}
                      className={`text-2xl font-bold mt-1 block ${retentionColor(stats.retention_pct)}`}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {stats.ever_drafted > 0 ? `${stats.retained_policies}/${stats.ever_drafted}` : 'No drafts'}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10">
                    <ShieldCheck size={14} className={retentionColor(stats.retention_pct)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* At Risk */}
          <StaggerItem>
            <Card className="border-border h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">At Risk</p>
                    <CountUp
                      end={stats.at_risk_policies}
                      format={fmtNum}
                      className={`text-2xl font-bold mt-1 block ${stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground'}`}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{stats.terminated_policies} terminated</p>
                  </div>
                  <div className={`p-1.5 rounded-lg ${stats.at_risk_policies > 0 ? 'bg-red-500/10' : 'bg-secondary'}`}>
                    <AlertTriangle size={14} className={stats.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground'} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        </div>
      </StaggerContainer>

      {/* ── Tabs (§11.3) ────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-secondary/50 border border-border/30 p-1">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            <TrendingUp size={14} /> Overview
          </TabsTrigger>
          <TabsTrigger value="volume" className="text-xs gap-1.5">
            <DollarSign size={14} /> Volume
          </TabsTrigger>
          <TabsTrigger value="quality" className="text-xs gap-1.5">
            <ShieldCheck size={14} /> Quality
          </TabsTrigger>
          <TabsTrigger value="policies" className="text-xs gap-1.5">
            <FileText size={14} /> Policies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            stats={stats}
            trend={trend}
            policies={policies}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="volume">
          <VolumeTab
            stats={stats}
            trend={trend}
            productMix={productMix}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="quality">
          <QualityTab
            stats={stats}
            policies={policies}
          />
        </TabsContent>

        <TabsContent value="policies">
          <PoliciesTab
            policies={policies}
            agentId={agentId || ''}
            writingNumber={stats.writing_number}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
