/**
 * Agent Detail — Volume Tab (§11.3.2)
 *
 * Four small KPI tiles (MTD AP, Apps Submitted, AP/App, Apps/Active Day).
 * Below: AP by Product Family bar chart + production trend.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Cell,
} from 'recharts';
import { DollarSign, FileText, TrendingUp, CalendarDays } from 'lucide-react';
import type { AgentStats, TrendPoint, ProductMix } from '../types';
import { fmt$, fmtNum } from '../helpers';
import type { DateRange } from '@/lib/dateUtils';

const PRODUCT_COLORS: Record<string, string> = {
  HI: 'hsl(199 89% 48%)',
  HHC: 'hsl(142 71% 45%)',
};

interface VolumeTabProps {
  stats: AgentStats;
  trend: TrendPoint[];
  productMix: ProductMix[];
  dateRange: DateRange;
}

export function VolumeTab({ stats, trend, productMix, dateRange }: VolumeTabProps) {
  // AP per app
  const apPerApp = stats.policies_this_month > 0
    ? Number(stats.ap_this_month) / stats.policies_this_month
    : 0;

  // Active days this month (business days elapsed)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let activeDays = 0;
  for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) activeDays++;
  }
  const appsPerDay = activeDays > 0
    ? stats.policies_this_month / activeDays
    : 0;

  return (
    <div className="space-y-4 mt-4">
      {/* ── KPI tiles ────────────────────────────────────────────────── */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">MTD AP</p>
                  <CountUp
                    end={Number(stats.ap_this_month || 0)}
                    format={fmt$}
                    className="text-xl font-bold mt-1 block text-foreground"
                  />
                </div>
                <div className="p-1.5 rounded-lg bg-cyan-500/10">
                  <DollarSign size={14} className="text-primary" />
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
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Apps Submitted</p>
                  <CountUp
                    end={stats.policies_this_month}
                    format={fmtNum}
                    className="text-xl font-bold mt-1 block text-foreground"
                  />
                </div>
                <div className="p-1.5 rounded-lg bg-emerald-500/10">
                  <FileText size={14} className="text-emerald-400" />
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
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AP / App</p>
                  <CountUp
                    end={apPerApp}
                    format={fmt$}
                    className="text-xl font-bold mt-1 block text-foreground"
                  />
                </div>
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <TrendingUp size={14} className="text-amber-400" />
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
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Apps / Active Day</p>
                  <CountUp
                    end={appsPerDay}
                    format={(n: number) => n.toFixed(1)}
                    className="text-xl font-bold mt-1 block text-foreground"
                  />
                </div>
                <div className="p-1.5 rounded-lg bg-violet-500/10">
                  <CalendarDays size={14} className="text-violet-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* ── Charts row ───────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Production trend (2 cols) */}
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">
              AP Trend — {dateRange.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                No production data
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
                    <YAxis yAxisId="policies" orientation="right" stroke="hsl(215 20% 55%)" fontSize={11} />
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
                    <Bar yAxisId="ap" dataKey="ap" fill="hsl(199 89% 48%)" fillOpacity={0.3} stroke="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="policies" type="monotone" dataKey="policies" stroke="hsl(142 71% 45%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(142 71% 45%)' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product family breakdown (1 col) */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">AP by Product Family</CardTitle>
          </CardHeader>
          <CardContent>
            {productMix.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                No active policies
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productMix} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" horizontal={false} />
                    <XAxis type="number" stroke="hsl(215 20% 55%)" fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="product_type"
                      stroke="hsl(215 20% 55%)"
                      fontSize={12}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(217 33% 20%)',
                        background: 'hsl(222 47% 9%)',
                        color: 'hsl(210 40% 98%)',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [fmtNum(value), 'Policies']}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {productMix.map((entry) => (
                        <Cell
                          key={entry.product_type}
                          fill={PRODUCT_COLORS[entry.product_type] || 'hsl(215 20% 55%)'}
                          fillOpacity={0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Legend */}
            <div className="flex gap-4 mt-2 justify-center">
              {productMix.map(p => (
                <div key={p.product_type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: PRODUCT_COLORS[p.product_type] || 'hsl(215 20% 55%)' }}
                  />
                  {p.product_type}: {fmtNum(p.count)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
