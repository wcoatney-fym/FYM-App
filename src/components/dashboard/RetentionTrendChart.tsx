/**
 * RetentionTrendChart — Monthly cohort retention trend with 90% target line.
 *
 * Extracted from DashboardPage for maintainability (Section 4 of UX audit).
 * Section 5: adds a visual 90% target reference line so users can instantly
 * see which cohorts fell below the FYM retention target.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/animated';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface CohortPoint {
  month: string;
  hi: number | null;
  hhc: number | null;
  combined: number | null;
}

interface RetentionTrendChartProps {
  trend: CohortPoint[];
  loading: boolean;
}

export function RetentionTrendChart({ trend, loading }: RetentionTrendChartProps) {
  return (
    <FadeIn delay={0.4}>
      <Card
        className="border-border"
        role="region"
        aria-label="90-day retention by cohort trend chart"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                90-Day Retention by Cohort
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monthly cohorts · HI + HHC combined and by product · dashed line
                = 90% target
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-primary rounded" /> Combined
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-violet-500 rounded" /> HI
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-500 rounded" /> HHC
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 rounded"
                  style={{
                    borderTop: '2px dashed hsl(38 92% 50%)',
                    height: 0,
                  }}
                />{' '}
                Target
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-72 rounded shimmer" aria-hidden="true" />
          ) : (
            <div
              className="h-72"
              role="img"
              aria-label={`Retention trend chart showing ${trend.length} monthly cohorts. 90% target line shown as reference.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trend}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(217 33% 17%)"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(215 20% 55%)"
                    fontSize={12}
                  />
                  <YAxis
                    domain={[70, 105]}
                    stroke="hsl(215 20% 55%)"
                    fontSize={12}
                    tickFormatter={(v) => `${v}%`}
                  />
                  {/* 90% target reference line */}
                  <ReferenceLine
                    y={90}
                    stroke="hsl(38 92% 50%)"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: '90% target',
                      position: 'insideTopRight',
                      fill: 'hsl(38 92% 50%)',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      v !== null ? `${v}%` : '—',
                      name === 'combined'
                        ? 'Combined'
                        : name === 'hi'
                          ? 'HI'
                          : 'HHC',
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(217 33% 20%)',
                      background: 'hsl(222 47% 9%)',
                      color: 'hsl(210 40% 98%)',
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="combined"
                    stroke="hsl(199 89% 48%)"
                    strokeWidth={2.5}
                    dot={{
                      fill: 'hsl(199 89% 48%)',
                      r: 4,
                      stroke: 'hsl(199 89% 48%)',
                      strokeWidth: 0,
                    }}
                    activeDot={{
                      r: 6,
                      stroke: 'hsl(199 89% 48%)',
                      strokeWidth: 2,
                      fill: 'hsl(222 47% 8%)',
                    }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="hi"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="hhc"
                    stroke="#0ea5e9"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
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
