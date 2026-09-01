/**
 * HelpChatPanel — The chat window container
 * Composes header, messages, and input into a cohesive panel.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpChatHeader } from './HelpChatHeader';
import { HelpChatMessages } from './HelpChatMessages';
import { HelpChatInput } from './HelpChatInput';
import type { ChatMessage } from '@/hooks/useHelpChat';
import { cn } from '@/lib/utils';

interface HelpChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onQuickReply: (value: string) => void;
  onClear: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function HelpChatPanel({
  messages,
  onSend,
  onQuickReply,
  onClear,
  onMinimize,
  onClose,
}: HelpChatPanelProps) {
  const navigate = useNavigate();

  const handleLinkClick = useCallback((href: string) => {
    navigate(href);
  }, [navigate]);

  return (
    <div className={cn(
      'flex flex-col',
      'w-80 max-h-[480px] h-[480px]',
      'bg-card border border-border',
      'rounded-2xl shadow-xl',
      'overflow-hidden',
      // Mobile: full width
      'max-sm:w-[calc(100vw-2rem)] max-sm:max-h-[70vh]'
    )}>
      <HelpChatHeader
        onMinimize={onMinimize}
        onClose={onClose}
        onClear={onClear}
      />
      <HelpChatMessages
        messages={messages}
        onQuickReply={onQuickReply}
        onLinkClick={handleLinkClick}
      />
      <HelpChatInput onSend={onSend} />
    </div>
  );
}
