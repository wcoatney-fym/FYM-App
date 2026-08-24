/**
 * RosterReconcilePanel — Admin panel for roster reconciliation
 *
 * Shows:
 *   - Latest reconcile run results per carrier
 *   - Issue summary with drill-down
 *   - Manual run trigger (dry-run or apply)
 *   - Run history
 */

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  UserX,
  UserCheck,
  HelpCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ── Types ──────────────────────────────────────────────────────────── */

interface ReconcileRun {
  id: string;
  carrier: string;
  mode: string;
  agency_id: string | null;
  roster_total: number;
  roster_active: number;
  roster_terminated: number;
  writing_numbers_checked: number;
  prod_agents_found: number;
  issues_found: number;
  active_prod_terminated: number;
  active_prod_missing: number;
  terminated_prod_active: number;
  applied: number | null;
  lifecycle_cascades: number | null;
  reinstatement_flags: number | null;
  issues: ReconcileIssue[];
  errors: string[] | null;
  elapsed_ms: number | null;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
}

interface ReconcileIssue {
  roster_id: string;
  agent_name: string;
  agency_id: string;
  writing_number: string;
  carrier: string;
  issue_type: string;
  detail: string;
  prod_status: string | null;
  prod_term_date: string | null;
  action_taken: string | null;
  lifecycle_action: string | null;
}

const CARRIERS = ['unl', 'gtl', 'ahl', 'manhattan'] as const;

const CARRIER_LABELS: Record<string, string> = {
  unl: 'UNL',
  gtl: 'GTL',
  ahl: 'AHL',
  manhattan: 'Manhattan',
};

const ISSUE_TYPE_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  roster_active_prod_terminated: {
    label: 'Active → Terminated',
    icon: UserX,
    color: 'text-red-400',
  },
  roster_active_prod_missing: {
    label: 'Active → Not Found',
    icon: HelpCircle,
    color: 'text-amber-400',
  },
  roster_terminated_prod_active: {
    label: 'Terminated → Active (Reinstatement?)',
    icon: UserCheck,
    color: 'text-blue-400',
  },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' CT';
}

function formatElapsed(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function RosterReconcilePanel() {
  const [runs, setRuns] = useState<ReconcileRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null); // carrier being run
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<string>('all');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const loadRuns = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from('roster_reconcile_runs' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (selectedCarrier !== 'all') {
        query = query.eq('carrier', selectedCarrier);
      }

      const { data } = await query;
      setRuns((data as ReconcileRun[] | null) || []);
    } catch {
      // Silently fail — table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [selectedCarrier]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const triggerRun = async (carrier: string, mode: 'dry-run' | 'apply') => {
    if (!supabaseUrl || running) return;

    const confirmed =
      mode === 'apply'
        ? window.confirm(
            `Apply ${CARRIER_LABELS[carrier]} reconciliation?\n\nThis will terminate roster entries where agents are confirmed terminated in the production database, and cascade into agent lifecycle.\n\nAre you sure?`
          )
        : true;

    if (!confirmed) return;

    setRunning(carrier);
    try {
      const url = new URL(`${supabaseUrl}/functions/v1/roster-reconcile`);
      url.searchParams.set('mode', mode);
      url.searchParams.set('carrier', carrier);
      url.searchParams.set('persist', 'true');
      url.searchParams.set('triggered_by', 'manual');

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        alert(`Reconcile failed (${res.status}): ${text}`);
      }

      // Reload runs after a brief delay to allow the insert to land
      await new Promise((r) => setTimeout(r, 500));
      await loadRuns();
    } catch (err) {
      alert(`Network error: ${(err as Error).message}`);
    } finally {
      setRunning(null);
    }
  };

  // Get latest run per carrier for the summary cards
  const latestByCarrier = CARRIERS.reduce(
    (acc, c) => {
      const latest = runs.find((r) => r.carrier === c);
      if (latest) acc[c] = latest;
      return acc;
    },
    {} as Record<string, ReconcileRun>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Roster Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compare agency rosters against carrier production data to detect terminations, missing agents, and reinstatements.
          </p>
        </div>
        <button
          onClick={loadRuns}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 text-sm text-muted-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Carrier Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CARRIERS.map((carrier) => {
          const run = latestByCarrier[carrier];
          const isRunning = running === carrier;

          return (
            <div
              key={carrier}
              className="rounded-lg border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {CARRIER_LABELS[carrier]}
                </span>
                {run ? (
                  run.issues_found > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      {run.issues_found} issue{run.issues_found !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Clean
                    </span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground">No runs</span>
                )}
              </div>

              {run ? (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Roster agents</span>
                    <span className="font-mono text-foreground">{run.roster_active}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>WNs checked</span>
                    <span className="font-mono text-foreground">{run.writing_numbers_checked}</span>
                  </div>
                  {run.active_prod_terminated > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>Active → Terminated</span>
                      <span className="font-mono">{run.active_prod_terminated}</span>
                    </div>
                  )}
                  {run.active_prod_missing > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Not in prod DB</span>
                      <span className="font-mono">{run.active_prod_missing}</span>
                    </div>
                  )}
                  {run.terminated_prod_active > 0 && (
                    <div className="flex justify-between text-blue-400">
                      <span>Possible reinstatement</span>
                      <span className="font-mono">{run.terminated_prod_active}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 pt-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(run.started_at)} · {formatElapsed(run.elapsed_ms)}
                    {run.mode === 'apply' && (
                      <span className="ml-1 px-1 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-bold">
                        APPLIED
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">
                  No reconciliation data yet
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => triggerRun(carrier, 'dry-run')}
                  disabled={isRunning}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-border hover:bg-muted/50 text-[11px] font-medium text-muted-foreground transition-colors disabled:opacity-50"
                >
                  {isRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Dry Run
                </button>
                <button
                  onClick={() => triggerRun(carrier, 'apply')}
                  disabled={isRunning}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-red-500/30 hover:bg-red-500/10 text-[11px] font-medium text-red-400 transition-colors disabled:opacity-50"
                >
                  {isRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  Apply
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Run History ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Run History</h3>
          <select
            value={selectedCarrier}
            onChange={(e) => setSelectedCarrier(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground"
          >
            <option value="all">All Carriers</option>
            {CARRIERS.map((c) => (
              <option key={c} value={c}>
                {CARRIER_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No reconciliation runs yet. Click "Dry Run" on a carrier to start.
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const isExpanded = expandedRun === run.id;
              const issues = run.issues || [];

              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary">
                        {CARRIER_LABELS[run.carrier] || run.carrier}
                      </span>
                      <span className="text-sm text-foreground">
                        {formatTime(run.started_at)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          run.mode === 'apply'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {run.mode.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {run.triggered_by}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {run.issues_found > 0 ? (
                        <span className="text-sm font-mono text-amber-400">
                          {run.issues_found} issue{run.issues_found !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-sm text-emerald-400">Clean</span>
                      )}
                      {run.applied != null && run.applied > 0 && (
                        <span className="text-xs text-primary font-medium">
                          {run.applied} applied
                        </span>
                      )}
                      {run.lifecycle_cascades != null && run.lifecycle_cascades > 0 && (
                        <span className="text-xs text-red-400 font-medium">
                          {run.lifecycle_cascades} terminated
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      {/* Stats row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Roster total</span>
                          <p className="font-mono text-foreground">{run.roster_total}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Active / Terminated</span>
                          <p className="font-mono text-foreground">
                            {run.roster_active} / {run.roster_terminated}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">WNs checked</span>
                          <p className="font-mono text-foreground">{run.writing_numbers_checked}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Found in prod</span>
                          <p className="font-mono text-foreground">{run.prod_agents_found}</p>
                        </div>
                      </div>

                      {/* Apply-mode stats */}
                      {run.mode === 'apply' && (
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground">Roster changes</span>
                            <p className="font-mono text-foreground">{run.applied ?? 0}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Lifecycle cascades</span>
                            <p className="font-mono text-red-400">
                              {run.lifecycle_cascades ?? 0}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Reinstatement flags</span>
                            <p className="font-mono text-blue-400">
                              {run.reinstatement_flags ?? 0}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Issues list */}
                      {issues.length > 0 && (
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Issues ({issues.length})
                          </h4>
                          <div className="max-h-64 overflow-y-auto space-y-1">
                            {issues.map((issue, idx) => {
                              const cfg = ISSUE_TYPE_CONFIG[issue.issue_type] || {
                                label: issue.issue_type,
                                icon: AlertTriangle,
                                color: 'text-muted-foreground',
                              };
                              const Icon = cfg.icon;

                              return (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 px-3 py-2 rounded-md border border-border/50 bg-muted/20 text-xs"
                                >
                                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        {issue.agent_name}
                                      </span>
                                      <span className="font-mono text-muted-foreground text-[10px]">
                                        {issue.writing_number}
                                      </span>
                                      <span className={`text-[10px] ${cfg.color}`}>
                                        {cfg.label}
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground mt-0.5 leading-relaxed">
                                      {issue.detail}
                                    </p>
                                    {(issue.action_taken || issue.lifecycle_action) && (
                                      <div className="flex gap-3 mt-1">
                                        {issue.action_taken && (
                                          <span className="text-[10px] text-primary">
                                            Roster: {issue.action_taken}
                                          </span>
                                        )}
                                        {issue.lifecycle_action && (
                                          <span className="text-[10px] text-red-400">
                                            Lifecycle: {issue.lifecycle_action}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Errors */}
                      {run.errors && run.errors.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                            Errors ({run.errors.length})
                          </h4>
                          {run.errors.map((err, idx) => (
                            <p key={idx} className="text-xs text-red-400/80 font-mono">
                              {err}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Elapsed */}
                      <p className="text-[10px] text-muted-foreground/50">
                        Elapsed: {formatElapsed(run.elapsed_ms)} · Run ID: {run.id.slice(0, 8)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
