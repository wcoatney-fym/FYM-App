/**
 * HeroPodium — Top 3 agents displayed as large hero cards
 * with gold/silver/bronze accents. The #1 card is elevated
 * and centered, flanked by #2 and #3.
 *
 * Design: bold rank numbers, agent name, premium, policies,
 * and retention front and center. #1 gets a gold accent border
 * and slightly larger treatment.
 */
import { cn } from '@/lib/utils';
import { fmt$ } from '@/lib/formatUtils';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { Crown, TrendingUp, AlertTriangle } from 'lucide-react';

export interface PodiumAgent {
  agent_id: string;
  agent_name: string | null;
  agency_name: string | null;
  active_policies: number;
  active_annual_premium: number;
  retention_pct: number | null;
  at_risk_policies: number;
  avg_annual_premium: number;
  /** Position change vs prior period: +2 means climbed 2 spots */
  movement?: number;
}

interface HeroPodiumProps {
  agents: PodiumAgent[];
  loading?: boolean;
}

const podiumConfig = [
  {
    rank: 1,
    accent: 'from-amber-500/30 to-amber-600/10',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/10',
    badge: 'bg-gradient-to-br from-amber-400 to-amber-600 text-black',
    label: 'text-amber-400',
    order: 'order-2', // center
    size: 'lg:scale-105',
  },
  {
    rank: 2,
    accent: 'from-slate-300/20 to-slate-400/5',
    border: 'border-slate-400/30',
    glow: 'shadow-slate-400/5',
    badge: 'bg-gradient-to-br from-slate-300 to-slate-500 text-black',
    label: 'text-slate-300',
    order: 'order-1', // left
    size: '',
  },
  {
    rank: 3,
    accent: 'from-orange-600/20 to-orange-700/5',
    border: 'border-orange-600/30',
    glow: 'shadow-orange-600/5',
    badge: 'bg-gradient-to-br from-orange-500 to-orange-700 text-black',
    label: 'text-orange-400',
    order: 'order-3', // right
    size: '',
  },
];

function retColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function movementIndicator(movement?: number) {
  if (movement === undefined || movement === 0) return null;
  if (movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-400">
        <TrendingUp size={12} />↑{movement}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-red-400">
      ↓{Math.abs(movement)}
    </span>
  );
}

export function HeroPodium({ agents, loading }: HeroPodiumProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={cn(
              'h-52 rounded-xl shimmer',
              i === 0 ? 'order-2 lg:h-60' : i === 1 ? 'order-1' : 'order-3',
            )}
          />
        ))}
      </div>
    );
  }

  if (agents.length === 0) return null;

  // Pad to 3 if we have fewer
  const padded = [...agents];
  while (padded.length < 3) padded.push(null as any);

  return (
    <StaggerContainer className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
      {padded.map((agent, i) => {
        if (!agent) return <div key={i} className={podiumConfig[i]?.order} />;
        const config = podiumConfig[i];
        const isChamp = i === 0;

        return (
          <StaggerItem key={agent.agent_id} className={cn(config.order, config.size)}>
            <div
              className={cn(
                'relative rounded-xl border p-5 transition-all',
                'bg-gradient-to-b',
                config.accent,
                config.border,
                isChamp && 'shadow-lg',
                config.glow,
              )}
            >
              {/* Rank badge */}
              <div className="flex items-start justify-between mb-4">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg',
                    config.badge,
                  )}
                >
                  {config.rank}
                </div>
                {isChamp && <Crown size={20} className="text-amber-400 mt-1" />}
                {movementIndicator(agent.movement)}
              </div>

              {/* Agent name */}
              <h3
                className={cn(
                  'font-bold truncate',
                  isChamp ? 'text-lg' : 'text-base',
                  'text-foreground',
                )}
              >
                {agent.agent_name ?? agent.agent_id.slice(0, 12)}
              </h3>
              {agent.agency_name && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {agent.agency_name}
                </p>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Premium
                  </p>
                  <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                    {fmt$(agent.active_annual_premium)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Policies
                  </p>
                  <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                    {agent.active_policies}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Retention
                  </p>
                  <p className={cn('text-lg font-bold tabular-nums mt-0.5', retColor(agent.retention_pct))}>
                    {agent.retention_pct !== null ? `${agent.retention_pct}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Avg AP
                  </p>
                  <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                    {fmt$(agent.avg_annual_premium)}
                  </p>
                </div>
              </div>

              {/* At-risk flag */}
              {agent.at_risk_policies > 0 && (
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/30 text-xs text-red-400">
                  <AlertTriangle size={12} />
                  <span className="font-medium">{agent.at_risk_policies} at-risk</span>
                </div>
              )}
            </div>
          </StaggerItem>
        );
      })}
    </StaggerContainer>
  );
}
