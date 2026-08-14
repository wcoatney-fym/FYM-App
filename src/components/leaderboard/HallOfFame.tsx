/**
 * HallOfFame — Small section showing all-time battle records:
 * top 3 battle winners, longest active streak, most challenges completed.
 * Gives agents something to aim for beyond the current period.
 */
import { cn } from '@/lib/utils';
import { Trophy, Flame, Target, Crown } from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';

export interface HallOfFameEntry {
  displayName: string;
  value: number;
  label: string;
}

interface HallOfFameProps {
  topBattleWinners: HallOfFameEntry[];
  longestStreak: HallOfFameEntry | null;
  mostChallengesCompleted: HallOfFameEntry | null;
  loading?: boolean;
}

const medalColors = [
  'text-amber-400',
  'text-slate-300',
  'text-orange-400',
];

export function HallOfFame({
  topBattleWinners,
  longestStreak,
  mostChallengesCompleted,
  loading,
}: HallOfFameProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border p-5">
        <div className="h-6 w-32 rounded shimmer mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg shimmer" />)}
        </div>
      </div>
    );
  }

  const hasData = topBattleWinners.length > 0 || longestStreak || mostChallengesCompleted;
  if (!hasData) return null;

  return (
    <div className="rounded-xl border border-amber-500/15 bg-gradient-to-b from-amber-500/[0.03] to-transparent p-5">
      <div className="flex items-center gap-2 mb-4">
        <Crown size={16} className="text-amber-400" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Hall of Fame</h3>
      </div>

      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Top Battle Winners */}
        <StaggerItem>
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Trophy size={14} className="text-amber-400" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Top Battle Winners
              </span>
            </div>
            {topBattleWinners.length === 0 ? (
              <p className="text-xs text-muted-foreground">No battles completed yet</p>
            ) : (
              <div className="space-y-2">
                {topBattleWinners.slice(0, 3).map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 truncate min-w-0">
                      <span className={cn('font-bold', medalColors[i] ?? 'text-muted-foreground')}>
                        #{i + 1}
                      </span>
                      <span className="font-medium text-foreground truncate">{entry.displayName}</span>
                    </span>
                    <span className="font-data text-muted-foreground flex-shrink-0 ml-2">
                      {entry.value} {entry.value === 1 ? 'win' : 'wins'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </StaggerItem>

        {/* Longest Streak */}
        <StaggerItem>
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Flame size={14} className="text-orange-400" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Longest Active Streak
              </span>
            </div>
            {longestStreak ? (
              <div>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {longestStreak.value} {longestStreak.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {longestStreak.displayName}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No streaks recorded yet</p>
            )}
          </div>
        </StaggerItem>

        {/* Most Challenges */}
        <StaggerItem>
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Target size={14} className="text-purple-400" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Most Challenges Completed
              </span>
            </div>
            {mostChallengesCompleted ? (
              <div>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {mostChallengesCompleted.value} {mostChallengesCompleted.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {mostChallengesCompleted.displayName}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No challenges completed yet</p>
            )}
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
