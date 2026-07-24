/**
 * Contracting Training Tab — Stage 4 shell
 *
 * Will show: training content stats, quiz leaderboard,
 * agency training averages, live session management.
 *
 * Data source: portal DB `agent_training_events`, `agent_training_content`,
 * `agent_live_sessions`, `agent_hub_logins`, `agent_live_attendance` tables.
 * Full implementation in Step 5.
 */
import { Card, CardContent } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

export function ContractingTrainingTab() {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-8 text-center space-y-3">
        <div className="p-3 rounded-full bg-amber-50 w-fit mx-auto">
          <GraduationCap size={24} className="text-amber-700" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          Training Hub
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Training content stats, quiz leaderboard, agency completion averages,
          and live session management — coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
