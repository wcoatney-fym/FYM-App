/**
 * Contracting Pipeline Tab — Stage 4 (live)
 *
 * Full kanban board with drag-and-drop stage moves, GHL sync,
 * step checklists, writing number review, detail modal.
 *
 * Data source: portal DB `agent_pipeline`, `agent_pipeline_stage_steps`,
 * `agent_pipeline_ghl_config`, `agent_writing_number_submissions`,
 * `agent_lob_assignments` tables.
 */
import { PipelineBoard } from './pipeline';

export function ContractingPipelineTab() {
  return (
    <div className="h-full flex flex-col">
      <PipelineBoard />
    </div>
  );
}
