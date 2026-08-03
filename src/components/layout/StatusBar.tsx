import { useEffect, useState } from 'react';
import { NotificationBell } from '@/components/notifications/NotificationPanel';

/** Jarvis-style status bar — live clock + system indicator */
export function StatusBar() {
  const [time, setTime] = useState(getTime());

  useEffect(() => {
    const id = setInterval(() => setTime(getTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sticky top-16 z-20 flex items-center justify-between h-7 px-6 bg-secondary/40 backdrop-blur-md border-b border-border/20 text-[11px] font-data text-muted-foreground/70 select-none">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-glow" />
          SYSTEM ONLINE
        </span>
        <span className="text-border">│</span>
        <span>FYM COMMAND v2.0</span>
      </div>
      <div className="flex items-center gap-4">
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
