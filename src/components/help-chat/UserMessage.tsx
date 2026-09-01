/**
 * UserMessage — Right-aligned user message bubble
 */

import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/hooks/useHelpChat';

interface UserMessageProps {
  message: ChatMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className={cn(
        'max-w-[85%] rounded-2xl rounded-tr-md px-3.5 py-2.5',
        'bg-primary text-primary-foreground',
        'text-sm leading-relaxed whitespace-pre-wrap'
      )}>
        {message.text}
      </div>
    </div>
  );
}
