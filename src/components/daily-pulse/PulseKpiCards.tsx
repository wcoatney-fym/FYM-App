import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { Users, Clock, FileText, XCircle, MessageSquare } from 'lucide-react';

interface PulseStats {
  total: number;
  responded: number;
  working: number;
  notWorking: number;
  noResponse: number;
  fourPlusHrs: number;
  totalApps: number;
  responseRate: number;
}

interface PulseKpiCardsProps {
  stats: PulseStats;
  loading?: boolean;
}

export function PulseKpiCards({ stats, loading }: PulseKpiCardsProps) {
  const cards = [
    {
      label: 'Response Rate',
      value: stats.responseRate,
      suffix: '%',
      icon: MessageSquare,
      color: stats.responseRate >= 80 ? 'text-emerald-400' : stats.responseRate >= 50 ? 'text-amber-400' : 'text-red-400',
      sub: `${stats.responded} of ${stats.total} agents`,
    },
    {
      label: 'Working Today',
      value: stats.working,
      icon: Users,
      color: 'text-sky-400',
      sub: `${stats.notWorking} not working`,
    },
    {
      label: '4+ Hrs Talk Time',
      value: stats.fourPlusHrs,
      icon: Clock,
      color: 'text-violet-400',
      sub: `of ${stats.working} working`,
    },
    {
      label: 'Apps Committed',
      value: stats.totalApps,
      icon: FileText,
      color: 'text-emerald-400',
      sub: stats.working > 0 ? `${(stats.totalApps / stats.working).toFixed(1)} avg per agent` : '—',
    },
    {
      label: 'No Response',
      value: stats.noResponse,
      icon: XCircle,
      color: stats.noResponse > 0 ? 'text-red-400' : 'text-zinc-500',
      sub: stats.noResponse > 0 ? 'agents silent' : 'all accounted for',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((_, i) => (
          <Card key={i} className="bg-zinc-900/60 border-zinc-800 animate-pulse">
            <CardContent className="p-4 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <StaggerContainer className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <StaggerItem key={c.label}>
          <Card className="bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{c.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${c.color}`}>
                <CountUp end={c.value} duration={0.6} />
                {c.suffix || ''}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{c.sub}</div>
            </CardContent>
          </Card>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
