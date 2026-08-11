
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  ShieldCheck, AlertTriangle, XCircle, TrendingDown,
  CheckCircle2, Target,
} from 'lucide-react';
import { fmt$, fmtPct, retentionColor } from '@/lib/formatUtils';
import type { AgentCoachingFlag } from './AgentCoachingTable';

interface AgentCoachingStatusProps {
  /** The agent's own coaching flag data (null if not found / loading) */
  agentData: AgentCoachingFlag | null;
  loading: boolean;
}

export function AgentCoachingStatus({ agentData, loading }: AgentCoachingStatusProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => <div key={i} className="h-24 rounded-lg shimmer" />)}
      </div>
    );
  }

  if (!agentData) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-3">
          <Target size={24} className="text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-foreground/70">No coaching data available</p>
        <p className="text-xs text-muted-foreground mt-1">
          Your book doesn't have enough eligible policies for threshold evaluation yet.
        </p>
      </div>
    );
  }

  const { needs_coaching, flag_retention, flag_at_risk, flag_terminated } = agentData;

  return (
    <div className="space-y-5">
      {/* Overall status banner */}
      {needs_coaching ? (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
              <AlertTriangle size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Coaching Alert</p>
              <p className="text-xs text-muted-foreground mt-1">
                One or more of your book metrics are below the team's quality thresholds.
                Your manager may reach out to work with you on improving these numbers.
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                {flag_retention && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/30">
                    <TrendingDown size={10} className="mr-1" />
                    Retention below {agentData.threshold_retention}%
                  </Badge>
                )}
                {flag_at_risk && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <AlertTriangle size={10} className="mr-1" />
                    At-risk above {agentData.threshold_at_risk}%
                  </Badge>
                )}
                {flag_terminated && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <XCircle size={10} className="mr-1" />
                    Terminated above {agentData.threshold_terminated}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">All Clear</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your book metrics are within all coaching thresholds. Keep up the good work.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metric cards */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Retention */}
        <StaggerItem>
          <HudFrame accentColor={
            agentData.retention_pct === null ? 'hsl(215 20% 55%)' :
            agentData.retention_pct >= 90 ? 'hsl(142 71% 45%)' :
            agentData.retention_pct >= 85 ? 'hsl(38 92% 50%)' :
            'hsl(0 84% 60%)'
          }>
            <Card className="border-border h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">90-Day Retention</p>
                    <span className={`text-xl font-bold font-data mt-0.5 block ${retentionColor(agentData.retention_pct)}`}>
                      {fmtPct(agentData.retention_pct)}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {agentData.retained_90d} of {agentData.eligible_90d} eligible
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${flag_retention ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                    {flag_retention
                      ? <TrendingDown size={16} className="text-red-400" />
                      : <ShieldCheck size={16} className="text-emerald-400" />}
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Threshold: ≥ {agentData.threshold_retention}%
                </div>
              </CardContent>
            </Card>
          </HudFrame>
        </StaggerItem>

        {/* At-Risk */}
        <StaggerItem>
          <HudFrame accentColor={
            flag_at_risk ? 'hsl(38 92% 50%)' : 'hsl(142 71% 45%)'
          }>
            <Card className="border-border h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">At-Risk Rate</p>
                    <span className={`text-xl font-bold font-data mt-0.5 block ${
                      flag_at_risk ? 'text-amber-400' : 'text-foreground'
                    }`}>
                      {fmtPct(agentData.at_risk_pct)}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {agentData.at_risk_count} of {agentData.active_policies} active
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${flag_at_risk ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                    {flag_at_risk
                      ? <AlertTriangle size={16} className="text-amber-400" />
                      : <ShieldCheck size={16} className="text-emerald-400" />}
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Threshold: ≤ {agentData.threshold_at_risk}%
                </div>
              </CardContent>
            </Card>
          </HudFrame>
        </StaggerItem>

        {/* Terminated */}
        <StaggerItem>
          <HudFrame accentColor={
            flag_terminated ? 'hsl(0 84% 60%)' : 'hsl(142 71% 45%)'
          }>
            <Card className="border-border h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Terminated Rate</p>
                    <span className={`text-xl font-bold font-data mt-0.5 block ${
                      flag_terminated ? 'text-red-400' : 'text-foreground'
                    }`}>
                      {fmtPct(agentData.terminated_pct)}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {agentData.terminated_policies} of {agentData.total_policies} total
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${flag_terminated ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                    {flag_terminated
                      ? <XCircle size={16} className="text-red-400" />
                      : <ShieldCheck size={16} className="text-emerald-400" />}
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Threshold: ≤ {agentData.threshold_terminated}%
                </div>
              </CardContent>
            </Card>
          </HudFrame>
        </StaggerItem>
      </StaggerContainer>

      {/* Book summary */}
      <Card className="border-border">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">Your Book Summary</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Active Policies</span>
              <p className="font-data font-medium text-foreground">{agentData.active_policies}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Terminated</span>
              <p className="font-data font-medium text-foreground">{agentData.terminated_policies}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">At-Risk Count</span>
              <p className={`font-data font-medium ${agentData.at_risk_count > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                {agentData.at_risk_count}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Annual Premium</span>
              <p className="font-data font-medium text-foreground">{fmt$(agentData.annual_premium ?? 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
