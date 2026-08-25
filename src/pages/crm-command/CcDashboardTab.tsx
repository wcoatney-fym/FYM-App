import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, DollarSign, TrendingUp, AlertTriangle,
  Shield, Target, UserPlus, Clock, Bot, Zap, RefreshCw
} from 'lucide-react';
import { useTasksStore } from '@/stores/cc-stores';
import { formatDistanceToNow } from 'date-fns';
import { useDashboardStats } from '@/lib/command-center/use-dashboard-stats';
import { supabase } from '@/lib/supabase';
import { portalSupabase } from '@/lib/portal-supabase';
import { scopeToAgency } from '@/lib/query-helpers';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import { Skeleton } from '@/components/ui/skeleton';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

interface AgencyInsight {
  agencyName: string;
  atRiskCount: number;
  retentionPct: number | null;
}

interface ActivityRow {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

const RECRUITING_STAGES = ['hip_broker', 'hip_career', 'iaa', 'signed_iaa'];
/** Inclusion list — new stages won't silently inflate the active lead count. */
const ACTIVE_LEAD_STAGES = [
  'hip_broker', 'hip_career', 'iaa', 'signed_iaa',
  'bill_com', 'in_contracting', 'rts', 'crm',
  'hip_broker_ready', 'hip_career_ready',
];

export function CcDashboardTab() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const tasks = useTasksStore((s) => s.tasks);
  const loadLiveTasks = useTasksStore((s) => s.loadLive);
  const tasksSource = useTasksStore((s) => s.source);

  const liveStats = useDashboardStats();

  const [activeLeads, setActiveLeads] = useState<number | null>(null);
  const [recruitingCount, setRecruitingCount] = useState<number | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [dataErrors, setDataErrors] = useState<string[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const orgData = useOrgData();

  // Derive Placements MTD from OrgDataCache monthly production (current month only)
  const placementsMTD = useMemo(() => {
    if (orgData.monthlyProduction.length === 0) return null;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return orgData.monthlyProduction
      .filter(m => m.month === monthKey)
      .reduce((s, r) => s + r.policies, 0);
  }, [orgData.monthlyProduction]);
  const revenueMTD = useMemo(() => {
    if (orgData.monthlyProduction.length === 0) return null;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return orgData.monthlyProduction
      .filter(m => m.month === monthKey)
      .reduce((s, r) => s + r.annual_premium, 0);
  }, [orgData.monthlyProduction]);

  const atRiskRate = useMemo(() => {
    if (!orgData.retentionSummary) return '0';
    const org = orgData.retentionSummary.data.org_wide;
    const total = org.total_active_policies + org.total_at_risk;
    return total > 0 ? ((org.total_at_risk / total) * 100).toFixed(1) : '0';
  }, [orgData.retentionSummary]);

  const insights = useMemo((): AgencyInsight[] => {
    if (!orgData.retentionSummary) return [];
    return [...orgData.retentionSummary.data.agencies]
      .sort((a, b) => b.at_risk_count - a.at_risk_count)
      .slice(0, 3)
      .map(r => ({
        agencyName: r.agency_id, // name enrichment handled below
        atRiskCount: r.at_risk_count,
        retentionPct: r.retention_pct,
      }));
  }, [orgData.retentionSummary]);

  useEffect(() => {
    if (tasksSource === null) void loadLiveTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consolidated portal data fetch — pipeline counts + activity log in one effect
  const fetchPortalData = useCallback(async () => {
    if (!portalSupabase) return;
    const errors: string[] = [];

    // Pipeline counts
    try {
      const [{ count: activeCount }, { count: recruitCount }] = await Promise.all([
        scopeToAgency(
          portalSupabase
            .from('agent_pipeline')
            .select('id', { count: 'exact', head: true })
            .in('stage', ACTIVE_LEAD_STAGES),
          isOrgWide,
          effectiveAgencyId
        ),
        scopeToAgency(
          portalSupabase
            .from('agent_pipeline')
            .select('id', { count: 'exact', head: true })
            .in('stage', RECRUITING_STAGES),
          isOrgWide,
          effectiveAgencyId
        ),
      ]);
      setActiveLeads(activeCount ?? 0);
      setRecruitingCount(recruitCount ?? 0);
    } catch {
      setActiveLeads(0);
      setRecruitingCount(0);
      errors.push('Pipeline data unavailable');
    }

    // Activity log
    try {
      const { data } = await portalSupabase
        .from('activity_log')
        .select('id, action, details, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      setActivities((data as ActivityRow[]) || []);
    } catch {
      setActivities([]);
      errors.push('Activity log unavailable');
    }

    setDataErrors(errors);
    setLastSynced(new Date());
  }, [isOrgWide, effectiveAgencyId]);

  useEffect(() => { void fetchPortalData(); }, [fetchPortalData]);

  // Agency names enrichment for insights (lightweight, not Max's DB)
  const [insightNames, setInsightNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: nameData } = await supabase
        .from('agencies')
        .select('writing_number, name');
      if (nameData) {
        const nm = new Map<string, string>();
        for (const a of nameData as { writing_number: string | null; name: string }[]) {
          if (a.writing_number) nm.set(a.writing_number, a.name);
        }
        setInsightNames(nm);
      }
    })();
  }, []);

  // Enrich insight agency names
  const enrichedInsights = useMemo(() =>
    insights.map(i => ({
      ...i,
      agencyName: insightNames.get(i.agencyName) || i.agencyName,
    })),
  [insights, insightNames]);

  const overdueTasks = tasks.filter((t) => new Date(t.dueDate) < new Date() && t.status !== 'done');

  const retentionNum = parseFloat(liveStats.retentionPct);
  const retentionColor = !liveStats.configured || liveStats.loading
    ? 'text-emerald-400'
    : retentionNum >= 90 ? 'text-emerald-400'
    : retentionNum >= 85 ? 'text-amber-400'
    : 'text-red-400';
  const retentionBg = !liveStats.configured || liveStats.loading
    ? 'bg-emerald-400/10'
    : retentionNum >= 90 ? 'bg-emerald-400/10'
    : retentionNum >= 85 ? 'bg-amber-400/10'
    : 'bg-red-400/10';

  const kpis: { label: string; value: string | null; icon: typeof Target; color: string; bg: string; live: boolean }[] = [
    { label: 'Active Leads', value: activeLeads === null ? null : activeLeads.toLocaleString(), icon: Target, color: 'text-sky-400', bg: 'bg-sky-400/10', live: true },
    { label: 'Placements MTD', value: placementsMTD === null ? null : placementsMTD.toLocaleString(), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10', live: true },
    { label: 'Revenue MTD', value: revenueMTD === null ? null : (revenueMTD > 0 ? `$${(revenueMTD / 1000).toFixed(1)}K` : '$0'), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10', live: true },
    { label: 'At-Risk Rate', value: `${atRiskRate}%`, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', live: true },
    { label: 'Persistency', value: liveStats.configured ? (liveStats.loading ? null : liveStats.persistencyPct) : '—', icon: Shield, color: 'text-sky-400', bg: 'bg-sky-400/10', live: liveStats.configured },
    {
      label: '90-Day Retention',
      value: liveStats.configured ? (liveStats.loading ? null : liveStats.retentionPct) : '—',
      icon: Users,
      color: retentionColor,
      bg: retentionBg,
      live: liveStats.configured,
    },
    { label: 'Recruiting Pipeline', value: recruitingCount === null ? null : recruitingCount.toLocaleString(), icon: UserPlus, color: 'text-sky-400', bg: 'bg-sky-400/10', live: true },
    { label: 'Tasks Overdue', value: overdueTasks.length.toString(), icon: Clock, color: overdueTasks.length > 0 ? 'text-red-400' : 'text-emerald-400', bg: overdueTasks.length > 0 ? 'bg-red-400/10' : 'bg-emerald-400/10', live: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time overview of all operations</p>
        </div>
        {lastSynced && (
          <button
            onClick={() => void fetchPortalData()}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
            title="Click to refresh"
          >
            <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" />
            Last synced {formatDistanceToNow(lastSynced, { addSuffix: true })}
          </button>
        )}
      </div>

      {dataErrors.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Partial data — {dataErrors.join(', ').toLowerCase()}. Some metrics may be incomplete.
          </p>
        </div>
      )}

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <motion.div key={kpi.label} variants={item} className="glass rounded-xl p-4 glass-hover cursor-default">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
            </div>
            {kpi.value === null
              ? <Skeleton className="h-8 w-16 mt-2" />
              : <p className="text-2xl font-bold mt-2">{kpi.value}</p>
            }
            {kpi.live && <p className="text-[10px] text-primary/60 mt-1">● live</p>}
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-3 glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-background" />
            </div>
            <h2 className="text-sm font-semibold">Retention Signals</h2>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          {enrichedInsights.length > 0 ? (
            <div className="space-y-3">
              {enrichedInsights.map((insight, i) => (
                <div key={insight.agencyName} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    <span className="font-semibold">{insight.agencyName}</span> — {insight.atRiskCount} at-risk polic{insight.atRiskCount === 1 ? 'y' : 'ies'}
                    {insight.retentionPct !== null && (
                      <> · retention {insight.retentionPct}%</>
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No at-risk signals to surface right now.</p>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2 glass rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Recent Activity</h2>
          {activities.length > 0 ? (
            <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-sky-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      <span className="font-medium">{activity.action}</span>
                      {activity.details ? ` — ${activity.details}` : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
