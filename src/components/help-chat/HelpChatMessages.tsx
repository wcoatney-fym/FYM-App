/**
 * HelpChatMessages — Scrollable message list with auto-scroll to latest
 */

import { useEffect, useRef } from 'react';
import { BotMessage } from './BotMessage';
import { UserMessage } from './UserMessage';
import { QuickReplies } from './QuickReplies';
import type { ChatMessage } from '@/hooks/useHelpChat';
import { cn } from '@/lib/utils';

interface HelpChatMessagesProps {
  messages: ChatMessage[];
  onQuickReply: (value: string) => void;
  onLinkClick: (href: string) => void;
}

export function HelpChatMessages({ messages, onQuickReply, onLinkClick }: HelpChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={cn(
      'flex-1 overflow-y-auto px-3 py-3 space-y-3',
      'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent'
    )}>
      {messages.map((msg, idx) => {
        const isLast = idx === messages.length - 1;

        return (
          <div key={msg.id}>
            {msg.role === 'bot' ? (
              <>
                <BotMessage message={msg} onLinkClick={onLinkClick} />
                {/* Show quick replies only on the last bot message that has them */}
                {isLast && msg.quickReplies && msg.quickReplies.length > 0 && (
                  <QuickReplies
                    replies={msg.quickReplies}
                    onSelect={onQuickReply}
                  />
                )}
              </>
            ) : (
              <UserMessage message={msg} />
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
