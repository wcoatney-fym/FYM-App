/**
 * HelpChatFAB — Floating action button to toggle the help chat panel
 */

import { MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpChatFABProps {
  onClick: () => void;
  isOpen: boolean;
}

export function HelpChatFAB({ onClick, isOpen }: HelpChatFABProps) {
  if (isOpen) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-12 h-12 rounded-full',
        'bg-primary text-primary-foreground',
        'shadow-lg hover:shadow-xl',
        'flex items-center justify-center',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
        'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2'
      )}
      title="Open Help Chat"
      aria-label="Open help chat"
    >
      <MessageCircleQuestion className="w-5 h-5" />
    </button>
  );
}
