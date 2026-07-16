import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/store/app-store';
import { mockDashboardStats, mockRetentionTrend } from '@/lib/mock-data';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, TrendingUp, AlertTriangle, FileText } from 'lucide-react';

export function DashboardPage() {
  const { useMockData } = useAppStore();
  const stats = useMockData ? mockDashboardStats : mockDashboardStats;
  const trend = useMockData ? mockRetentionTrend : mockRetentionTrend;

  const cards = [
    {
      title: 'Active Policies',
      value: stats.total_active_policies.toLocaleString(),
      icon: ShieldCheck,
      color: 'text-[#1e3a5f]',
      bg: 'bg-blue-50',
    },
    {
      title: '90-Day Retention',
      value: `${stats.retention_90_day}%`,
      icon: TrendingUp,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
    },
    {
      title: 'At-Risk Policies',
      value: stats.at_risk_count.toString(),
      icon: AlertTriangle,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
    },
    {
      title: 'New Submissions',
      value: stats.new_submissions_week.toString(),
      subtitle: 'this week',
      icon: FileText,
      color: 'text-slate-700',
      bg: 'bg-slate-100',
    },
  ];

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Card key={card.title} className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{card.title}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
                    {card.subtitle && (
                      <p className="text-xs text-slate-400 mt-0.5">{card.subtitle}</p>
                    )}
                  </div>
                  <div className={`p-2.5 rounded-lg ${card.bg}`}>
                    <card.icon size={20} className={card.color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">
              90-Day Retention Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis domain={[85, 100]} stroke="#64748b" fontSize={12} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, 'Retention']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="retention"
                    stroke="#1e3a5f"
                    strokeWidth={2.5}
                    dot={{ fill: '#1e3a5f', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
