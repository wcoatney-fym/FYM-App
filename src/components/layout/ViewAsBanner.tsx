import { useViewAsStore } from '@/store/view-as-store';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, FlaskConical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ViewAsBanner() {
  const { active, role, viewSource, agencyName, agentName, deactivate } = useViewAsStore();
  const { isFymAdmin } = useAuth();

  if (!isFymAdmin || !active) return null;

  const viewLabel = role === 'agent'
    ? `Agent — ${agentName || 'Unknown'} @ ${agencyName}`
    : role === 'manager'
      ? `Manager — ${agencyName}`
      : `Agency Admin — ${agencyName}`;

  const isDev = viewSource === 'dev';
  const sourceLabel = isDev ? 'Dev View' : viewSource === 'downline' ? 'Downline' : 'FYM Direct';
  const Icon = isDev ? FlaskConical : Eye;
  const bgClass = isDev
    ? 'bg-emerald-500/90'
    : viewSource === 'downline'
      ? 'bg-cyan-500/90'
      : 'bg-amber-500/90';
  const hoverClass = isDev
    ? 'hover:bg-emerald-600/50'
    : viewSource === 'downline'
      ? 'hover:bg-cyan-600/50'
      : 'hover:bg-amber-600/50';

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${bgClass} text-black px-4 py-2 flex items-center justify-between text-sm font-medium`}>
      <div className="flex items-center gap-2">
        <Icon size={16} />
        <span>{sourceLabel}: {viewLabel}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={deactivate}
        className={`text-black ${hoverClass} h-7 px-2 gap-1`}
      >
        <X size={14} />
        Exit
      </Button>
    </div>
  );
}
