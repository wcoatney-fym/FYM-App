/**
 * Contracting Pipeline Tab — Stage 4 shell
 *
 * Will show: kanban board + list view of agent pipeline stages,
 * step progress, WN status, stage-change modal, expandable detail cards.
 *
 * Data source: portal DB `agent_pipeline`, `agent_pipeline_stage_steps`,
 * `agent_lob_assignments` tables.
 * Full implementation in Step 4.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Kanban } from 'lucide-react';

export function ContractingPipelineTab() {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-8 text-center space-y-3">
        <div className="p-3 rounded-full bg-fuchsia-50 w-fit mx-auto">
          <Kanban size={24} className="text-fuchsia-700" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          Agent Pipeline
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Kanban board and list view of the agent contracting pipeline —
          stage progression, writing number status, and step checklists — coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
