/**
 * PipelineHealth — Two-layer KPI strip for admin at-risk oversight.
 *
 * Layer 1: All At-Risk (from prod DB) — total flagged, premium exposure, by flag type
 * Layer 2: Pipeline (from atrisk_tasks) — cases being worked, stage distribution, save rate
 */
import { useMemo } from 'react';
import {
  AlertTriangle, ShieldAlert, Clock, TrendingUp,
  DollarSign, Users, Activity, Target,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AdminAtRiskPolicy } from './types';
import { STAGE_LABELS, ACTIVE_PIPELINE_STAGES } from './types';

interface PipelineHealthProps {
  policies: AdminAtRiskPolicy[];
  loading?: boolean;
}

function formatPremium(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return `$${Math.round(val)}`;
}

export function PipelineHealth({ policies, loading }: PipelineHealthProps) {
  const stats = useMemo(() => {
    // ── Layer 1: All at-risk (every policy from prod DB) ──
    const total = policies.length;
    const totalPremium = policies.reduce((s, p) => s + (p.plan_premium || 0), 0);

    // By flag type
    const flagCounts: Record<string, number> = {};
    for (const p of policies) {
      const ft = (p.flag_type || 'at_risk').toLowerCase();
      flagCounts[ft] = (flagCounts[ft] || 0) + 1;
    }

    // By product type
    const productCounts: Record<string, number> = {};
    for (const p of policies) {
      const pt = (p.product_type || 'Unknown').toUpperCase();
      productCounts[pt] = (productCounts[pt] || 0) + 1;
    }

    // Urgency tiers
    const critical = policies.filter(p => p.days_idle >= 30).length; // 30+ days overdue
    const warning = policies.filter(p => p.days_idle >= 15 && p.days_idle < 30).length;
    const early = policies.filter(p => p.days_idle < 15).length;

    // ── Layer 2: Pipeline (policies with atrisk_tasks rows) ──
    const inPipeline = policies.filter(p => p.task_stage !== null);
    const pipelineCount = inPipeline.length;
    const notInPipeline = total - pipelineCount;

    // Stage distribution
    const stageCounts: Record<string, number> = {};
    for (const p of inPipeline) {
      const stage = p.task_stage || 'new';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }

    const codeRed = stageCounts['code_red'] || 0;
    const saved = stageCounts['saved'] || 0;
    const lost = stageCounts['lost'] || 0;
    const resolved = saved + lost;
    const saveRate = resolved > 0 ? Math.round((saved / resolved) * 100) : 0;

    // Active = in pipeline but not resolved
    const activeInPipeline = inPipeline.filter(p =>
      ACTIVE_PIPELINE_STAGES.includes(p.task_stage || '')
    ).length;

    return {
      total, totalPremium, flagCounts, productCounts,
      critical, warning, early,
      pipelineCount, notInPipeline, stageCounts,
      codeRed, saved, lost, saveRate, activeInPipeline,
    };
  }, [policies]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 rounded-xl shimmer" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Layer 1: All At-Risk ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">All At-Risk Policies</h3>
            <p className="text-[11px] text-muted-foreground">
              Every flagged policy from production — regardless of pipeline status
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Total At-Risk */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Total At-Risk
                </span>
                <AlertTriangle size={16} className="text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground mt-1">flagged policies</p>
            </CardContent>
          </Card>

          {/* Premium at Risk */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Premium at Risk
                </span>
                <DollarSign size={16} className="text-rose-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{formatPremium(stats.totalPremium)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">annual</p>
            </CardContent>
          </Card>

          {/* Critical (30+ days) */}
          <Card className={cn('border-border bg-card/50', stats.critical > 0 && 'border-rose-500/30')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Critical (30d+)
                </span>
                <ShieldAlert size={16} className="text-rose-400" />
              </div>
              <p className={cn('text-2xl font-bold', stats.critical > 0 ? 'text-rose-400' : 'text-foreground')}>
                {stats.critical}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">30+ days overdue</p>
            </CardContent>
          </Card>

          {/* Warning (15-29 days) */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Warning (15-29d)
                </span>
                <Clock size={16} className="text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stats.warning}</p>
              <p className="text-[10px] text-muted-foreground mt-1">15-29 days overdue</p>
            </CardContent>
          </Card>

          {/* Early (< 15 days) */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Early (&lt;15d)
                </span>
                <Activity size={16} className="text-sky-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stats.early}</p>
              <p className="text-[10px] text-muted-foreground mt-1">under 15 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Flag type breakdown strip */}
        {Object.keys(stats.flagCounts).length > 0 && (
          <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/70">By flag:</span>
            {Object.entries(stats.flagCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([flag, count]) => (
                <span key={flag} className="flex items-center gap-1">
                  <span className={cn(
                    'inline-block w-2 h-2 rounded-full',
                    flag === 'at_risk' && 'bg-amber-400',
                    flag === 'future_term' && 'bg-purple-400',
                    flag === 'pended' && 'bg-sky-400',
                    flag === 'suspended' && 'bg-rose-400',
                    !['at_risk', 'future_term', 'pended', 'suspended'].includes(flag) && 'bg-zinc-400',
                  )} />
                  {flag.replace(/_/g, ' ')}: {count}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ── Layer 2: Pipeline Status ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-sky-500/10">
            <Target size={16} className="text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Pipeline Status</h3>
            <p className="text-[11px] text-muted-foreground">
              Cases actively being worked in the at-risk pipeline
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* In Pipeline */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  In Pipeline
                </span>
                <Users size={16} className="text-sky-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stats.pipelineCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {stats.activeInPipeline} active · {stats.notInPipeline} untracked
              </p>
            </CardContent>
          </Card>

          {/* Code Red */}
          <Card className={cn('border-border bg-card/50', stats.codeRed > 0 && 'border-rose-500/30')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Code Red
                </span>
                <ShieldAlert size={16} className="text-rose-400" />
              </div>
              <p className={cn('text-2xl font-bold', stats.codeRed > 0 ? 'text-rose-400' : 'text-foreground')}>
                {stats.codeRed}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">escalated cases</p>
            </CardContent>
          </Card>

          {/* Unworked (not in pipeline) */}
          <Card className={cn('border-border bg-card/50', stats.notInPipeline > 0 && 'border-amber-500/30')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Unworked
                </span>
                <Clock size={16} className="text-amber-400" />
              </div>
              <p className={cn('text-2xl font-bold', stats.notInPipeline > 0 ? 'text-amber-400' : 'text-foreground')}>
                {stats.notInPipeline}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">no pipeline action</p>
            </CardContent>
          </Card>

          {/* Save Rate */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Save Rate
                </span>
                <TrendingUp size={16} className="text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stats.saveRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {stats.saved} saved · {stats.lost} lost
              </p>
            </CardContent>
          </Card>

          {/* Saved */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Saved
                </span>
                <TrendingUp size={16} className="text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-400">{stats.saved}</p>
              <p className="text-[10px] text-muted-foreground mt-1">policies retained</p>
            </CardContent>
          </Card>
        </div>

        {/* Stage distribution bar */}
        {stats.pipelineCount > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pipeline Distribution
            </div>
            <div className="flex h-6 rounded-lg overflow-hidden border border-border">
              {Object.entries(stats.stageCounts)
                .sort(([a], [b]) => {
                  const order = ['new', 'responded', 'manager_outreach', 'agent_outreach', 'code_red', 'agent_saved_pending', 'saved', 'lost'];
                  return order.indexOf(a) - order.indexOf(b);
                })
                .map(([stage, count]) => {
                  const pct = (count / stats.pipelineCount) * 100;
                  if (pct < 1) return null;
                  return (
                    <div
                      key={stage}
                      style={{ width: `${pct}%` }}
                      className={cn(
                        'flex items-center justify-center text-[9px] font-bold text-white/90 transition-all',
                        stage === 'new' && 'bg-zinc-500',
                        stage === 'responded' && 'bg-sky-500',
                        stage === 'manager_outreach' && 'bg-indigo-500',
                        stage === 'agent_outreach' && 'bg-amber-500',
                        stage === 'code_red' && 'bg-rose-500',
                        stage === 'agent_saved_pending' && 'bg-purple-500',
                        stage === 'saved' && 'bg-emerald-500',
                        stage === 'lost' && 'bg-zinc-700',
                      )}
                      title={`${STAGE_LABELS[stage] || stage}: ${count}`}
                    >
                      {pct >= 8 ? `${STAGE_LABELS[stage] || stage} (${count})` : count}
                    </div>
                  );
                })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
              {Object.entries(stats.stageCounts)
                .sort(([a], [b]) => {
                  const order = ['new', 'responded', 'manager_outreach', 'agent_outreach', 'code_red', 'agent_saved_pending', 'saved', 'lost'];
                  return order.indexOf(a) - order.indexOf(b);
                })
                .map(([stage, count]) => (
                  <span key={stage} className="flex items-center gap-1">
                    <span className={cn(
                      'inline-block w-2 h-2 rounded-full',
                      stage === 'new' && 'bg-zinc-500',
                      stage === 'responded' && 'bg-sky-500',
                      stage === 'manager_outreach' && 'bg-indigo-500',
                      stage === 'agent_outreach' && 'bg-amber-500',
                      stage === 'code_red' && 'bg-rose-500',
                      stage === 'agent_saved_pending' && 'bg-purple-500',
                      stage === 'saved' && 'bg-emerald-500',
                      stage === 'lost' && 'bg-zinc-700',
                    )} />
                    {STAGE_LABELS[stage] || stage}: {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        {stats.pipelineCount === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground border border-border rounded-xl mt-3">
            No cases in the pipeline yet.
          </div>
        )}
      </div>
    </div>
  );
}
