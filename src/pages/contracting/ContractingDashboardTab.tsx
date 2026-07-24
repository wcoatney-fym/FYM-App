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
      // Fetch all agents (status only) + new hires + activity log in parallel
      const [agentsRes, newHiresRes, allNewHiresRes, logsRes] =
        await Promise.all([
          portalSupabase.from('agents').select('status'),
          portalSupabase
            .from('new_hires')
            .select('id', { count: 'exact', head: true })
            .eq('processed', false),
          portalSupabase
            .from('new_hires')
            .select('id', { count: 'exact', head: true }),
          portalSupabase
            .from('activity_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

      if (agentsRes.error) throw agentsRes.error;

      const agents = agentsRes.data ?? [];

      setCounts({
        pending: agents.filter((a) => a.status === 'pending').length,
        inProgress: agents.filter((a) => a.status === 'in-progress').length,
        completed: agents.filter((a) => a.status === 'completed').length,
        expired: agents.filter((a) => a.status === 'expired').length,
        terminated: agents.filter((a) => a.status === 'terminated').length,
        newHires: newHiresRes.count ?? 0,
      });

      setMetrics({
        totalNewHires: allNewHiresRes.count ?? 0,
        totalFormsSent: agents.length,
        totalFormsCompleted: agents.filter((a) => a.status === 'completed')
          .length,
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
        const { data, error: err } = await portalSupabase
          .from('agents')
          .select('status')
          .eq('agency', agency);

        if (err) throw err;

        const agents = data ?? [];
        const formsSent = agents.length;
        const completed = agents.filter(
          (a) => a.status === 'completed'
        ).length;

        setAgencyData({
          formsSent,
          pending: agents.filter((a) => a.status === 'pending').length,
          inProgress: agents.filter((a) => a.status === 'in-progress').length,
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
        accent: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
      },
      {
        title: 'Pending Verification',
        count: counts.pending,
        icon: Clock,
        accent: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
      },
      {
        title: 'In Progress',
        count: counts.inProgress,
        icon: FileText,
        accent: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
      },
      {
        title: 'Completed',
        count: counts.completed,
        icon: CheckCircle,
        accent: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
      },
    ],
    [counts]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-amber-500 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-900">
            Portal Connection Required
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Set <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_URL</code> and{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_KEY</code> in
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
        <div className="h-48 rounded-xl bg-slate-200 animate-pulse" />
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-slate-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-red-500 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-900">
            Connection Error
          </h3>
          <p className="text-sm text-slate-500">{error}</p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#162d4a] transition-colors"
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
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] rounded-xl p-8 text-white relative overflow-hidden">
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
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10">
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
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10">
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
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10">
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

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card
            key={card.title}
            className={`${card.border} hover:shadow-md transition-shadow`}
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
              <h3 className="text-slate-600 text-sm font-medium">
                {card.title}
              </h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-slate-400">
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
      <Card className="border-slate-200">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-5">
            Agency Performance
          </h2>
          <div className="space-y-3">
            {AGENCIES.map((agency) => {
              const isExpanded = expandedAgency === agency.value;
              return (
                <div
                  key={agency.value}
                  className="border border-slate-200 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedAgency(isExpanded ? null : agency.value)
                    }
                    className={`w-full flex items-center justify-between px-5 py-4 text-left transition-all duration-200 ${
                      isExpanded
                        ? 'bg-[#1e3a5f] text-white'
                        : 'bg-white hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <span className="text-base font-semibold">
                      {agency.name}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} className="text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-5 bg-slate-50 border-t border-slate-200">
                      {agencyLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="h-24 rounded-xl bg-slate-100 animate-pulse"
                            />
                          ))}
                        </div>
                      ) : agencyData ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-white rounded-xl p-5 border border-slate-200">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-blue-50 rounded-lg mr-3">
                                <Mail size={14} className="text-blue-600" />
                              </div>
                              <span className="text-xs font-medium text-slate-600">
                                Forms Sent
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-slate-900">
                              {agencyData.formsSent}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-5 border border-yellow-200">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-yellow-50 rounded-lg mr-3">
                                <Clock
                                  size={14}
                                  className="text-yellow-600"
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-600">
                                Pending
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-yellow-700">
                              {agencyData.pending}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-5 border border-blue-200">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-blue-50 rounded-lg mr-3">
                                <FileText
                                  size={14}
                                  className="text-blue-600"
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-600">
                                In Progress
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-blue-700">
                              {agencyData.inProgress}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-5 border border-emerald-200">
                            <div className="flex items-center mb-3">
                              <div className="p-2 bg-emerald-50 rounded-lg mr-3">
                                <CheckCircle
                                  size={14}
                                  className="text-emerald-600"
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-600">
                                Completed
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-emerald-700">
                              {agencyData.completed}
                            </div>
                            <p className="text-xs text-emerald-600 font-medium mt-1">
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
      <Card className="border-slate-200">
        <CardContent className="p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Recent Activity
          </h2>
          <div className="space-y-3 max-h-64 overflow-auto">
            {activities.length > 0 ? (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="pb-3 border-b border-slate-100 last:border-0"
                >
                  <p className="text-sm text-slate-800">{activity.details}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {timeAgo(activity.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">
                No recent activity
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
