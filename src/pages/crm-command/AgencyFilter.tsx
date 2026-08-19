/**
 * AgencyFilter — Ported 1:1 from contracting-portal/src/pages/portal/AgencyFilter.tsx
 *
 * Filter pills for multi-agency views. Parent agency gets navy pill,
 * child agencies get gold pill. Shift+click for multi-select.
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
        <Building2 className="w-3.5 h-3.5 text-steel-400" />
        <span className="text-xs font-medium text-steel-500">Filter:</span>
      </div>

      <button
        onClick={selectAll}
        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 whitespace-nowrap ${
          allSelected
            ? 'bg-navy-600 text-white border-navy-600 shadow-sm'
            : 'bg-white text-steel-600 border-steel-300 hover:border-navy-300 hover:text-navy-600'
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
                  ? 'bg-navy-600 text-white border-navy-600 shadow-sm ring-2 ring-navy-300/40'
                  : 'bg-gold-500 text-navy-900 border-gold-500 shadow-sm ring-2 ring-gold-300/40'
                : isSelected
                  ? isParent
                    ? 'bg-navy-600 text-white border-navy-600 shadow-sm'
                    : 'bg-gold-500 text-navy-900 border-gold-500 shadow-sm'
                  : 'bg-white text-steel-600 border-steel-300 hover:border-navy-300 hover:text-navy-600'
            }`}
          >
            {agency.name}
            {isParent && <span className="ml-1 opacity-60">(main)</span>}
          </button>
        );
      })}

      {!allSelected && selectedIds.length < agencies.length && (
        <span className="text-[10px] text-steel-400 ml-1 flex-shrink-0">shift+click to multi-select</span>
      )}
    </div>
  );
}
