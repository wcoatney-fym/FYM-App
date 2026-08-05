/**
 * Contracting Dashboard Tab — Stage 4 (live)
 *
 * Reads from portal DB (akhojh…) via portal-supabase.ts:
 *   - `agents` — status counts + agency breakdowns
 *   - `new_hires` — unprocessed queue count
 *   - `activity_log` — recent activity feed
 *
 * Layout ported from contracting-portal/src/pages/Dashboard.tsx,
 * adapted to FYM App design language (slate/[#1e3a5f] palette).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  FileText,
  CheckCircle,
  Users,
  TrendingUp,
  UserPlus,
  Mail,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import { portalSupabase } from '@/lib/portal-supabase';
import { timeAgo } from '@/lib/contracting/helpers';
import type { PortalActivityLog, AgencyName } from '@/lib/contracting/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusCounts {
  pending: number;
  inProgress: number;
  completed: number;
  expired: number;
  terminated: number;
  newHires: number;
}

interface CumulativeMetrics {
  totalNewHires: number;
  totalFormsSent: number;
  totalFormsCompleted: number;
}

interface AgencyBreakdown {
  formsSent: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionPct: number;
}

const AGENCIES: { name: string; value: AgencyName }[] = [
  { name: 'FYM', value: 'FYM' },
  { name: 'Wisechoice', value: 'Wisechoice' },
  { name: 'Aspire', value: 'Aspire' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ContractingDashboardTab() {
  const [counts, setCounts] = useState<StatusCounts>({
    pending: 0,
    inProgress: 0,
    completed: 0,
    expired: 0,
    terminated: 0,
    newHires: 0,
  });
  const [metrics, setMetrics] = useState<CumulativeMetrics>({
    totalNewHires: 0,
    totalFormsSent: 0,
    totalFormsCompleted: 0,
  });
  const [activities, setActivities] = useState<PortalActivityLog[]>([]);
  const [expandedAgency, setExpandedAgency] = useState<AgencyName | null>(null);
  const [agencyData, setAgencyData] = useState<AgencyBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!portalSupabase) {
      setError('Portal connection not configured');
      setLoading(false);
      return;
    }

    try {
      // Server-side count aggregates — no need to pull every row
      const [pendingRes, inProgressRes, completedRes, expiredRes, terminatedRes, totalAgentsRes, newHiresRes, allNewHiresRes, logsRes] =
        await Promise.all([
          portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'in-progress'),
          portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
          portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'expired'),
          portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'terminated'),
          portalSupabase.from('agents').select('id', { count: 'exact', head: true }),
          portalSupabase.from('new_hires').select('id', { count: 'exact', head: true }).eq('processed', false),
          portalSupabase.from('new_hires').select('id', { count: 'exact', head: true }),
          portalSupabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(10),
        ]);

      // Throw on first error
      for (const res of [pendingRes, inProgressRes, completedRes, expiredRes, terminatedRes, totalAgentsRes, newHiresRes, allNewHiresRes]) {
        if (res.error) throw res.error;
      }

      const pending = pendingRes.count ?? 0;
      const inProgress = inProgressRes.count ?? 0;
      const completed = completedRes.count ?? 0;
      const totalAgents = totalAgentsRes.count ?? 0;

      setCounts({
        pending,
        inProgress,
        completed,
        expired: expiredRes.count ?? 0,
        terminated: terminatedRes.count ?? 0,
        newHires: newHiresRes.count ?? 0,
      });

      setMetrics({
        totalNewHires: allNewHiresRes.count ?? 0,
        totalFormsSent: totalAgents,
        totalFormsCompleted: completed,
      });

      setActivities((logsRes.data as PortalActivityLog[]) ?? []);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('[Contracting Dashboard] Load error:', err);
      setError('Failed to load contracting data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAgencyData = useCallback(
    async (agency: AgencyName) => {
      if (!portalSupabase) return;
      setAgencyLoading(true);

      try {
        // Server-side count aggregates per agency
        const [totalRes, pendingRes, inProgressRes, completedRes] =
          await Promise.all([
            portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('agency', agency),
            portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('agency', agency).eq('status', 'pending'),
            portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('agency', agency).eq('status', 'in-progress'),
            portalSupabase.from('agents').select('id', { count: 'exact', head: true }).eq('agency', agency).eq('status', 'completed'),
          ]);

        for (const res of [totalRes, pendingRes, inProgressRes, completedRes]) {
          if (res.error) throw res.error;
        }

        const formsSent = totalRes.count ?? 0;
        const completed = completedRes.count ?? 0;

        setAgencyData({
          formsSent,
          pending: pendingRes.count ?? 0,
          inProgress: inProgressRes.count ?? 0,
          completed,
          completionPct:
            formsSent > 0 ? Math.round((completed / formsSent) * 100) : 0,
        });
      } catch (err) {
        console.error('[Contracting Dashboard] Agency load error:', err);
      } finally {
        setAgencyLoading(false);
      }
    },
    []
  );

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (expandedAgency) {
      loadAgencyData(expandedAgency);
    } else {
      setAgencyData(null);
    }
  }, [expandedAgency, loadAgencyData]);

  // ── KPI cards config ─────────────────────────────────────────────────────

  const kpiCards = useMemo(
    () => [
      {
        title: 'New Hires Awaiting Form',
        count: counts.newHires,
        icon: Users,
        accent: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        hudAccent: 'hsl(38 92% 50% / 0.4)',
      },
      {
        title: 'Pending Verification',
        count: counts.pending,
        icon: Clock,
        accent: 'text-yellow-400',
        bg: 'bg-amber-500/10',
        border: 'border-yellow-500/20',
        hudAccent: 'hsl(48 96% 53% / 0.4)',
      },
      {
        title: 'In Progress',
        count: counts.inProgress,
        icon: FileText,
        accent: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-blue-500/20',
        hudAccent: 'hsl(199 89% 48% / 0.4)',
      },
      {
        title: 'Completed',
        count: counts.completed,
        icon: CheckCircle,
        accent: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        hudAccent: 'hsl(142 71% 45% / 0.4)',
      },
    ],
    [counts]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-amber-500 mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">
            Portal Connection Required
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Set <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_URL</code> and{' '}
            <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_KEY</code> in
            Netlify to connect the contracting dashboard to the portal database.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Hero skeleton */}
        <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-red-500 mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">
            Connection Error
          </h3>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/80 transition-colors"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cumulative Performance Hero ─────────────────────────────────── */}
      <HudFrame accentColor="hsl(199 89% 48% / 0.5)">
        <div className="gradient-primary rounded-xl p-8 text-white relative overflow-hidden">
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <TrendingUp size={18} className="mr-2 text-amber-300" />
                <h2 className="text-lg font-bold">Cumulative Performance</h2>
              </div>
              <button
                onClick={loadData}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={14} className="text-white/60" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/15">
                <div className="flex items-center mb-3">
                  <div className="p-2 bg-amber-400/20 rounded-lg mr-3">
                    <UserPlus size={18} className="text-amber-300" />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Total New Hires
                  </span>
                </div>
                <div className="text-3xl font-bold">
                  {metrics.totalNewHires.toLocaleString()}
                </div>
                <p className="text-xs text-white/50 mt-2">
                  All-time new hire entries
                </p>
              </div>
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/15">
                <div className="flex items-center mb-3">
                  <div className="p-2 bg-amber-400/20 rounded-lg mr-3">
                    <Mail size={18} className="text-amber-300" />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Forms Sent
                  </span>
                </div>
                <div className="text-3xl font-bold">
                  {metrics.totalFormsSent.toLocaleString()}
                </div>
                <p className="text-xs text-white/50 mt-2">
                  Total forms sent to agents
                </p>
              </div>
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/15">
                <div className="flex items-center mb-3">
                  <div className="p-2 bg-amber-400/20 rounded-lg mr-3">
                    <CheckCircle size={18} className="text-amber-300" />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Forms Completed
                  </span>
                </div>
                <div className="text-3xl font-bold">
                  {metrics.totalFormsCompleted.toLocaleString()}
                </div>
                <p className="text-xs text-white/50 mt-2">
                  Successfully completed forms
                </p>
              </div>
            </div>
          </div>
        </div>
      </HudFrame>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <HudFrame key={card.title} accentColor={card.hudAccent}>
            <Card
              className={`${card.border} hover:glow-primary transition-shadow`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-lg ${card.bg}`}>
                    <card.icon size={18} className={card.accent} />
                  </div>
                  <span className={`text-2xl font-bold ${card.accent}`}>
                    {card.count.toLocaleString()}
                  </span>
                </div>
                <h3 className="text-muted-foreground text-sm font-medium">
                  {card.title}
                </h3>
              </CardContent>
            </Card>
          </HudFrame>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Last updated{' '}
        {new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }).format(lastUpdate)}{' '}
        CT
      </p>

      {/* ── Agency Performance ─────────────────────────────────────────── */}
      <Card className="border-border">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold text-foreground mb-5">
            Agency Performance
          </h2>
          <div className="space-y-3">
            {AGENCIES.map((agency) => {
              const isExpanded = expandedAgency === agency.value;
              return (
                <div
                  key={agency.value}
                  className="border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedAgency(isExpanded ? null : agency.value)
                    }
                    className={`w-full flex items-center justify-between px-5 py-4 text-left transition-all duration-200 ${
                      isExpanded
                        ? 'bg-primary text-white'
                        : 'bg-card hover:bg-background text-foreground'
                    }`}
                  >
                    <span className="text-base font-semibold">
                      {agency.name}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} className="text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-5 bg-background border-t border-border">
                      {agencyLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="h-24 rounded-xl bg-secondary/30 animate-pulse"
                            />
                          ))}
                        </div>
                      ) : agencyData ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-card rounded-xl p-5 border border-border">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-cyan-500/10 rounded-lg mr-3">
                                <Mail size={14} className="text-cyan-400" />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                Forms Sent
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                              {agencyData.formsSent}
                            </div>
                          </div>
                          <div className="bg-card rounded-xl p-5 border border-yellow-500/20">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-amber-500/10 rounded-lg mr-3">
                                <Clock
                                  size={14}
                                  className="text-yellow-400"
                                />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                Pending
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-amber-400">
                              {agencyData.pending}
                            </div>
                          </div>
                          <div className="bg-card rounded-xl p-5 border border-blue-500/20">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-cyan-500/10 rounded-lg mr-3">
                                <FileText
                                  size={14}
                                  className="text-cyan-400"
                                />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                In Progress
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-cyan-400">
                              {agencyData.inProgress}
                            </div>
                          </div>
                          <div className="bg-card rounded-xl p-5 border border-emerald-500/20">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-emerald-500/10 rounded-lg mr-3">
                                <CheckCircle
                                  size={14}
                                  className="text-emerald-400"
                                />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                Completed
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-emerald-400">
                              {agencyData.completed}
                            </div>
                            <p className="text-xs text-emerald-400 font-medium mt-1">
                              {agencyData.completionPct}% completion rate
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Recent Activity ────────────────────────────────────────────── */}
      <Card className="border-border">
        <CardContent className="p-6">
          <h2 className="text-base font-bold text-foreground mb-4">
            Recent Activity
          </h2>
          <div className="space-y-3 max-h-64 overflow-auto">
            {activities.length > 0 ? (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="pb-3 border-b border-border/50 last:border-0"
                >
                  <p className="text-sm text-foreground">{activity.details}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {timeAgo(activity.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
