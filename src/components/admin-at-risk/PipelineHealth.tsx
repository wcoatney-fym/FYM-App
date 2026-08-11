/**
 * PipelineHealth — Admin overview KPI strip + stage distribution bar.
 *
 * Shows total at-risk, Code Red count, premium at risk, save rate,
 * and a horizontal stacked bar showing the distribution across pipeline stages.
 */
import { useMemo } from 'react';
import {
  AlertTriangle, ShieldAlert, DollarSign, TrendingUp, Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { cn } from '@/lib/utils';
import type { PipelinePolicy } from './types';

interface PipelineHealthProps {
  policies: PipelinePolicy[];
  loading?: boolean;
}

const STAGE_CONFIG: { key: string; label: string; color: string; barColor: string }[] = [
  { key: 'new', label: 'New', color: 'text-slate-400', barColor: 'bg-slate-500' },
  { key: 'responded', label: 'Responded', color: 'text-sky-400', barColor: 'bg-sky-500' },
  { key: 'manager_outreach', label: 'Manager', color: 'text-amber-400', barColor: 'bg-amber-500' },
  { key: 'agent_outreach', label: 'Agent', color: 'text-violet-400', barColor: 'bg-violet-500' },
  { key: 'code_red', label: 'Code Red', color: 'text-red-400', barColor: 'bg-red-500' },
  { key: 'agent_saved_pending', label: 'Pending', color: 'text-teal-400', barColor: 'bg-teal-500' },
  { key: 'saved', label: 'Saved', color: 'text-emerald-400', barColor: 'bg-emerald-500' },
  { key: 'lost', label: 'Lost', color: 'text-rose-400', barColor: 'bg-rose-500' },
];

export function PipelineHealth({ policies, loading }: PipelineHealthProps) {
  const stats = useMemo(() => {
    const total = policies.length;
    const codeRed = policies.filter(p => p.days_since_draft >= 30).length;
    const heatingUp = policies.filter(p => p.days_since_draft >= 14 && p.days_since_draft < 30).length;
    const saved = policies.filter(p => (p.task_status || 'new') === 'saved').length;
    const lost = policies.filter(p => (p.task_status || 'new') === 'lost').length;
    const unworked = policies.filter(p => !p.task_status || p.task_status === 'new').length;
    const resolved = saved + lost;
    const saveRate = resolved > 0 ? (saved / resolved) * 100 : 0;
    const premiumAtRisk = policies.reduce((s, p) => s + (Number(p.plan_premium) || 0) * 12, 0);

    // Stage distribution
    const stageCounts = new Map<string, number>();
    for (const p of policies) {
      const s = p.task_status || 'new';
      stageCounts.set(s, (stageCounts.get(s) || 0) + 1);
    }

    return {
      total, codeRed, heatingUp, saved, lost, unworked, saveRate, premiumAtRisk,
      stageCounts,
    };
  }, [policies]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 rounded-xl shimmer" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Total At-Risk</p>
                  <CountUp end={stats.total} className="text-2xl font-bold text-foreground mt-0.5 block" />
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <AlertTriangle size={16} className="text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Code Red</p>
                  <CountUp end={stats.codeRed} className="text-2xl font-bold text-red-400 mt-0.5 block" />
                  <p className="text-[10px] text-muted-foreground">30+ days idle</p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <ShieldAlert size={16} className="text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Unworked</p>
                  <CountUp end={stats.unworked} className="text-2xl font-bold text-slate-400 mt-0.5 block" />
                  <p className="text-[10px] text-muted-foreground">no action taken</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-500/10">
                  <Clock size={16} className="text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Save Rate</p>
                  <CountUp
                    end={stats.saveRate}
                    format={(n: number) => `${n.toFixed(0)}%`}
                    className={cn(
                      'text-2xl font-bold mt-0.5 block',
                      stats.saveRate >= 70 ? 'text-emerald-400' :
                      stats.saveRate >= 40 ? 'text-amber-400' : 'text-red-400'
                    )}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {stats.saved} saved · {stats.lost} lost
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp size={16} className="text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Premium at Risk</p>
                  <CountUp
                    end={stats.premiumAtRisk}
                    format={(n: number) => `$${Math.round(n).toLocaleString()}`}
                    className="text-2xl font-bold text-foreground mt-0.5 block"
                  />
                  <p className="text-[10px] text-muted-foreground">annual</p>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <DollarSign size={16} className="text-rose-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Stage distribution bar */}
      <Card className="border-border">
        <CardContent className="p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Pipeline Distribution
          </p>

          {/* Stacked bar */}
          {stats.total > 0 && (
            <div className="flex h-3 rounded-full overflow-hidden bg-muted/30 mb-3">
              {STAGE_CONFIG.map(({ key, barColor }) => {
                const count = stats.stageCounts.get(key) || 0;
                if (count === 0) return null;
                const pct = (count / stats.total) * 100;
                return (
                  <div
                    key={key}
                    className={cn('h-full transition-all', barColor)}
                    style={{ width: `${pct}%` }}
                    title={`${STAGE_CONFIG.find(s => s.key === key)?.label}: ${count}`}
                  />
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STAGE_CONFIG.map(({ key, label, color }) => {
              const count = stats.stageCounts.get(key) || 0;
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={cn('text-[11px] font-semibold', color)}>{count}</span>
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
