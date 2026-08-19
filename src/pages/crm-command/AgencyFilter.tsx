/**
 * AgencyFilter — Ported 1:1 from contracting-portal AgencyFilter.tsx
 * Styled for FYM App dark theme.
 */
import { Building2 } from 'lucide-react';

interface AgencyInfo {
  id: string;
  name: string;
  agency_type?: string | null;
}

interface AgencyFilterProps {
  agencies: AgencyInfo[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function AgencyFilter({ agencies, selectedIds, onChange }: AgencyFilterProps) {
  const allSelected = selectedIds.length === agencies.length;

  const selectAll = () => {
    onChange(agencies.map(a => a.id));
  };

  const selectOnly = (id: string) => {
    onChange([id]);
  };

  const toggleAgency = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      if (selectedIds.includes(id)) {
        if (selectedIds.length === 1) return;
        onChange(selectedIds.filter(x => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      if (selectedIds.length === 1 && selectedIds[0] === id) {
        selectAll();
      } else {
        selectOnly(id);
      }
    }
  };

  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
      <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-xs font-medium text-muted-foreground">Filter:</span>
      </div>

      <button
        onClick={selectAll}
        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 whitespace-nowrap ${
          allSelected
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'bg-secondary/30 text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground'
        }`}
      >
        All ({agencies.length})
      </button>

      {agencies.map((agency) => {
        const isSelected = selectedIds.includes(agency.id);
        const isOnlySelected = selectedIds.length === 1 && selectedIds[0] === agency.id;
        const isParent = agency.agency_type === 'main';
        return (
          <button
            key={agency.id}
            onClick={(e) => toggleAgency(agency.id, e)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 whitespace-nowrap ${
              isOnlySelected
                ? isParent
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/30'
                  : 'bg-amber-500 text-black border-amber-500 shadow-sm ring-2 ring-amber-400/30'
                : isSelected
                  ? isParent
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-amber-500 text-black border-amber-500 shadow-sm'
                  : 'bg-secondary/30 text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground'
            }`}
          >
            {agency.name}
            {isParent && <span className="ml-1 opacity-60">(main)</span>}
          </button>
        );
      })}

      {!allSelected && selectedIds.length < agencies.length && (
        <span className="text-[10px] text-muted-foreground/50 ml-1 flex-shrink-0">shift+click to multi-select</span>
      )}
    </div>
  );
}
