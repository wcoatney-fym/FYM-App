/**
 * Manager Workboard — At-Risk Pipeline Execution Surface
 *
 * Two views for managers:
 * 1. Action Cards — urgency-ranked NeedsAttentionList with Got it / Working / Done buttons
 * 2. Pipeline — 8-stage Kanban board for drag-and-drop case management
 *
 * Admins are redirected to the Quality > At-Risk oversight view via Sidebar nav.
 * This page is the manager's hands-on execution tool.
 */
import { useState } from 'react';
import { ListChecks, Columns3 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { AtRiskKanban } from '@/components/at-risk/AtRiskKanban';
import { NeedsAttentionList } from '@/components/needs-attention/NeedsAttentionList';
import { cn } from '@/lib/utils';

type WorkboardView = 'cards' | 'pipeline';

export function ManagerWorkboardPage() {
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const [view, setView] = useState<WorkboardView>('cards');

  return (
    <div>
      <Header title="Workboard" />
      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* Top bar: filters + view toggle */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <DataFilters
            showAgencyFilter={showAgencyFilter}
            showTimePeriod={false}
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />

          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('cards')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors',
                view === 'cards'
                  ? 'bg-primary/10 text-primary border-r border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-r border-border'
              )}
            >
              <ListChecks size={14} />
              Action Cards
            </button>
            <button
              onClick={() => setView('pipeline')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors',
                view === 'pipeline'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Columns3 size={14} />
              Pipeline
            </button>
          </div>
        </div>

        {/* View content */}
        {view === 'cards' ? (
          <NeedsAttentionList filterAgencyId={filterAgencyId} />
        ) : (
          <AtRiskKanban filterAgencyId={filterAgencyId} />
        )}

      </div>
    </div>
  );
}
