import { motion } from 'framer-motion';
import {
  Users, DollarSign, TrendingUp, AlertTriangle,
  Shield, Target, UserPlus, Clock, Bot, Plus, Zap
} from 'lucide-react';
import { useTasksStore, usePipelineStore, useSettingsStore } from '@/stores/cc-stores';
import { formatDistanceToNow } from 'date-fns';
import { generateInsights } from '@/lib/command-center/clawdbot-ai';
import { useDashboardStats } from '@/lib/command-center/use-dashboard-stats';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function CcDashboardTab() {
  const tasks = useTasksStore((s) => s.tasks);
  const placements = usePipelineStore((s) => s.placements);
  const cancellations = usePipelineStore((s) => s.cancellations);
  const retentionAgents = usePipelineStore((s) => s.retentionAgents);
  const recruitingFollowUp = usePipelineStore((s) => s.recruitingFollowUp);
  const revenue = usePipelineStore((s) => s.revenue);
  const activities = useSettingsStore((s) => s.activities);
  const mockEnabled = useSettingsStore((s) => s.mockDataEnabled);

  const liveStats = useDashboardStats();

  const overdueTasks = tasks.filter((t) => new Date(t.dueDate) < new Date() && t.status !== 'done');
  const placedCount = placements.filter((p) => p.status === 'placed').length;
  const revenueMTD = revenue.reduce((sum, r) => sum + r.actual, 0);
  const cancelRate = cancellations.length > 0
    ? ((cancellations.filter(c => !c.saved).length / cancellations.length) * 100).toFixed(1)
    : '0';
  const activeAgents = retentionAgents.filter(a => !a.atRisk).length;
  const totalAgents = retentionAgents.length;
  const persistencyPct = totalAgents > 0 ? ((activeAgents / totalAgents) * 100).toFixed(0) : '0';
  const recruitingCount = recruitingFollowUp.length;

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

  const kpis = [
    { label: 'Active Leads', value: mockEnabled ? '557' : '0', icon: Target, color: 'text-sky-400', bg: 'bg-sky-400/10', live: false },
    { label: 'Placements MTD', value: placedCount.toString(), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10', live: false },
    { label: 'Revenue MTD', value: revenueMTD > 0 ? `$${(revenueMTD / 1000).toFixed(1)}K` : '$0', icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10', live: false },
    { label: 'Cancel Rate', value: `${cancelRate}%`, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', live: false },
    { label: 'Persistency', value: `${persistencyPct}%`, icon: Shield, color: 'text-sky-400', bg: 'bg-sky-400/10', live: false },
    {
      label: '90-Day Retention',
      value: liveStats.configured ? (liveStats.loading ? '…' : liveStats.retentionPct) : (mockEnabled ? '94.2%' : '0%'),
      icon: Users,
      color: retentionColor,
      bg: retentionBg,
      live: liveStats.configured,
    },
    { label: 'Recruiting Pipeline', value: recruitingCount.toString(), icon: UserPlus, color: 'text-sky-400', bg: 'bg-sky-400/10', live: false },
    { label: 'Tasks Overdue', value: overdueTasks.length.toString(), icon: Clock, color: overdueTasks.length > 0 ? 'text-red-400' : 'text-emerald-400', bg: overdueTasks.length > 0 ? 'bg-red-400/10' : 'bg-emerald-400/10', live: false },
  ];

  const insights = mockEnabled ? generateInsights() : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time overview of all operations</p>
        </div>
        <button
          onClick={() => {}}
          className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-background text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Quick Add Task
        </button>
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
            <h2 className="text-sm font-semibold">ClawdBot Insights</h2>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          {insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {liveStats.configured
                  ? 'Live retention data loaded above. AI insights coming in Phase 2.'
                  : 'Load mock data to see AI-generated insights'}
              </p>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2 glass rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Recent Activity</h2>
          {activities.length > 0 ? (
            <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    activity.type === 'task' ? 'bg-sky-400' :
                    activity.type === 'pipeline' ? 'bg-emerald-400' :
                    activity.type === 'chat' ? 'bg-primary' :
                    activity.type === 'team' ? 'bg-amber-400' :
                    'bg-muted-foreground'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 leading-relaxed">{activity.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
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
