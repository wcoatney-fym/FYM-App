/**
 * PulseTrendChart — dual-line chart showing agents working + apps committed
 * over time, with trend indicators and a date range picker.
 *
 * Data source: checkin_responses table in rcbzag, grouped by check_in_date.
 */
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Users, FileText,
} from 'lucide-react';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import {
  type DatePreset, type DateRange, getDateRange,
} from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

interface DailyPoint {
  date: string;         // YYYY-MM-DD
  dateLabel: string;    // "Aug 12" display label
  agentsWorking: number;
  appsCommitted: number;
}

interface TrendInfo {
  direction: 'up' | 'down' | 'flat';
  pct: number;          // absolute percentage change
}

// ── Trend helpers ──────────────────────────────────────────────────────────

function computeTrend(data: DailyPoint[], key: 'agentsWorking' | 'appsCommitted'): TrendInfo {
  if (data.length < 4) return { direction: 'flat', pct: 0 };

  // Compare the average of the last 25% of days to the first 25%
  const quarter = Math.max(1, Math.floor(data.length / 4));
  const firstSlice = data.slice(0, quarter);
  const lastSlice = data.slice(-quarter);

  const avgFirst = firstSlice.reduce((s, d) => s + d[key], 0) / firstSlice.length;
  const avgLast = lastSlice.reduce((s, d) => s + d[key], 0) / lastSlice.length;

  if (avgFirst === 0 && avgLast === 0) return { direction: 'flat', pct: 0 };
  if (avgFirst === 0) return { direction: 'up', pct: 100 };

  const pct = Math.round(((avgLast - avgFirst) / avgFirst) * 100);

  if (Math.abs(pct) < 3) return { direction: 'flat', pct: 0 };
  return { direction: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

// ── Trend badge ────────────────────────────────────────────────────────────

function TrendBadge({ trend, label, color }: { trend: TrendInfo; label: string; color: string }) {
  const Icon = trend.direction === 'up' ? TrendingUp
    : trend.direction === 'down' ? TrendingDown
    : Minus;
  const trendColor = trend.direction === 'up' ? 'text-emerald-400'
    : trend.direction === 'down' ? 'text-red-400'
    : 'text-zinc-400';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
      <span className={`text-xs font-medium ${color}`}>{label}</span>
      <Icon size={14} className={trendColor} />
      {trend.pct > 0 && (
        <span className={`text-xs font-mono ${trendColor}`}>
          {trend.direction === 'up' ? '+' : '-'}{trend.pct}%
        </span>
      )}
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-zinc-300 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.stroke }} />
          <span className="text-zinc-400">{p.name}:</span>
          <span className="text-zinc-200 font-mono font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const DEFAULT_PRESET: DatePreset = 'thisMonth';

export function PulseTrendChart() {
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [data, setData] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrendData = useCallback(async () => {
    setLoading(true);

    if (!supabase) {
      setData([]);
      setLoading(false);
      return;
    }

    const startDate = dateRange.startDate.slice(0, 10);
    const endDate = dateRange.endDate.slice(0, 10);

    const { data: rows, error } = await (supabase as any)
      .from('checkin_responses')
      .select('check_in_date, is_working, app_goal, conversation_state')
      .gte('check_in_date', startDate)
      .lt('check_in_date', endDate)
      .order('check_in_date', { ascending: true });

    if (error || !rows) {
      console.warn('[PulseTrend] query error:', error?.message);
      setData([]);
      setLoading(false);
      return;
    }

    // Group by date
    const byDate = new Map<string, { working: number; apps: number }>();
    for (const r of rows) {
      const d = r.check_in_date as string;
      if (!byDate.has(d)) byDate.set(d, { working: 0, apps: 0 });
      const entry = byDate.get(d)!;
      if (r.is_working === true) entry.working++;
      entry.apps += r.app_goal || 0;
    }

    const points: DailyPoint[] = Array.from(byDate.entries()).map(([date, agg]) => ({
      date,
      dateLabel: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/New_York',
      }),
      agentsWorking: agg.working,
      appsCommitted: agg.apps,
    }));

    setData(points);
    setLoading(false);
  }, [dateRange]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  const agentTrend = useMemo(() => computeTrend(data, 'agentsWorking'), [data]);
  const appsTrend = useMemo(() => computeTrend(data, 'appsCommitted'), [data]);

  // Latest values for summary
  const latest = data.length > 0 ? data[data.length - 1] : null;

  function handleDateChange(range: DateRange, preset: DatePreset) {
    setDateRange(range);
    setDatePreset(preset);
  }

  // Compute a nice Y-axis max — use separate axes for agents (left) and apps (right)
  const maxAgents = Math.max(10, ...data.map(d => d.agentsWorking));
  const maxApps = Math.max(10, ...data.map(d => d.appsCommitted));

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-zinc-200">Daily Pulse Trend</h3>
          {data.length >= 4 && (
            <>
              <TrendBadge trend={agentTrend} label="Agents" color="text-sky-400" />
              <TrendBadge trend={appsTrend} label="Apps" color="text-emerald-400" />
            </>
          )}
        </div>
        <TimePeriodSelector
          preset={datePreset}
          dateRange={dateRange}
          onChange={handleDateChange}
        />
      </div>

      {/* Summary strip */}
      {latest && (
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Users size={12} className="text-sky-400" />
            Latest: <span className="text-zinc-200 font-mono font-medium">{latest.agentsWorking}</span> agents working
          </span>
          <span className="flex items-center gap-1.5">
            <FileText size={12} className="text-emerald-400" />
            <span className="text-zinc-200 font-mono font-medium">{latest.appsCommitted}</span> apps committed
          </span>
        </div>
      )}

      {/* Chart */}
      <HudFrame>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4">
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="text-xs text-zinc-500 animate-pulse">Loading trend data…</div>
              </div>
            ) : data.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                <Users size={24} className="text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-400">No check-in data yet for this period</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Data will appear here once agents start responding to daily check-ins
                </p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(217 33% 17%)"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }}
                      interval={data.length > 14 ? Math.floor(data.length / 7) : 0}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(217 33% 17%)' }}
                    />
                    <YAxis
                      yAxisId="agents"
                      tick={{ fontSize: 11, fill: 'hsl(199 89% 48%)' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, Math.ceil(maxAgents * 1.15)]}
                      label={{
                        value: 'Agents',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 10, fill: 'hsl(199 89% 48%)', textAnchor: 'middle' },
                        offset: 10,
                      }}
                    />
                    <YAxis
                      yAxisId="apps"
                      orientation="right"
                      tick={{ fontSize: 11, fill: 'hsl(142 71% 45%)' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, Math.ceil(maxApps * 1.15)]}
                      label={{
                        value: 'Apps',
                        angle: 90,
                        position: 'insideRight',
                        style: { fontSize: 10, fill: 'hsl(142 71% 45%)', textAnchor: 'middle' },
                        offset: 10,
                      }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                      iconType="line"
                    />
                    <Line
                      yAxisId="agents"
                      type="monotone"
                      dataKey="agentsWorking"
                      name="Agents Working"
                      stroke="hsl(199 89% 48%)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: 'hsl(199 89% 48%)', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: 'hsl(199 89% 48%)', stroke: 'hsl(222 47% 8%)', strokeWidth: 2 }}
                    />
                    <Line
                      yAxisId="apps"
                      type="monotone"
                      dataKey="appsCommitted"
                      name="Apps Committed"
                      stroke="hsl(142 71% 45%)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: 'hsl(142 71% 45%)', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: 'hsl(142 71% 45%)', stroke: 'hsl(222 47% 8%)', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </HudFrame>
    </div>
  );
}
