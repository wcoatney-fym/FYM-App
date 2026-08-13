import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2, Search } from 'lucide-react';
import { fetchBackfillLog, fetchStageTransitions, type BackfillLogRow, type StageTransitionRow } from '@/lib/recruiting/api';

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    completed: { bg: 'bg-emerald-400/10', text: 'text-emerald-400', icon: CheckCircle2 },
    failed: { bg: 'bg-red-400/10', text: 'text-red-400', icon: XCircle },
    running: { bg: 'bg-amber-400/10', text: 'text-amber-400', icon: Loader2 },
    pending: { bg: 'bg-sky-400/10', text: 'text-sky-400', icon: Clock },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;

  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.text}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function BackfillCard({ entry }: { entry: BackfillLogRow }) {
  const stats = entry.stats || {};
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{entry.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Type: <span className="text-foreground font-medium">{entry.backfill_type}</span></span>
        <span>Started: <span className="text-foreground">{fmtDate(entry.started_at)}</span></span>
        <span>Completed: <span className="text-foreground">{fmtDate(entry.completed_at)}</span></span>
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats).map(([key, val]) => (
            <span key={key} className="px-2.5 py-1 rounded-lg bg-secondary/50 text-xs">
              <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>{' '}
              <span className="font-medium text-foreground">{String(val)}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function TransitionRow({ t }: { t: StageTransitionRow }) {
  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

  const conditionColors: Record<string, string> = {
    tag_applied: 'text-sky-400',
    pipeline_move: 'text-purple-400',
    manual: 'text-amber-400',
    backfill: 'text-muted-foreground',
    auto_lost: 'text-red-400',
    re_entry: 'text-emerald-400',
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors text-xs">
      <span className="w-20 text-muted-foreground">{fmtDate(t.occurred_at)}</span>
      <span className="w-20 font-medium capitalize">{t.stage}</span>
      <span className={`w-24 ${conditionColors[t.condition] || 'text-muted-foreground'}`}>{t.condition.replace(/_/g, ' ')}</span>
      {t.previous_stage && (
        <span className="text-muted-foreground">from <span className="text-foreground capitalize">{t.previous_stage}</span></span>
      )}
      <span className="flex-1 truncate text-muted-foreground">{t.ghl_contact_id.slice(0, 12)}…</span>
    </div>
  );
}

export function CcBackfillTab() {
  const [backfills, setBackfills] = useState<BackfillLogRow[]>([]);
  const [transitions, setTransitions] = useState<StageTransitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [bfData, txData] = await Promise.all([fetchBackfillLog(), fetchStageTransitions(undefined, undefined, 100)]);
      if (!cancelled) {
        setBackfills(bfData);
        setTransitions(txData);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredTransitions = search
    ? transitions.filter((t) =>
        t.ghl_contact_id.toLowerCase().includes(search.toLowerCase()) ||
        t.stage.toLowerCase().includes(search.toLowerCase()) ||
        t.condition.toLowerCase().includes(search.toLowerCase())
      )
    : transitions;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">FYM APP Backfill</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-time data corrections and migration logs. Each entry is a backfill operation with title, description, and results.
          Reference these if a data issue reoccurs before app launch.
        </p>
      </div>

      {/* Backfill operations */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <h2 className="text-sm font-semibold">Backfill Operations</h2>
          <span className="text-xs text-muted-foreground">({backfills.length})</span>
        </div>

        {backfills.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No backfill operations logged yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Backfills are logged automatically when one-time data corrections run.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backfills.map((bf) => <BackfillCard key={bf.id} entry={bf} />)}
          </div>
        )}
      </motion.div>

      {/* Stage Transition Log */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-400/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-sky-400" />
            </div>
            <h2 className="text-sm font-semibold">Stage Transition Log</h2>
            <span className="text-xs text-muted-foreground">(latest {filteredTransitions.length})</span>
          </div>
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-xs text-primary hover:underline"
          >
            {showLog ? 'Hide log' : 'Show log'}
          </button>
        </div>

        {showLog && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by contact ID, stage, or condition…"
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary/30 border border-border/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {filteredTransitions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No transitions found.</p>
              ) : (
                filteredTransitions.map((t) => <TransitionRow key={t.id} t={t} />)
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
