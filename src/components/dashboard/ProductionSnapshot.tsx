/**
 * ProductionSnapshot — Status breakdown card showing policy counts & premium.
 *
 * Extracted from DashboardPage for maintainability (Section 4 of UX audit).
 * Includes accessibility improvements: semantic regions, aria-labels.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/animated';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { DeltaBadge } from '@/components/ui/delta-badge';
import {
  LineChart,
  Line,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrendPoint } from '@/lib/dateUtils';

interface PrevSnapshot {
  totalWritten: number;
  totalAP: number;
  active: number;
  atRisk: number;
  terminated: number;
}

interface ProductionSnapshotProps {
  snapshot: {
    totalWritten: number;
    totalAP: number;
    active: number;
    activeAP: number;
    pending: number;
    pendingAP: number;
    atRisk: number;
    atRiskAP: number;
    terminated: number;
    terminatedAP: number;
    trend: TrendPoint[];
  };
  datePreset: string;
  comparing?: boolean;
  prevSnapshot?: PrevSnapshot | null;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function ProductionSnapshot({ snapshot, datePreset, comparing, prevSnapshot }: ProductionSnapshotProps) {
  return (
    <FadeIn delay={0.35}>
      <Card className="border-border" role="region" aria-label="Production snapshot">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Production Snapshot
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {datePreset === 'allTime'
                  ? 'All time'
                  : 'Policies issued in selected period'}
              </p>
            </div>
            <Link
              to="/production"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Full production view <ChevronRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Written</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold text-foreground font-data">
                  {snapshot.totalWritten.toLocaleString()}
                </p>
                {comparing && prevSnapshot && (
                  <DeltaBadge current={snapshot.totalWritten} previous={prevSnapshot.totalWritten} />
                )}
              </div>
              <p className="text-sm text-muted-foreground font-data">
                {fmt$(snapshot.totalAP)} AP
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Active</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold text-cyan-400 font-data">
                  {snapshot.active.toLocaleString()}
                </p>
                {comparing && prevSnapshot && (
                  <DeltaBadge current={snapshot.active} previous={prevSnapshot.active} />
                )}
              </div>
              <p className="text-sm text-cyan-400/70 font-data">
                {fmt$(snapshot.activeAP)} AP
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-3xl font-bold text-amber-400 font-data">
                {snapshot.pending.toLocaleString()}
              </p>
              <p className="text-sm text-amber-400/70 font-data">
                {fmt$(snapshot.pendingAP)} AP
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">At Risk</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold text-red-400 font-data">
                  {snapshot.atRisk.toLocaleString()}
                </p>
                {comparing && prevSnapshot && (
                  <DeltaBadge current={snapshot.atRisk} previous={prevSnapshot.atRisk} invertColor />
                )}
              </div>
              <p className="text-sm text-red-400/70 font-data">
                {fmt$(snapshot.atRiskAP)} AP
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Terminated</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold text-purple-400 font-data">
                  {snapshot.terminated.toLocaleString()}
                </p>
                {comparing && prevSnapshot && (
                  <DeltaBadge current={snapshot.terminated} previous={prevSnapshot.terminated} invertColor />
                )}
              </div>
            </div>
          </div>
          {/* Trend chart */}
          {snapshot.trend.length > 1 && (
            <div className="mt-4 h-24" role="img" aria-label={`Production trend chart showing ${snapshot.trend.length} data points`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot.trend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(217 33% 17%)"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(215 20% 55%)"
                    fontSize={10}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(217 33% 20%)',
                      background: 'hsl(222 47% 9%)',
                      color: 'hsl(210 40% 98%)',
                      fontSize: 11,
                    }}
                    formatter={(v: number, name: string) => [
                      name === 'policies' ? v.toLocaleString() : fmt$(v),
                      name === 'policies' ? 'Policies' : 'AP',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="policies"
                    stroke="hsl(142 71% 45%)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </FadeIn>
  );
}
