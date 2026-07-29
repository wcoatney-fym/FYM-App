import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users, DollarSign, TrendingUp, AlertTriangle,
  Shield, Target, UserPlus, Clock, Bot, Zap
} from 'lucide-react';
import { useTasksStore } from '@/stores/cc-stores';
import { formatDistanceToNow } from 'date-fns';
import { useDashboardStats } from '@/lib/command-center/use-dashboard-stats';
import { supabase } from '@/lib/supabase';
import { portalSupabase } from '@/lib/portal-supabase';
import { scopeToAgency } from '@/lib/query-helpers';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

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
const ACTIVE_LEAD_EXCLUDED_STAGES = ['terminated', 'rts', 'actively_selling'];

export function CcDashboardTab() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const tasks = useTasksStore((s) => s.tasks);
  const loadLiveTasks = useTasksStore((s) => s.loadLive);
  const tasksSource = useTasksStore((s) => s.source);

  const liveStats = useDashboardStats();

  const [activeLeads, setActiveLeads] = useState<number | null>(null);
  const [placementsMTD, setPlacementsMTD] = useState<number | null>(null);
  const [revenueMTD, setRevenueMTD] = useState<number | null>(null);
  const [cancelRate, setCancelRate] = useState<string>('0');
  const [recruitingCount, setRecruitingCount] = useState<number | null>(null);
  const [insights, setInsights] = useState<AgencyInsight[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  useEffect(() => {
    if (tasksSource === null) void loadLiveTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!portalSupabase) return;
      try {
        const [{ count: activeCount }, { count: recruitCount }] = await Promise.all([
          scopeToAgency(
            portalSupabase
              .from('agent_pipeline')
              .select('id', { count: 'exact', head: true })
              .not('stage', 'in', `(${ACTIVE_LEAD_EXCLUDED_STAGES.join(',')})`),
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
      }
    })();
  }, [isOrgWide, effectiveAgencyId]);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // Placements MTD — policies with effective date in current month
        const { count: placedCount } = await scopeToAgency(
          (supabase as any)
            .from('policy_cache')
            .select('policy_number', { count: 'exact', head: true })
            .gte('policy_effective_date', monthStart),
          isOrgWide,
          effectiveAgencyId
        );
        setPlacementsMTD(placedCount ?? 0);

        // Revenue MTD from monthly_production (current month, all agencies)
        const monthKey = monthStart.slice(0, 7);
        const { data: monthRows } = await scopeToAgency(
          (supabase as any)
            .from('monthly_production')
            .select('month, annual_premium')
            .eq('month', monthKey),
          isOrgWide,
          effectiveAgencyId
        );
        const revenue = (monthRows || []).reduce((s: number, r: any) => s + (Number(r.annual_premium) || 0), 0);
        setRevenueMTD(revenue);

        // Cancel rate — last 90 days
        const { count: totalRecent } = await scopeToAgency(
          (supabase as any)
            .from('policy_cache')
            .select('policy_number', { count: 'exact', head: true })
            .gte('policy_effective_date', ninetyDaysAgo),
          isOrgWide,
          effectiveAgencyId
        );
        const { count: terminatedRecent } = await scopeToAgency(
          (supabase as any)
            .from('policy_cache')
            .select('policy_number', { count: 'exact', head: true })
            .eq('status', 'terminated')
            .gte('policy_effective_date', ninetyDaysAgo),
          isOrgWide,
          effectiveAgencyId
        );
        const total = totalRecent ?? 0;
        const term = terminatedRecent ?? 0;
        setCancelRate(total > 0 ? ((term / total) * 100).toFixed(1) : '0');

        // Insights — top agencies by at-risk count
        const { data: retentionRows } = await scopeToAgency(
          (supabase as any)
            .from('agency_retention_summary')
            .select('agency_id, agency_name, at_risk_count, retention_pct')
            .order('at_risk_count', { ascending: false })
            .limit(3),
          isOrgWide,
          effectiveAgencyId
        );
        setInsights(
          (retentionRows || []).map((r: any) => ({
            agencyName: r.agency_name || 'Unknown Agency',
            atRiskCount: Number(r.at_risk_count) || 0,
            retentionPct: r.retention_pct !== null ? Number(r.retention_pct) : null,
          }))
        );
      } catch {
        setPlacementsMTD(0);
        setRevenueMTD(0);
        setCancelRate('0');
      }
    })();
  }, [isOrgWide, effectiveAgencyId]);

  useEffect(() => {
    (async () => {
      if (!portalSupabase) return;
      try {
        const { data } = await portalSupabase
          .from('activity_log')
          .select('id, action, details, created_at')
          .order('created_at', { ascending: false })
          .limit(20);
        setActivities((data as ActivityRow[]) || []);
      } catch {
        setActivities([]);
      }
    })();
  }, []);

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

  const persistencyPct = liveStats.configured ? (liveStats.loading ? '…' : liveStats.persistencyPct) : '—';

  const kpis = [
    { label: 'Active Leads', value: activeLeads === null ? '…' : activeLeads.toLocaleString(), icon: Target, color: 'text-sky-400', bg: 'bg-sky-400/10', live: true },
    { label: 'Placements MTD', value: placementsMTD === null ? '…' : placementsMTD.toLocaleString(), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10', live: true },
    { label: 'Revenue MTD', value: revenueMTD === null ? '…' : (revenueMTD > 0 ? `$${(revenueMTD / 1000).toFixed(1)}K` : '$0'), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10', live: true },
    { label: 'Cancel Rate', value: `${cancelRate}%`, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', live: true },
    { label: 'Persistency', value: persistencyPct, icon: Shield, color: 'text-sky-400', bg: 'bg-sky-400/10', live: liveStats.configured },
    {
      label: '90-Day Retention',
      value: liveStats.configured ? (liveStats.loading ? '…' : liveStats.retentionPct) : '—',
      icon: Users,
      color: retentionColor,
      bg: retentionBg,
      live: liveStats.configured,
    },
    { label: 'Recruiting Pipeline', value: recruitingCount === null ? '…' : recruitingCount.toLocaleString(), icon: UserPlus, color: 'text-sky-400', bg: 'bg-sky-400/10', live: true },
    { label: 'Tasks Overdue', value: overdueTasks.length.toString(), icon: Clock, color: overdueTasks.length > 0 ? 'text-red-400' : 'text-emerald-400', bg: overdueTasks.length > 0 ? 'bg-red-400/10' : 'bg-emerald-400/10', live: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time overview of all operations</p>
        </div>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <motion.div key={kpi.label} variants={item} className="glass rounded-xl p-4 glass-hover cursor-default">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2">{kpi.value}</p>
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
          {insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight, i) => (
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
              <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
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
              <Clock className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
