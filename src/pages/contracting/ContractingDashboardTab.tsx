/**
 * Contracting Dashboard Tab — Stage 4 shell
 *
 * Will show: KPI cards (total agents, pending, in-progress, completed),
 * agency performance breakdown, recent activity feed.
 *
 * Data source: portal DB `agents`, `new_hires`, `activity_log` tables.
 * Full implementation in Step 2 (PR after this plumbing PR).
 */
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard } from 'lucide-react';

export function ContractingDashboardTab() {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-8 text-center space-y-3">
        <div className="p-3 rounded-full bg-blue-50 w-fit mx-auto">
          <LayoutDashboard size={24} className="text-[#1e3a5f]" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          Contracting Dashboard
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          KPI cards, agency performance, and recent activity — coming in the next PR.
          This tab will show real-time contracting metrics from the portal database.
        </p>
      </CardContent>
    </Card>
  );
}
