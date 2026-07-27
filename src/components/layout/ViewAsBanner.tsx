import { useViewAsStore } from '@/store/view-as-store';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ViewAsBanner() {
  const { active, role, agencyName, agentName, deactivate } = useViewAsStore();
  const { isFymAdmin } = useAuth();

  if (!isFymAdmin || !active) return null;

  const viewLabel = role === 'agent'
    ? `Agent — ${agentName || 'Unknown'} @ ${agencyName}`
    : role === 'manager'
      ? `Manager — ${agencyName}`
      : `Agency Admin — ${agencyName}`;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black px-4 py-2 flex items-center justify-between text-sm font-medium">
      <div className="flex items-center gap-2">
        <Eye size={16} />
        <span>Viewing as: {viewLabel}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={deactivate}
        className="text-black hover:bg-amber-600/50 h-7 px-2 gap-1"
      >
        <X size={14} />
        Exit
      </Button>
    </div>
  );
}
