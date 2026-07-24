/**
 * Contracting Tracking Tab — Stage 4 shell
 *
 * Will show: full agent status table with search/filter/sort,
 * view/edit/terminate modals, CSV export, pagination.
 *
 * Data source: portal DB `agents`, `agent_intake`, `uploaded_files` tables.
 * Full implementation in Step 3.
 */
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

export function ContractingTrackingTab() {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-8 text-center space-y-3">
        <div className="p-3 rounded-full bg-violet-50 w-fit mx-auto">
          <ClipboardList size={24} className="text-violet-700" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          Agent Tracking
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Full agent status table with search, filters, view/edit modals,
          terminate actions, and CSV export — coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
