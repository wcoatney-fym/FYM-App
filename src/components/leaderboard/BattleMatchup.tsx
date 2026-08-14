/**
 * BattleMatchup — ESPN-style matchup card for battles.
 * Two opponents side by side with live progress bars,
 * countdown timer, and the metric they're competing on.
 */
import { cn } from '@/lib/utils';
import { Trophy, Calendar, Clock, Swords } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GamificationMetric } from '@/lib/database.types';

interface Participant {
  id: string;
  display_name: string;
  current_value: number;
  starting_value: number;
  is_winner: boolean;
}

interface BattleMatchupProps {
  title: string;
  description: string | null;
  metric: GamificationMetric;
  status: 'upcoming' | 'active' | 'completed';
  startDate: string;
  endDate: string;
  participants: Participant[];
}

function metricLabel(m: GamificationMetric) {
  switch (m) {
    case 'policies': return 'Policies';
    case 'ap': return 'Premium';
    case 'retention': return 'Retention';
  }
}

function fmtValue(v: number, m: GamificationMetric) {
  if (m === 'ap') {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
    return `$${Math.round(v).toLocaleString()}`;
  }
  if (m === 'retention') return `${v.toFixed(1)}%`;
  return v.toLocaleString();
}

function daysRemaining(endDate: string): number {
  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function dateRange(start: string, end: string) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function statusBadge(status: 'upcoming' | 'active' | 'completed') {
  if (status === 'active') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 inline-block animate-pulse" />
        LIVE
      </Badge>
    );
  }
  if (status === 'upcoming') {
    return <Badge className="bg-slate-500/15 text-slate-300 border-slate-500/30 text-[10px]">Upcoming</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground border-border text-[10px]">Final</Badge>;
}

export function BattleMatchup({
  title,
  description,
  metric,
  status,
  startDate,
  endDate,
  participants,
}: BattleMatchupProps) {
  // For 1v1 matchups, show side-by-side ESPN style
  const isTwoPlayer = participants.length === 2;
  const maxValue = Math.max(1, ...participants.map(p => p.current_value));
  const days = daysRemaining(endDate);
  const winner = participants.find(p => p.is_winner);

  if (isTwoPlayer) {
    const [left, right] = participants;
    const leftPct = maxValue > 0 ? (left.current_value / maxValue) * 100 : 50;
    const rightPct = maxValue > 0 ? (right.current_value / maxValue) * 100 : 50;
    const leftLeads = left.current_value >= right.current_value;

    return (
      <div className={cn(
        'rounded-xl border overflow-hidden transition-all',
        status === 'active'
          ? 'border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.03] to-card'
          : status === 'completed'
            ? 'border-amber-500/20 bg-gradient-to-b from-amber-500/[0.02] to-card'
            : 'border-border bg-card',
      )}>
        {/* Header bar */}
        <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Swords size={14} className="text-primary flex-shrink-0" />
            <span className="text-sm font-bold text-foreground truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusBadge(status)}
          </div>
        </div>

        {/* Matchup area */}
        <div className="p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            {/* Left fighter */}
            <div className="text-center">
              <div className={cn(
                'w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-black',
                status === 'completed' && left.is_winner
                  ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-400/30'
                  : leftLeads && status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-secondary text-muted-foreground',
              )}>
                {left.display_name.charAt(0).toUpperCase()}
              </div>
              <p className={cn(
                'text-sm font-bold truncate',
                status === 'completed' && left.is_winner ? 'text-amber-400' : 'text-foreground',
              )}>
                {left.display_name}
              </p>
              <p className="text-xl font-black tabular-nums text-foreground mt-1">
                {fmtValue(left.current_value, metric)}
              </p>
            </div>

            {/* VS divider */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-black text-muted-foreground tracking-widest">VS</span>
              {status === 'active' && (
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-0.5">
                  <Clock size={10} />{days}d
                </span>
              )}
              {status === 'completed' && winner && (
                <Trophy size={16} className="text-amber-400" />
              )}
            </div>

            {/* Right fighter */}
            <div className="text-center">
              <div className={cn(
                'w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-black',
                status === 'completed' && right.is_winner
                  ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-400/30'
                  : !leftLeads && status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-secondary text-muted-foreground',
              )}>
                {right.display_name.charAt(0).toUpperCase()}
              </div>
              <p className={cn(
                'text-sm font-bold truncate',
                status === 'completed' && right.is_winner ? 'text-amber-400' : 'text-foreground',
              )}>
                {right.display_name}
              </p>
              <p className="text-xl font-black tabular-nums text-foreground mt-1">
                {fmtValue(right.current_value, metric)}
              </p>
            </div>
          </div>

          {/* Progress bar — combined */}
          <div className="mt-4 h-3 rounded-full bg-secondary/50 overflow-hidden flex">
            <div
              className={cn(
                'h-full transition-all rounded-l-full',
                status === 'completed' && left.is_winner ? 'bg-amber-400' : 'bg-primary',
              )}
              style={{ width: `${leftPct}%` }}
            />
            <div className="w-px bg-background/80 flex-shrink-0" />
            <div
              className={cn(
                'h-full transition-all rounded-r-full',
                status === 'completed' && right.is_winner ? 'bg-amber-400' : 'bg-purple-500',
              )}
              style={{ width: `${rightPct}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {dateRange(startDate, endDate)}
          </span>
          <span className="uppercase tracking-wider font-medium">{metricLabel(metric)}</span>
        </div>
      </div>
    );
  }

  // Multi-player: vertical bar list (fallback for >2 participants)
  return (
    <div className={cn(
      'rounded-xl border overflow-hidden',
      status === 'active' ? 'border-emerald-500/30 bg-card' : 'border-border bg-card',
    )}>
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Swords size={14} className="text-primary flex-shrink-0" />
          <span className="text-sm font-bold text-foreground truncate">{title}</span>
        </div>
        {statusBadge(status)}
      </div>
      <div className="p-4 space-y-3">
        {description && (
          <p className="text-xs text-muted-foreground mb-3">{description}</p>
        )}
        {participants.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No participants added yet.</p>
        ) : (
          participants.map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={cn(
                  'font-semibold truncate flex items-center gap-1.5',
                  status === 'completed' && p.is_winner ? 'text-amber-400' : 'text-foreground',
                )}>
                  {status === 'completed' && p.is_winner && <Trophy size={12} className="text-amber-400" />}
                  {p.display_name}
                </span>
                <span className="font-data text-muted-foreground">{fmtValue(p.current_value, metric)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary/50 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    status === 'completed' && p.is_winner ? 'bg-amber-400' : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(100, (p.current_value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-border/20 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar size={11} />
          {dateRange(startDate, endDate)}
        </span>
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-wider font-medium">{metricLabel(metric)}</span>
          {status === 'active' && (
            <span className="flex items-center gap-0.5 text-emerald-400">
              <Clock size={10} />{days}d left
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
