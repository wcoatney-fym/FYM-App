/**
 * Agent Detail — Overview Tab (§11.3.1)
 *
 * Two-column layout:
 * - Left: daily AP sparkline (production trend)
 * - Right: performance scorecard (vs goal, retention, attention items)
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, ShieldCheck, AlertTriangle,
  DollarSign, MessageSquarePlus,
} from 'lucide-react';
import type { AgentStats, PolicyRow, TrendPoint } from '../types';
import { fmt$, fmtNum, retentionColor } from '../helpers';
import type { DateRange } from '@/lib/dateUtils';
import { NoteList } from '@/components/notes/NoteDisplay';
import { ManagerNoteComposer } from '@/components/notes/ManagerNoteComposer';
import { fetchNotesForAgent, type ManagerNote } from '@/lib/notes-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

interface OverviewTabProps {
  stats: AgentStats;
  trend: TrendPoint[];
  policies: PolicyRow[];
  dateRange: DateRange;
}

export function OverviewTab({ stats, trend, policies, dateRange }: OverviewTabProps) {
  const { isAgent } = useEffectiveAuth();
  const [noteOpen, setNoteOpen] = useState(false);
  const [notes, setNotes] = useState<ManagerNote[]>([]);

  const agentWn = stats.writing_number || stats.agent_id;

  useEffect(() => {
    if (agentWn) fetchNotesForAgent(agentWn).then(setNotes);
  }, [agentWn]);
  const atRiskCount = policies.filter(p => p.is_at_risk).length;
  const avgAP = stats.active_policies > 0
    ? Number(stats.active_annual_premium) / stats.active_policies
    : 0;

  // Attention items in last 30d
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentAtRisk = policies.filter(p => {
    if (!p.is_at_risk) return false;
    if (!p.policy_effective_date) return true; // include if no date
    return new Date(p.policy_effective_date + 'T00:00:00') >= thirtyDaysAgo;
  }).length;

  return (
    <div className="grid lg:grid-cols-5 gap-4 mt-4">
      {/* ── Left: Daily AP sparkline (3 cols) ────────────────────────── */}
      <Card className="border-border lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            Production Trend — {dateRange.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              No production history yet
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
                    interval={trend.length > 15 ? Math.floor(trend.length / 10) : 0}
                    angle={trend.length > 12 ? -45 : 0}
                    textAnchor={trend.length > 12 ? 'end' : 'middle'}
                    height={trend.length > 12 ? 50 : 30}
                  />
                  <YAxis
                    yAxisId="ap"
                    orientation="left"
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
                    tickFormatter={v => fmt$(v)}
                  />
                  <YAxis
                    yAxisId="policies"
                    orientation="right"
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(217 33% 20%)',
                      background: 'hsl(222 47% 9%)',
                      color: 'hsl(210 40% 98%)',
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'ap' ? fmt$(value) : fmtNum(value),
                      name === 'ap' ? 'Annual Premium' : 'Policies',
                    ]}
                  />
                  <Bar
                    yAxisId="ap"
                    dataKey="ap"
                    fill="hsl(199 89% 48%)"
                    fillOpacity={0.3}
                    stroke="hsl(199 89% 48%)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="policies"
                    type="monotone"
                    dataKey="policies"
                    stroke="hsl(142 71% 45%)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'hsl(142 71% 45%)' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Right: Performance scorecard (2 cols) ────────────────────── */}
      <StaggerContainer className="lg:col-span-2 space-y-3">
        {/* Annual Premium */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Annual Premium (Active)</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{fmt$(Number(stats.active_annual_premium))}</p>
                <p className="text-[10px] text-muted-foreground/60">Avg {fmt$(avgAP)}/policy</p>
              </div>
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <DollarSign size={16} className="text-primary" />
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Retention */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">90-Day Retention</p>
                <p className={`text-lg font-bold mt-0.5 ${retentionColor(stats.retention_pct)}`}>
                  {stats.retention_pct !== null ? `${Number(stats.retention_pct).toFixed(1)}%` : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {stats.ever_drafted > 0 ? `${stats.retained_policies}/${stats.ever_drafted} retained` : 'No eligible drafts'}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <ShieldCheck size={16} className={retentionColor(stats.retention_pct)} />
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Attention Items */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Attention Items</p>
                <p className={`text-lg font-bold mt-0.5 ${atRiskCount > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                  {atRiskCount}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {recentAtRisk > 0 ? `${recentAtRisk} in last 30d` : 'None in last 30d'}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${atRiskCount > 0 ? 'bg-red-500/10' : 'bg-secondary'}`}>
                <AlertTriangle size={16} className={atRiskCount > 0 ? 'text-red-400' : 'text-muted-foreground/40'} />
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Manager Notes */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Manager Notes</p>
                {!isAgent && (
                  <button
                    onClick={() => setNoteOpen(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    <MessageSquarePlus size={12} /> Add note
                  </button>
                )}
              </div>
              <NoteList
                notes={notes}
                emptyMessage="No notes on this agent yet."
                onRefresh={() => fetchNotesForAgent(agentWn).then(setNotes)}
              />
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Active Book Stats */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Book Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground/60">Active</p>
                  <p className="text-sm font-bold text-emerald-400">{fmtNum(stats.active_policies)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground/60">Terminated</p>
                  <p className="text-sm font-bold text-zinc-400">{fmtNum(stats.terminated_policies)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground/60">Pending</p>
                  <p className="text-sm font-bold text-amber-400">{fmtNum(stats.pending_policies)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground/60">MTD Apps</p>
                  <p className="text-sm font-bold text-foreground">{fmtNum(stats.policies_this_month)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Note composer modal */}
      <ManagerNoteComposer
        open={noteOpen}
        onOpenChange={setNoteOpen}
        context={{
          agentWritingNumber: agentWn,
          agentName: stats.agent_name ?? undefined,
        }}
        onNoteCreated={() => fetchNotesForAgent(agentWn).then(setNotes)}
      />
    </div>
  );
}
