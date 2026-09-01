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
import {
  fetchAgentProduction,
  fetchBookOfBusiness,
  type PolicyRow as ProdPolicyRow,
} from '@/lib/prod-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  ArrowLeft, DollarSign, FileText, ShieldCheck,
  TrendingUp, AlertTriangle, Users, ClipboardList,
} from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { VolumeTab } from './tabs/VolumeTab';
import { QualityTab } from './tabs/QualityTab';
import { PoliciesTab } from './tabs/PoliciesTab';
import { ContractingTab } from './tabs/ContractingTab';
import type { AgentStats, PolicyRow, TrendPoint } from './types';
import { fmt$, fmtNum, retentionColor, retentionBg } from './helpers';
import { portalSupabase } from '@/lib/portal-supabase';
import type { PortalPipelineRecord } from '@/lib/contracting/types';
import { PeriodPills } from '@/components/filters/PeriodPills';
import { Header } from '@/components/layout/Header';
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
  const [isFymDirect, setIsFymDirect] = useState(false);
  const [pipelineRecord, setPipelineRecord] = useState<PortalPipelineRecord | null>(null);
  const [portalAgentId, setPortalAgentId] = useState<string | null>(null);
  const [contractingLoading, setContractingLoading] = useState(true);

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

  // ── Check FYM Direct + load pipeline record ─────────────────────────────
  useEffect(() => {
    if (!agentId || !portalSupabase || !supabase) {
      setContractingLoading(false);
      return;
    }
    async function loadContractingData() {
      setContractingLoading(true);
      try {
        // Get agent's agency_id from profile
        const { data: prof } = await supabase!.from('profiles').select('agency_id').eq('id', agentId!).maybeSingle();
        if (prof?.agency_id) {
          // Check if agency is fym_direct in portal crm_agencies
          const { data: agency } = await portalSupabase!.from('crm_agencies').select('variant').eq('id', prof.agency_id).maybeSingle();
          if (agency?.variant === 'fym_direct') {
            setIsFymDirect(true);
            // Find pipeline record by agent_id
            const { data: pipeline } = await portalSupabase!.from('agent_pipeline').select('*').eq('agent_id', agentId!).maybeSingle();
            if (pipeline) {
              setPipelineRecord(pipeline as PortalPipelineRecord);
              setPortalAgentId(pipeline.agent_id);
            }
          }
        }
      } catch (err) {
        console.error('Contracting data load error:', err);
      } finally {
        setContractingLoading(false);
      }
    }
    loadContractingData();
  }, [agentId]);

  // ── Data loading (edge functions — writing-number based) ─────────────────
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const startDate = dateRange.startDate.split('T')[0];
        const endDate = dateRange.endDate.split('T')[0];
        const useDate = datePreset !== 'allTime';

        // Parallel: agent stats from prod-data + policies from book-of-business
        const [agentRes, bobRes] = await Promise.all([
          fetchAgentProduction({
            agent_id: agentId,
            ...(useDate ? { start_date: startDate, end_date: endDate } : {}),
          }),
          fetchBookOfBusiness({
            agent_wn: agentId,
            page_size: 500,
            page: 0,
            sort: 'submit_date',
            order: 'desc',
          }),
        ]);

        if (cancelled) return;

        // Stats — the edge function returns an array; find our agent
        const match = agentRes.find(r => r.agent_id === agentId);
        if (match) {
          setStats(match as unknown as AgentStats);
        } else {
          setStats(null);
        }

        // Policies — map prod-api PolicyRow → agent-detail PolicyRow
        const today = new Date();
        const mappedPolicies: PolicyRow[] = (bobRes.data || []).map((p: ProdPolicyRow) => {
          let daysSincePaid: number | null = null;
          if (p.paid_to_date) {
            const ptd = new Date(p.paid_to_date);
            daysSincePaid = Math.floor((today.getTime() - ptd.getTime()) / 86400000);
          }
          return {
            policy_number: p.policy_number,
            product_type: p.product_type,
            status: p.status,
            monthly_premium: p.plan_premium,
            annual_premium: p.annual_premium,
            policy_effective_date: p.policy_effective_date,
            paid_to_date: p.paid_to_date,
            draft_count: p.draft_count,
            is_at_risk: p.is_at_risk,
            flag_type: p.flag_type,
            days_since_paid: daysSincePaid,
          };
        });

        // Paginate remaining pages if more exist
        if (bobRes.pagination && bobRes.pagination.total_pages > 1) {
          for (let pg = 1; pg < bobRes.pagination.total_pages; pg++) {
            if (cancelled) return;
            const nextPage = await fetchBookOfBusiness({
              agent_wn: agentId,
              page_size: 500,
              page: pg,
              sort: 'submit_date',
              order: 'desc',
            });
            (nextPage.data || []).forEach((p: ProdPolicyRow) => {
              let daysSincePaid: number | null = null;
              if (p.paid_to_date) {
                const ptd = new Date(p.paid_to_date);
                daysSincePaid = Math.floor((today.getTime() - ptd.getTime()) / 86400000);
              }
              mappedPolicies.push({
                policy_number: p.policy_number,
                product_type: p.product_type,
                status: p.status,
                monthly_premium: p.plan_premium,
                annual_premium: p.annual_premium,
                policy_effective_date: p.policy_effective_date,
                paid_to_date: p.paid_to_date,
                draft_count: p.draft_count,
                is_at_risk: p.is_at_risk,
                flag_type: p.flag_type,
                days_since_paid: daysSincePaid,
              });
            });
          }
        }
        setPolicies(mappedPolicies);

        // Trend — derive from policies (replaces old policy_cache query)
        const gran = getGranularity(dateRange);
        const byBucket = new Map<string, { policies: number; ap: number }>();
        mappedPolicies.forEach(p => {
          if (!p.policy_effective_date) return;
          const key = bucketKey(p.policy_effective_date, gran);
          const existing = byBucket.get(key) || { policies: 0, ap: 0 };
          existing.policies += 1;
          existing.ap += p.annual_premium || 0;
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
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
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
      <div>
      <Header title="Agent Detail" />
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
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <div>
      <Header title="Agent Not Found" />
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
      </div>
    );
  }

  const agentName = stats.agent_name || 'Unknown Agent';
  const grad = avatarGradient(agentName);

  return (
    <div>
    <Header title={agentName} />
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
          {isFymDirect && (
            <TabsTrigger value="contracting" className="text-xs gap-1.5">
              <ClipboardList size={14} /> Contracting
            </TabsTrigger>
          )}
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

        {isFymDirect && (
          <TabsContent value="contracting">
            <ContractingTab
              pipelineRecord={pipelineRecord}
              portalAgentId={portalAgentId}
              loading={contractingLoading}
              onPipelineUpdated={(updated) => setPipelineRecord(updated)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
    </div>
  );
}
