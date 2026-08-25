/**
 * CannedMessageButton — copy-to-clipboard button for canned pipeline messages.
 * Shows a preview on hover/click, copies full text on click.
 *
 * Charlie (2026-08-25): "Provide an easy copy slack message button to click."
 */
import { useState, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  MessageSquare,
  Mail,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { CannedMessage } from '@/lib/contracting/canned-messages';

interface CannedMessageButtonProps {
  message: CannedMessage;
  /** Compact mode — just a small copy button, no preview */
  compact?: boolean;
}

export function CannedMessageButton({ message, compact }: CannedMessageButtonProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message.body);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for non-HTTPS contexts
      const ta = document.createElement('textarea');
      ta.value = message.body;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 2500);
    }
  };

  const Icon = message.channel === 'slack' ? MessageSquare : Mail;

  if (compact) {
    return (
      <button
        onClick={handleCopy}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          copied
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
        }`}
        title={`Copy ${message.label}`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" /> Copied!
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" /> {message.label}
          </>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border/30 bg-card overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-background/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-foreground">{message.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {message.channel === 'slack' ? 'Slack message' : 'Email template'}
            {message.subject && ` — ${message.subject}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              copied
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-primary text-white hover:bg-primary/80'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy
              </>
            )}
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Preview — expandable */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30">
          <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto bg-background rounded-lg p-3">
            {message.body}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * CannedMessageList — renders all canned messages for a stage.
 */
interface CannedMessageListProps {
  messages: CannedMessage[];
  compact?: boolean;
}

export function CannedMessageList({ messages, compact }: CannedMessageListProps) {
  if (messages.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {messages.map((m) => (
          <CannedMessageButton key={m.id} message={m} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
        Templates
      </p>
      {messages.map((m) => (
        <CannedMessageButton key={m.id} message={m} />
      ))}
    </div>
  );
}
