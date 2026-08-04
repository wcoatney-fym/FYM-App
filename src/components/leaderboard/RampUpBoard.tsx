/**
 * RampUpBoard — Dedicated view for agents in their first 90 days.
 *
 * Per PRD prototype: "5 in Ramp Up" badge, separate board showing
 * new agents with their days-since-first-app, app count, AP pacing,
 * and mentorship status.
 *
 * Ramp Up criteria: agent's first policy issue_date within last 90 days.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { Rocket, TrendingUp, Clock, Target, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RampUpAgent {
  agent_id: string;
  agent_name: string | null;
  agency_name: string | null;
  first_app_date: string;
  days_active: number;
  total_apps: number;
  total_ap: number;
  avg_ap_per_app: number;
  retention_pct: number | null;
  at_risk_count: number;
}

interface RampUpBoardProps {
  agents: RampUpAgent[];
  loading?: boolean;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function paceLabel(daysActive: number, apps: number): { text: string; color: string } {
  if (daysActive < 7) return { text: 'Just started', color: 'text-muted-foreground' };
  const appsPerWeek = apps / (daysActive / 7);
  if (appsPerWeek >= 5) return { text: 'Strong pace', color: 'text-emerald-400' };
  if (appsPerWeek >= 2) return { text: 'Building', color: 'text-amber-400' };
  return { text: 'Needs support', color: 'text-red-400' };
}

function daysLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function RampUpBoard({ agents, loading }: RampUpBoardProps) {
  const sorted = useMemo(() =>
    [...agents].sort((a, b) => b.total_ap - a.total_ap),
    [agents],
  );

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded shimmer" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sorted.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center">
          <Rocket size={32} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No agents in Ramp Up right now</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Agents appear here within their first 90 days of writing
          </p>
        </CardContent>
      </Card>
    );
  }

  // Stats
  const totalAP = sorted.reduce((s, a) => s + a.total_ap, 0);
  const totalApps = sorted.reduce((s, a) => s + a.total_apps, 0);
  const avgDays = Math.round(sorted.reduce((s, a) => s + a.days_active, 0) / sorted.length);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Rocket size={16} className="text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">In Ramp Up</p>
                <p className="text-lg font-bold text-foreground">{sorted.length}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <TrendingUp size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ramp AP</p>
                <p className="text-lg font-bold text-foreground">{fmt$(totalAP)}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Target size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Apps</p>
                <p className="text-lg font-bold text-foreground">{totalApps}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary">
                <Clock size={16} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Avg Days Active</p>
                <p className="text-lg font-bold text-foreground">{avgDays}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Agent cards */}
      <StaggerContainer className="space-y-2">
        {sorted.map((agent, i) => {
          const pace = paceLabel(agent.days_active, agent.total_apps);
          return (
            <StaggerItem key={agent.agent_id}>
              <Card className={cn(
                'border-border transition-colors hover:bg-background/80',
                i < 3 && 'border-l-[3px] border-l-purple-500/50',
              )}>
                <CardContent className="p-4 flex items-center gap-4">
                  {/* Rank */}
                  <div className="w-8 text-center flex-shrink-0">
                    {i === 0 ? (
                      <Star size={18} className="text-purple-400 mx-auto" />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground/60 tabular-nums">
                        #{i + 1}
                      </span>
                    )}
                  </div>

                  {/* Agent info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground truncate">
                        {agent.agent_name || agent.agent_id}
                      </span>
                      <span className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                        'bg-purple-500/10 text-purple-400',
                      )}>
                        <Rocket size={10} className="mr-0.5" />
                        Day {agent.days_active}
                      </span>
                      <span className={cn(
                        'text-[10px] font-semibold',
                        pace.color,
                      )}>
                        {pace.text}
                      </span>
                    </div>
                    {agent.agency_name && (
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                        {agent.agency_name}
                      </p>
                    )}
                  </div>

                  {/* Apps */}
                  <div className="text-center flex-shrink-0 w-16">
                    <div className="font-bold text-sm tabular-nums text-foreground">{agent.total_apps}</div>
                    <div className="text-[10px] text-muted-foreground/50">apps</div>
                  </div>

                  {/* AP */}
                  <div className="text-right flex-shrink-0 w-20">
                    <div className="font-bold text-sm tabular-nums text-foreground">{fmt$(agent.total_ap)}</div>
                    <div className="text-[10px] text-muted-foreground/50">
                      avg {fmt$(agent.avg_ap_per_app)}/app
                    </div>
                  </div>

                  {/* Retention */}
                  <div className="text-center flex-shrink-0 w-16">
                    <div className={cn(
                      'text-sm font-bold tabular-nums',
                      agent.retention_pct === null ? 'text-muted-foreground/40'
                        : agent.retention_pct >= 90 ? 'text-emerald-400'
                        : agent.retention_pct >= 85 ? 'text-amber-400'
                        : 'text-red-400',
                    )}>
                      {agent.retention_pct !== null ? `${agent.retention_pct.toFixed(0)}%` : '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50">retention</div>
                  </div>

                  {/* At-risk */}
                  <div className="text-center flex-shrink-0 w-12">
                    <div className={cn(
                      'text-sm font-bold tabular-nums',
                      agent.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/40',
                    )}>
                      {agent.at_risk_count || '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50">at-risk</div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </div>
  );
}
