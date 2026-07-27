import { motion } from 'framer-motion';
import { BarChart3, Bot } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useSettingsStore } from '@/stores/cc-stores';
import {
  mockRevenueHistory, mockConversionFunnel, mockTaskCompletionByMember, mockCancellationTrend
} from '@/lib/command-center/mock-data';

export function CcAnalyticsTab() {
  const mockEnabled = useSettingsStore((s) => s.mockDataEnabled);

  if (!mockEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Analytics & KPIs</h2>
        <p className="text-sm text-muted-foreground">Load mock data to view charts and performance metrics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics & KPIs</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Revenue Over Time</h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Bot className="w-3 h-3 text-primary" />Tracking 4% above trend</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={mockRevenueHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickFormatter={(v) => `$${v/1000}K`} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }} labelStyle={{ color: 'hsl(210 40% 98%)' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="projected" stroke="hsl(215 20% 55%)" strokeDasharray="4 4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="actual" stroke="hsl(199 89% 48%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(199 89% 48%)' }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Lead Conversion Funnel</h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Bot className="w-3 h-3 text-primary" />11.1% overall conversion</div>
          </div>
          <div className="space-y-2">
            {mockConversionFunnel.map((stage, i) => {
              const maxCount = mockConversionFunnel[0].count;
              const width = (stage.count / maxCount) * 100;
              return (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground w-24 text-right">{stage.stage}</span>
                  <div className="flex-1 h-7 bg-secondary/30 rounded-md overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.6, delay: i * 0.1 }} className="h-full rounded-md gradient-primary flex items-center justify-end px-2">
                      <span className="text-[10px] font-bold text-background">{stage.count}</span>
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Task Completion by Member</h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Bot className="w-3 h-3 text-primary" />Elena leads with 95% completion rate</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={mockTaskCompletionByMember}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="completed" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inProgress" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Cancellation Trend</h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Bot className="w-3 h-3 text-primary" />Trending up 8% MoM - intervention needed</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={mockCancellationTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }} />
              <Area type="monotone" dataKey="rate" stroke="hsl(0 84% 60%)" fill="hsl(0 84% 60%)" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="count" stroke="hsl(38 92% 50%)" fill="hsl(38 92% 50%)" fillOpacity={0.05} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
}
