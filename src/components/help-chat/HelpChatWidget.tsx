/**
 * HelpChatWidget — Orchestrator component
 *
 * Renders the FAB + Panel, manages open/close state,
 * and wires the useHelpChat hook to the UI.
 *
 * NOTE: FYM Direct gating is handled by the parent (AppLayout).
 * This component assumes it should render when mounted.
 */

import { useState, useCallback } from 'react';
import { HelpChatFAB } from './HelpChatFAB';
import { HelpChatPanel } from './HelpChatPanel';
import { useHelpChat } from '@/hooks/useHelpChat';
import { cn } from '@/lib/utils';

export function HelpChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, handleQuickReply, clearChat } = useHelpChat();

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleMinimize = useCallback(() => setIsOpen(false), []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-50',
      'flex flex-col items-end gap-3',
      // Mobile: slightly less offset
      'max-sm:bottom-4 max-sm:right-4'
    )}>
      {/* Chat Panel — slides up with animation */}
      <div className={cn(
        'transition-all duration-200 origin-bottom-right',
        isOpen
          ? 'opacity-100 scale-100 translate-y-0'
          : 'opacity-0 scale-95 translate-y-2 pointer-events-none'
      )}>
        <HelpChatPanel
          messages={messages}
          onSend={sendMessage}
          onQuickReply={handleQuickReply}
          onClear={clearChat}
          onMinimize={handleMinimize}
          onClose={handleClose}
        />
      </div>

      {/* Floating Action Button */}
      <HelpChatFAB
        onClick={handleOpen}
        isOpen={isOpen}
      />
    </div>
  );
}
