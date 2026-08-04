import { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, X, AlertTriangle, Zap, CheckCircle2, Target, TrendingDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { fetchAtRiskPolicies } from '@/lib/prod-api';
import type { AtRiskPolicy } from '@/lib/prod-api';
import { useCachedFetch } from '@/hooks/useCachedFetch';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type NotifType = 'final_7d' | 'future_term' | 'pended' | 'behind_pace' | 'save_confirmed' | 'goal_alert' | 'system';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  /** optional link target */
  href?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TYPE_META: Record<NotifType, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  final_7d:       { icon: Zap,             color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'FINAL 7 DAYS' },
  future_term:    { icon: AlertTriangle,   color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'FUTURE TERM' },
  pended:         { icon: Clock,           color: 'text-amber-400',  bg: 'bg-amber-500/10',   label: 'PENDED' },
  behind_pace:    { icon: TrendingDown,    color: 'text-amber-400',  bg: 'bg-amber-500/10',   label: 'BEHIND PACE' },
  save_confirmed: { icon: CheckCircle2,    color: 'text-emerald-400',bg: 'bg-emerald-500/10', label: 'SAVE CONFIRMED' },
  goal_alert:     { icon: Target,          color: 'text-cyan-400',   bg: 'bg-cyan-500/10',    label: 'GOAL' },
  system:         { icon: Bell,            color: 'text-slate-400',  bg: 'bg-slate-500/10',   label: 'SYSTEM' },
};

function timeAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Build notifications from at-risk policy data */
function buildNotificationsFromAtRisk(policies: AtRiskPolicy[]): Notification[] {
  const notifs: Notification[] = [];
  const now = new Date();

  for (const p of policies) {
    const daysIdle = p.days_idle ?? 0;

    if (daysIdle >= 38) {
      // Final 7 days — highest urgency
      const dayNum = Math.min(daysIdle, 45);
      notifs.push({
        id: `f7d-${p.policy_number}`,
        type: 'final_7d',
        title: `${p.client_name ?? p.policy_number} — Final 7 days`,
        body: `Day ${dayNum}/45 · ${p.product_type ?? 'Policy'} · $${(p.plan_premium ?? 0).toLocaleString()} AP`,
        timestamp: new Date(now.getTime() - (45 - dayNum) * 3600_000), // synthetic recency
        read: false,
        href: '/at-risk',
      });
    } else if (daysIdle >= 30) {
      notifs.push({
        id: `ft-${p.policy_number}`,
        type: 'future_term',
        title: `${p.client_name ?? p.policy_number} — Future term`,
        body: `Day ${daysIdle}/45 · ${p.product_type ?? 'Policy'} · $${(p.plan_premium ?? 0).toLocaleString()} AP`,
        timestamp: new Date(now.getTime() - (45 - daysIdle) * 3600_000),
        read: false,
        href: '/at-risk',
      });
    }
  }

  // Sort by timestamp descending (most recent first)
  notifs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Cap at 20
  return notifs.slice(0, 20);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { effectiveAgencyId, effectiveRole } = useEffectiveAuth();

  // Cached at-risk fetch — instant render from localStorage
  const agencyParam = effectiveRole === 'agent' ? undefined : effectiveAgencyId ?? undefined;
  const cacheKey = `notif-atrisk-${agencyParam || 'org'}`;
  const { data: atRiskResp, loading } = useCachedFetch(
    cacheKey,
    () => fetchAtRiskPolicies(agencyParam ? { agency_id: agencyParam } : undefined),
    { deps: [agencyParam] }
  );

  const notifications = useMemo((): Notification[] => {
    if (!atRiskResp) return [];
    const notifs = buildNotificationsFromAtRisk(atRiskResp.data.policies);
    // Apply local read state
    return notifs.map(n => readIds.has(n.id) ? { ...n, read: true } : n);
  }, [atRiskResp, readIds]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setReadIds(new Set(notifications.map(n => n.id)));
  };

  const markRead = (id: string) => {
    setReadIds(prev => new Set([...prev, id]));
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => {
          setOpen(o => !o);
          // Data refreshes automatically via useCachedFetch
        }}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200',
          open
            ? 'bg-primary/20 text-primary'
            : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/60'
        )}
        title="Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none shadow-lg shadow-red-500/30">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-full mt-2 w-[380px] max-h-[520px] flex flex-col',
            'bg-card border border-border/40 rounded-xl shadow-2xl shadow-black/20',
            'animate-in fade-in slide-in-from-top-2 duration-200 z-50'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground/40">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">All clear</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">No notifications right now</p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((notif) => {
                  const meta = TYPE_META[notif.type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={notif.id}
                      onClick={() => {
                        markRead(notif.id);
                        if (notif.href) {
                          window.location.href = notif.href;
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors duration-150',
                        'hover:bg-secondary/40',
                        !notif.read && 'bg-primary/[0.03]'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Unread indicator */}
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          {!notif.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shadow-sm shadow-red-400/40" />
                          )}
                          {notif.read && <span className="w-1.5 h-1.5" />}
                          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', meta.bg)}>
                            <Icon size={14} className={meta.color} />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn(
                              'text-[9px] font-bold uppercase tracking-wider',
                              meta.color
                            )}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground/40 ml-auto flex-shrink-0">
                              {timeAgo(notif.timestamp)}
                            </span>
                          </div>
                          <p className={cn(
                            'text-[12px] leading-tight',
                            notif.read ? 'text-muted-foreground/60' : 'text-foreground font-medium'
                          )}>
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-snug">
                            {notif.body}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border/30 px-4 py-2.5 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/40">
                {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => {
                  setOpen(false);
                  window.location.href = '/at-risk';
                }}
                className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                View all attention items →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
