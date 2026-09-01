/**
 * HelpChatInput — Text input bar with send button
 * Enter to send, Shift+Enter for newline.
 */

import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function HelpChatInput({ onSend, disabled }: HelpChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`; // max ~4 lines
  }, []);

  return (
    <div className={cn(
      'flex items-end gap-2 px-3 py-2.5',
      'border-t border-border bg-background rounded-b-2xl'
    )}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question..."
        disabled={disabled}
        rows={1}
        className={cn(
          'flex-1 resize-none bg-transparent text-sm',
          'placeholder:text-muted-foreground',
          'focus:outline-none',
          'max-h-24',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          'flex-shrink-0 p-1.5 rounded-lg transition-all duration-150',
          'text-primary hover:bg-primary/10',
          'active:scale-90',
          (!value.trim() || disabled) && 'opacity-30 cursor-not-allowed'
        )}
        title="Send message"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
