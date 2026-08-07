import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Target, TrendingDown, TrendingUp, AlertTriangle, Bot, Search, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useAgencyHealth } from '@/lib/command-center/use-agency-health';
import { HI_PCT_THRESHOLD, type AgencyHealth } from '@/lib/command-center/agency-health';
import { cn } from '@/lib/utils';

/** Row stagger animation is skipped when the visible list exceeds this count. */
const STAGGER_CAP = 50;

/** Sortable column keys mapped to their accessor. */
type SortKey = 'agency' | 'appsRecent' | 'hiPctRecent' | 'hiPctAllTime' | 'avgApRecent' | 'apLiftPct';
type SortDir = 'asc' | 'desc';

const SORT_ACCESSORS: Record<SortKey, (a: AgencyHealth) => number | string | null> = {
  agency: (a) => a.agency.toLowerCase(),
  appsRecent: (a) => a.appsRecent,
  hiPctRecent: (a) => a.hiPctRecent,
  hiPctAllTime: (a) => a.hiPctAllTime,
  avgApRecent: (a) => a.avgApRecent,
  apLiftPct: (a) => a.apLiftPct,
};

function sortRows(rows: AgencyHealth[], key: SortKey | null, dir: SortDir): AgencyHealth[] {
  if (!key) return rows;
  const acc = SORT_ACCESSORS[key];
  return [...rows].sort((a, b) => {
    const va = acc(a);
    const vb = acc(b);
    // nulls always last
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' && typeof vb === 'string'
      ? va.localeCompare(vb)
      : (va as number) - (vb as number);
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortIcon({ columnKey, activeKey, dir }: { columnKey: SortKey; activeKey: SortKey | null; dir: SortDir }) {
  if (activeKey !== columnKey) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function SortableHeader({ label, sortKey: key, active, dir, onSort, align }: {
  label: string; sortKey: SortKey; active: SortKey | null; dir: SortDir;
  onSort: (k: SortKey) => void; align?: 'right';
}) {
  return (
    <th
      className={cn('px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground transition-colors', align === 'right' && 'text-right')}
      onClick={() => onSort(key)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        <SortIcon columnKey={key} activeKey={active} dir={dir} />
      </span>
    </th>
  );
}

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

function escCsv(v: string | number | null): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: AgencyHealth[]) {
  const headers = ['Agency', 'Apps 30d', 'HI% 30d', 'HI% All-Time', 'Avg AP 30d', 'Avg AP All-Time', 'AP Δ%', 'Trajectory', 'Tyler Target', 'Opportunity Score'];
  const csvRows = rows.map((a) => [
    escCsv(a.agency),
    a.appsRecent,
    a.appsRecent ? `${a.hiPctRecent}%` : '',
    `${a.hiPctAllTime}%`,
    a.avgApRecent || '',
    a.avgApAllTime || '',
    a.apLiftPct !== null ? `${a.apLiftPct}%` : '',
    a.trajectory,
    a.tylerTarget ? 'Yes' : 'No',
    a.opportunityScore,
  ]);
  const csv = [headers, ...csvRows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `agency_health_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CcAgencyHealthTab() {
  const { data, loading, error, configured } = useAgencyHealth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [targetsOnly, setTargetsOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      // Default: numeric cols start desc, agency starts asc
      setSortDir(key === 'agency' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const filtered = useMemo(() => {
    let rows = data;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((a) => a.agency.toLowerCase().includes(q));
    }
    if (targetsOnly) {
      rows = rows.filter((a) => a.tylerTarget);
    }
    return sortRows(rows, sortKey, sortDir);
  }, [data, search, targetsOnly, sortKey, sortDir]);

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

          {/* Toolbar: search + targets toggle */}
          <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-xs flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agencies…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/40 border border-border/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={() => setTargetsOnly((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border',
              targetsOnly
                ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                : 'bg-secondary/40 border-border/40 text-muted-foreground hover:text-foreground'
            )}
          >
            <Target className="w-3.5 h-3.5" />
            Targets only
          </button>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border bg-secondary/40 border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/50">
                    <SortableHeader label="Agency" sortKey="agency" active={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableHeader label="Apps 30d" sortKey="appsRecent" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableHeader label="HI% 30d" sortKey="hiPctRecent" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableHeader label="HI% all-time" sortKey="hiPctAllTime" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableHeader label="Avg AP 30d" sortKey="avgApRecent" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortableHeader label="AP Δ" sortKey="apLiftPct" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <th className="px-4 py-3 font-medium">Trajectory</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => (
                    <motion.tr
                      key={a.agency}
                      initial={{ opacity: skipStagger ? 1 : 0 }}
                      animate={{ opacity: 1 }}
                      transition={skipStagger ? { duration: 0 } : { delay: Math.min(i * 0.015, 0.4) }}
                      onClick={() => a.agencyId && navigate(`/agencies/${a.agencyId}`)}
                      className={cn(
                        'border-b border-border/30 hover:bg-secondary/30',
                        a.tylerTarget && 'bg-amber-400/[0.04]',
                        a.agencyId && 'cursor-pointer',
                      )}
                    >
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
