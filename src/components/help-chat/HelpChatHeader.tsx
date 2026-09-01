/**
 * HelpChatHeader — Chat panel header with title, minimize, and close buttons
 */

import { ChevronDown, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpChatHeaderProps {
  onMinimize: () => void;
  onClose: () => void;
  onClear: () => void;
}

export function HelpChatHeader({ onMinimize, onClose, onClear }: HelpChatHeaderProps) {
  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-3',
      'bg-primary text-primary-foreground rounded-t-2xl',
      'select-none'
    )}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm font-semibold">FYM Help</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMinimize}
          className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
          title="Minimize"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
