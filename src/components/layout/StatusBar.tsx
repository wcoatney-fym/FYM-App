import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationPanel';

interface StatusBarProps {
  onSearchClick?: () => void;
}

/** Jarvis-style status bar — live clock + system indicator */
export function StatusBar({ onSearchClick }: StatusBarProps) {
  const [time, setTime] = useState(getTime());

  useEffect(() => {
    const id = setInterval(() => setTime(getTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sticky top-16 z-20 flex items-center justify-between h-7 px-6 bg-secondary/40 backdrop-blur-md border-b border-border/20 text-[11px] font-data text-muted-foreground select-none">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-glow" />
          SYSTEM ONLINE
        </span>
        <span className="text-border">│</span>
        <span>FYM COMMAND v2.0</span>
      </div>
      <div className="flex items-center gap-4">
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-secondary/60 transition-colors group"
            title="Search policies (⌘K)"
          >
            <Search className="h-3 w-3 opacity-50 group-hover:opacity-80" />
            <span className="hidden sm:inline opacity-50 group-hover:opacity-80">Search</span>
            <kbd className="hidden sm:inline px-1 py-px bg-secondary/80 rounded text-[9px] font-mono opacity-40 group-hover:opacity-60">⌘K</kbd>
          </button>
        )}
        <NotificationBell />
        <span className="text-border">│</span>
        <span className="tabular-nums">{time}</span>
      </div>
    </div>
  );
}

function getTime() {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Chicago',
  }).format(new Date()) + ' CT';
}
