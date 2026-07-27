/**
 * PipelineSummaryBar — collapsible overview bar above the kanban board.
 * Shows pipeline distribution + pending review alerts.
 * Ported from CRM Portal, adapted to FYM App design language.
 */
import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  Bell,
  PenLine,
  FileCheck,
  FileSignature,
} from 'lucide-react';
import type {
  PortalPipelineRecord,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { STAGES } from './PipelineBoard';

const AGENT_COMPLETABLE_KEYS: Record<
  string,
  { label: string; icon: typeof PenLine; stage: string }
> = {
  iaa_signed_by_agent: { label: 'IAA Signed', icon: FileSignature, stage: 'iaa' },
  bill_com_done_by_agent: { label: 'Bill.com Done', icon: FileCheck, stage: 'bill_com' },
};

interface PipelineSummaryBarProps {
  records: PortalPipelineRecord[];
  stageSteps: PortalPipelineStageStep[];
}

export function PipelineSummaryBar({ records, stageSteps }: PipelineSummaryBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const { stageCounts, maxCount, totalAgents, pendingReviews } = useMemo(() => {
    const counts = new Map<string, number>();
    let max = 0;
    for (const stage of STAGES) {
      const count = records.filter((r) => r.stage === stage.key).length;
      counts.set(stage.key, count);
      if (count > max) max = count;
    }

    const reviews: {
      key: string;
      label: string;
      count: number;
      icon: typeof PenLine;
      stage: string;
    }[] = [];

    const wnPending = records.filter(
      (r) => r.wn_pending_review && r.wn_pending_count > 0
    );
    const wnTotal = wnPending.reduce((sum, r) => sum + r.wn_pending_count, 0);
    if (wnTotal > 0) {
      reviews.push({
        key: 'wn',
        label: 'Writing Numbers',
        count: wnTotal,
        icon: PenLine,
        stage: '',
      });
    }

    for (const [stepKey, meta] of Object.entries(AGENT_COMPLETABLE_KEYS)) {
      const agentsWithStep = records.filter((r) => {
        const completed = r.completed_steps as Record<string, string> | null;
        return completed && stepKey in completed && r.stage === meta.stage;
      });
      if (agentsWithStep.length > 0) {
        reviews.push({
          key: stepKey,
          label: meta.label,
          count: agentsWithStep.length,
          icon: meta.icon,
          stage: meta.stage,
        });
      }
    }

    return {
      stageCounts: counts,
      maxCount: max,
      totalAgents: records.length,
      pendingReviews: reviews,
    };
  }, [records, stageSteps]);

  const totalPendingReviews = pendingReviews.reduce(
    (sum, r) => sum + r.count,
    0
  );

  return (
    <div className="bg-card rounded-xl border border-border glow-sm mb-4 overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-background/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-foreground">Pipeline Overview</h3>
            <p className="text-[11px] text-muted-foreground">
              {totalAgents} agent{totalAgents !== 1 ? 's' : ''} across{' '}
              {STAGES.length} stages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalPendingReviews > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
              <Bell className="w-3 h-3" />
              {totalPendingReviews} pending review
              {totalPendingReviews !== 1 ? 's' : ''}
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground/70" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/50">
          <div className="pt-3 space-y-1.5">
            {STAGES.map((stage) => {
              const count = stageCounts.get(stage.key) || 0;
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              const isTerminated = stage.key === 'terminated';
              const isReady =
                stage.key === 'hip_broker_ready' ||
                stage.key === 'hip_career_ready';
              const isActive = stage.key === 'actively_selling';

              const stageReviews = pendingReviews.filter(
                (r) => r.stage === stage.key
              );
              const stageWn = records.filter(
                (r) =>
                  r.stage === stage.key &&
                  r.wn_pending_review &&
                  r.wn_pending_count > 0
              ).length;

              return (
                <div key={stage.key} className="flex items-center gap-2 group">
                  <div className="w-[140px] flex-shrink-0 text-right pr-2">
                    <span className="text-[11px] font-medium text-muted-foreground truncate block">
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="flex-1 bg-secondary/40 rounded-full h-5 overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2 ${
                          isTerminated
                            ? 'bg-red-400'
                            : isReady
                              ? 'bg-emerald-400'
                              : isActive
                                ? 'bg-amber-400'
                                : 'bg-primary'
                        }`}
                        style={{
                          width:
                            count > 0 ? `${Math.max(pct, 8)}%` : '0%',
                        }}
                      >
                        {count > 0 && pct > 15 && (
                          <span className="text-[10px] font-bold text-white">
                            {count}
                          </span>
                        )}
                      </div>
                      {count > 0 && pct <= 15 && (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground ml-[calc(8%+4px)]">
                          {count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {stageReviews.map((rev) => {
                        const Icon = rev.icon;
                        return (
                          <span
                            key={rev.key}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold"
                            title={`${rev.count} ${rev.label} — pending approval`}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {rev.count}
                          </span>
                        );
                      })}
                      {stageWn > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold"
                          title={`${stageWn} agent(s) with writing numbers pending review`}
                        >
                          <PenLine className="w-2.5 h-2.5" />
                          {stageWn}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pendingReviews.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
              {pendingReviews.map((rev) => {
                const Icon = rev.icon;
                return (
                  <div
                    key={rev.key}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
                  >
                    <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-300">
                        {rev.count} {rev.label}
                      </p>
                      <p className="text-[10px] text-amber-400">
                        Pending approval
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
