/**
 * QuickReplies — Inline action buttons below a bot message
 * Used for escalation yes/no and other binary choices.
 */

import { cn } from '@/lib/utils';

interface QuickReply {
  label: string;
  value: string;
}

interface QuickRepliesProps {
  replies: QuickReply[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ replies, onSelect, disabled }: QuickRepliesProps) {
  return (
    <div className="flex gap-2 pl-9 pt-1">
      {replies.map((reply) => (
        <button
          key={reply.value}
          onClick={() => onSelect(reply.value)}
          disabled={disabled}
          className={cn(
            'inline-flex items-center px-3 py-1.5 rounded-full',
            'text-xs font-medium border transition-all duration-150',
            'border-border bg-background text-foreground',
            'hover:bg-primary hover:text-primary-foreground hover:border-primary',
            'active:scale-95',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}
