import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingDown, TrendingUp, AlertTriangle, Bot, Search } from 'lucide-react';
import { useAgencyHealth } from '@/lib/command-center/use-agency-health';
import { HI_PCT_THRESHOLD, type AgencyHealth } from '@/lib/command-center/agency-health';
import { cn } from '@/lib/utils';

/** Row stagger animation is skipped when the visible list exceeds this count. */
const STAGGER_CAP = 50;

function TrajectoryBadge({ a }: { a: AgencyHealth }) {
  const map = {
    diversifying: { label: 'Diversifying', cls: 'text-emerald-400 bg-emerald-400/10', Icon: TrendingUp },
    'still-hi-heavy': { label: 'Still HI-heavy', cls: 'text-amber-400 bg-amber-400/10', Icon: TrendingDown },
    slowing: { label: 'Slowing', cls: 'text-sky-400 bg-sky-400/10', Icon: TrendingDown },
    'no-recent': { label: 'No recent apps', cls: 'text-muted-foreground bg-secondary/40', Icon: AlertTriangle },
  } as const;
  const { label, cls, Icon } = map[a.trajectory];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', cls)}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

export function CcAgencyHealthTab() {
  const { data, loading, error, configured } = useAgencyHealth();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter((a) => a.agency.toLowerCase().includes(q));
  }, [data, search]);

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Target className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Tyler Deployment Board</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Live tracker not connected. Set <code className="text-primary">VITE_SUPABASE_URL_ACTIVITY_TRACKER</code> and{' '}
          <code className="text-primary">VITE_SUPABASE_ANON_KEY_ACTIVITY_TRACKER</code> (read-only) to load agency health.
        </p>
      </div>
    );
  }

  const targets = filtered.filter((a) => a.tylerTarget);
  const skipStagger = filtered.length > STAGGER_CAP;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />Tyler Deployment Board
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trailing-30-day product mix &amp; annual premium vs all-time. HHC AP runs ~2x HI &mdash; low AP + HI-heavy = prime training target. Agencies already diversifying are self-correcting (don&apos;t deploy).
        </p>
      </div>

      {loading && (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">
          <Bot className="w-5 h-5 text-primary mx-auto mb-2 animate-pulse" />Crunching the full policy book&hellip;
        </div>
      )}

      {error && (
        <div className="glass rounded-xl p-4 text-sm text-red-400 border border-red-400/20">Failed to load: {error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Agencies tracked" value={filtered.length} />
            <StatCard label="Tyler targets" value={targets.length} accent />
            <StatCard label="Top opportunity" value={targets[0]?.agency ?? '—'} sub={targets[0] ? `${targets[0].appsRecent} recent apps · ${targets[0].hiPctRecent}% HI` : undefined} />
          </div>

          {/* Search bar */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agencies…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/40 border border-border/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/50">
                    <th className="px-4 py-3 font-medium">Agency</th>
                    <th className="px-4 py-3 font-medium text-right">Apps 30d</th>
                    <th className="px-4 py-3 font-medium text-right">HI% 30d</th>
                    <th className="px-4 py-3 font-medium text-right">HI% all-time</th>
                    <th className="px-4 py-3 font-medium text-right">Avg AP 30d</th>
                    <th className="px-4 py-3 font-medium text-right">AP Δ</th>
                    <th className="px-4 py-3 font-medium">Trajectory</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => (
                    <motion.tr key={a.agency} initial={{ opacity: skipStagger ? 1 : 0 }} animate={{ opacity: 1 }} transition={skipStagger ? { duration: 0 } : { delay: Math.min(i * 0.015, 0.4) }} className={cn('border-b border-border/30 hover:bg-secondary/30', a.tylerTarget && 'bg-amber-400/[0.04]')}>
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        {a.tylerTarget && <Target className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}{a.agency}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.appsRecent}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums', a.hiPctRecent >= HI_PCT_THRESHOLD && 'text-amber-400')}>{a.appsRecent ? `${a.hiPctRecent}%` : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{a.hiPctAllTime}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.avgApRecent ? `$${a.avgApRecent}` : '—'}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums', a.apLiftPct === null ? 'text-muted-foreground' : a.apLiftPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {a.apLiftPct === null ? '—' : `${a.apLiftPct >= 0 ? '+' : ''}${a.apLiftPct}%`}
                      </td>
                      <td className="px-4 py-3"><TrajectoryBadge a={a} /></td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={cn('glass rounded-xl p-5', accent && 'border border-amber-400/20')}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold mt-1 truncate', accent && 'text-amber-400')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
