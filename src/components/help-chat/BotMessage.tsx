/**
 * BotMessage — Left-aligned bot message bubble with optional links
 */

import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/hooks/useHelpChat';

interface BotMessageProps {
  message: ChatMessage;
  onLinkClick?: (href: string) => void;
}

export function BotMessage({ message, onLinkClick }: BotMessageProps) {
  return (
    <div className="flex gap-2 items-start max-w-[85%]">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="space-y-1.5">
        <div className={cn(
          'rounded-2xl rounded-tl-md px-3.5 py-2.5',
          'bg-muted text-foreground',
          'text-sm leading-relaxed whitespace-pre-wrap'
        )}>
          {message.text}
        </div>
        {message.links && message.links.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-1">
            {message.links.map((link) => (
              <button
                key={link.href}
                onClick={() => onLinkClick?.(link.href)}
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium',
                  'text-primary hover:text-primary/80 hover:underline',
                  'transition-colors'
                )}
              >
                {link.label} →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
