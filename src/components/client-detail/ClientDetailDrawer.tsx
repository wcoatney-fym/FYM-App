/**
 * ClientDetailDrawer — Universal slide-out policy detail panel.
 *
 * Opens from any policy row (Book of Business, PoliciesTab, NeedsAttention,
 * Kanban). Provides the full save-call surface: policy snapshot, client info,
 * call prep strip, timeline (stage history + notes), and quick actions
 * (add note, change stage).
 *
 * Data sources:
 * - Policy data: passed in as props (from edge function response)
 * - Stage history: atrisk_stage_history (loaded on mount if task exists)
 * - Notes: manager_notes via notes-api (loaded on mount)
 * - Stage transitions: atrisk_tasks via Supabase client
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Clock, DollarSign, User, Building2, FileText,
  Calendar, ArrowRight, MessageSquare, Loader2, History,
  Phone, Send, AlertTriangle, CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { fetchNotesForPolicy, createNote, formatNoteTime } from '@/lib/notes-api';
import type { ManagerNote } from '@/lib/notes-api';
import { urgencyLabel } from '@/lib/risk-utils';
import { fmt$, fmtDate } from '@/lib/formatUtils';
import { fetchBookOfBusiness } from '@/lib/prod-api';
import type { PolicyRow as FullPolicyRow } from '@/lib/prod-api';

// ── Types ──────────────────────────────────────────────────────────────────

/** Canonical policy shape accepted by the drawer.
 *  Intentionally loose — callers map their local types into this. */
export interface DrawerPolicy {
  policy_number: string;
  client_name: string | null;
  product_type: string;
  status: string;
  plan_premium?: number;       // monthly
  monthly_premium?: number;    // alias used by BoB local type
  annual_premium: number;
  billing_mode?: string | number | null;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  term_date?: string | null;
  draft_count: number;
  is_at_risk: boolean;
  flag_type: string | null;
  days_since_paid?: number | null;
  // Agent / agency
  agent_name?: string | null;
  agent_writing_number?: string | null;
  writing_number?: string | null;
  agency_id?: string;
  agency_name?: string | null;
  // At-risk pipeline (optional — only present from Kanban / at-risk views)
  task_id?: string | null;
  task_status?: string | null;
}

type Stage =
  | 'new'
  | 'responded'
  | 'manager_outreach'
  | 'agent_outreach'
  | 'code_red'
  | 'agent_saved_pending'
  | 'saved'
  | 'reactivated'
  | 'lost';

interface StageHistoryEntry {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

interface ClientDetailDrawerProps {
  policy: DrawerPolicy;
  onClose: () => void;
  /** Optional callback when a stage transition occurs (for Kanban refresh). */
  onStageChange?: (policyNumber: string, newStage: string) => void;
  /** Whether quick actions (stage change, add note) are enabled. Default true for admin/manager. */
  actionsEnabled?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  responded: 'Responded',
  manager_outreach: 'Manager Outreach',
  agent_outreach: 'Agent Outreach',
  code_red: 'Code Red',
  agent_saved_pending: 'Pending Save',
  saved: 'Saved',
  lost: 'Lost',
};

const STAGE_COLORS: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  new:                 { dot: 'bg-slate-400',   bg: 'bg-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-500/30' },
  responded:           { dot: 'bg-sky-400',     bg: 'bg-sky-500/10',     text: 'text-sky-300',     border: 'border-sky-500/30' },
  manager_outreach:    { dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  agent_outreach:      { dot: 'bg-violet-400',  bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/30' },
  code_red:            { dot: 'bg-red-500',     bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/30' },
  agent_saved_pending: { dot: 'bg-teal-400',    bg: 'bg-teal-500/10',    text: 'text-teal-300',    border: 'border-teal-500/30' },
  saved:               { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  lost:                { dot: 'bg-rose-400',    bg: 'bg-rose-500/10',    text: 'text-rose-300',    border: 'border-rose-500/30' },
};

const DEFAULT_COLORS = { dot: 'bg-gray-400', bg: 'bg-gray-500/10', text: 'text-gray-300', border: 'border-gray-500/30' };

const TRANSITION_TARGETS: Stage[] = ['responded', 'manager_outreach', 'agent_outreach', 'code_red', 'saved', 'reactivated', 'lost'];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}

function computeDaysSincePaid(paidTo: string | null): number | null {
  if (!paidTo) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(paidTo).getTime()) / 86400000));
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    terminated: 'bg-red-500/10 text-red-400 border-red-500/20',
    suspended: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };
  return map[status] || 'bg-secondary text-muted-foreground border-border';
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClientDetailDrawer({
  policy,
  onClose,
  onStageChange,
  actionsEnabled = true,
}: ClientDetailDrawerProps) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [notes, setNotes] = useState<ManagerNote[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [transitioning, setTransitioning] = useState<Stage | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [visible, setVisible] = useState(false);
  const [enrichedData, setEnrichedData] = useState<FullPolicyRow | null>(null);
  const [enriching, setEnriching] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Merge enriched data over passed-in props (enriched wins where non-null)
  const e = enrichedData;
  const clientName = e?.client_name ?? policy.client_name;
  const agentName = e?.agent_name ?? policy.agent_name;
  const agencyName = e?.agency_name ?? policy.agency_name;
  const agentWn = e?.agent_writing_number ?? policy.agent_writing_number ?? policy.writing_number ?? null;
  const termDate = e?.term_date ?? policy.term_date;
  const billingMode = e?.billing_mode ?? policy.billing_mode;
  const status = e?.status ?? policy.status;
  const paidToDate = e?.paid_to_date ?? policy.paid_to_date;
  const effectiveDate = e?.policy_effective_date ?? policy.policy_effective_date;
  const draftCount = e?.draft_count ?? policy.draft_count;
  const productType = e?.product_type ?? policy.product_type;
  const flagType = e?.flag_type ?? policy.flag_type;
  const isAtRisk = e?.is_at_risk ?? policy.is_at_risk;

  // Derived values
  const monthlyPremium = e?.plan_premium ?? policy.plan_premium ?? policy.monthly_premium ?? (policy.annual_premium / 12);
  const annualPremium = Number(e?.annual_premium ?? policy.annual_premium);
  const daysSincePaid = policy.days_since_paid ?? computeDaysSincePaid(paidToDate);
  const currentStage = (policy.task_status as Stage) || null;
  const stageColor = currentStage ? (STAGE_COLORS[currentStage] || DEFAULT_COLORS) : null;
  const urgency = isAtRisk ? urgencyLabel(flagType, daysSincePaid) : null;
  const daysToTerminate = daysSincePaid !== null ? Math.max(0, 45 - daysSincePaid) : null;

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Close with animation
  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Enrich policy data from edge function on mount
  useEffect(() => {
    let cancelled = false;
    setEnriching(true);
    fetchBookOfBusiness({ search: policy.policy_number, page_size: 1 })
      .then(res => {
        if (cancelled) return;
        const match = res.data.find(p => p.policy_number === policy.policy_number);
        if (match) setEnrichedData(match);
      })
      .catch(err => console.warn('[ClientDetailDrawer] enrich fetch failed, using passed props:', err))
      .finally(() => { if (!cancelled) setEnriching(false); });
    return () => { cancelled = true; };
  }, [policy.policy_number]);

  // Load timeline data (stage history + notes)
  useEffect(() => {
    setLoadingTimeline(true);

    const promises: Promise<void>[] = [];

    // Stage history (only if we have a task)
    if (policy.task_id && supabase) {
      promises.push(
        (supabase as any)
          .from('atrisk_stage_history')
          .select('*')
          .eq('task_id', policy.task_id)
          .order('changed_at', { ascending: false })
          .then((res: any) => {
            if (res.data) setHistory(res.data as StageHistoryEntry[]);
          })
      );
    }

    // Notes (always load for policy)
    promises.push(
      fetchNotesForPolicy(policy.policy_number).then(setNotes)
    );

    Promise.all(promises)
      .catch(console.error)
      .finally(() => setLoadingTimeline(false));
  }, [policy.policy_number, policy.task_id]);

  // Stage transition handler — updates task + writes stage history
  const handleTransition = async (target: Stage) => {
    if (!policy.task_id || !supabase || target === currentStage) return;
    setTransitioning(target);
    try {
      // 1. Update the task stage
      await supabase
        .from('atrisk_tasks')
        .update({ stage: target, stage_changed_at: new Date().toISOString() })
        .eq('id', policy.task_id);

      // 2. Write stage history entry
      const { data: userData } = await supabase.auth.getUser();
      await (supabase as any)
        .from('atrisk_stage_history')
        .insert({
          task_id: policy.task_id,
          from_stage: currentStage,
          to_stage: target,
          changed_by: userData?.user?.id ?? null,
          source: 'app',
        });

      // 3. Refresh timeline to show the new entry
      const { data: freshHistory } = await (supabase as any)
        .from('atrisk_stage_history')
        .select('*')
        .eq('task_id', policy.task_id)
        .order('changed_at', { ascending: false });
      if (freshHistory) setHistory(freshHistory as StageHistoryEntry[]);

      onStageChange?.(policy.policy_number, target);
    } catch (err) {
      console.error('[ClientDetailDrawer] stage transition error:', err);
    } finally {
      setTransitioning(null);
    }
  };

  // Add note handler
  const handleAddNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    setSubmittingNote(true);
    try {
      const note = await createNote({
        policy_number: policy.policy_number,
        agent_writing_number: agentWn ?? undefined,
        agent_name: policy.agent_name ?? undefined,
        body,
      });
      if (note) {
        setNotes(prev => [note, ...prev]);
        setNoteText('');
      }
    } catch (err) {
      console.error('[ClientDetailDrawer] add note error:', err);
    } finally {
      setSubmittingNote(false);
    }
  };

  // Merge timeline: interleave stage history + notes, newest first
  const timeline = [...history.map(h => ({ ...h, _type: 'stage' as const, _time: h.changed_at })),
                     ...notes.map(n => ({ ...n, _type: 'note' as const, _time: n.created_at }))]
    .sort((a, b) => new Date(b._time).getTime() - new Date(a._time).getTime());

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Call Prep Strip ─────────────────────────────────────────── */}
        <div className={`px-4 py-2.5 border-b flex items-center gap-3 text-sm shrink-0 ${
          policy.is_at_risk
            ? urgency?.severity === 'danger'
              ? 'bg-red-500/10 border-red-500/20'
              : 'bg-amber-500/10 border-amber-500/20'
            : 'bg-secondary/50 border-border'
        }`}>
          <Phone size={14} className="text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground truncate">
            {clientName || 'Unknown Client'}
          </span>
          <span className="text-muted-foreground">|</span>
          <Badge className={`text-[10px] shrink-0 ${
            productType === 'HHC'
              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
              : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
          }`}>
            {productType}
          </Badge>
          <span className="text-muted-foreground">|</span>
          <span className="font-data text-foreground/80 shrink-0">${Number(monthlyPremium).toFixed(0)}/mo</span>
          {daysSincePaid !== null && daysSincePaid > 0 && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className={`font-data font-bold shrink-0 ${
                daysSincePaid >= 30 ? 'text-red-400' : daysSincePaid >= 14 ? 'text-amber-400' : 'text-muted-foreground'
              }`}>
                {daysSincePaid}d idle
              </span>
            </>
          )}
          {agentName && (
            <>
              <span className="text-muted-foreground hidden sm:inline">|</span>
              <span className="text-muted-foreground text-xs hidden sm:inline truncate">
                Agent: {agentName}
              </span>
            </>
          )}
          <button
            onClick={handleClose}
            className="ml-auto text-muted-foreground hover:text-foreground p-1 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Header */}
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {clientName || 'Unknown Client'}
                {enriching && <span className="text-xs text-muted-foreground ml-2 font-normal">(enriching…)</span>}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground font-data">
                  #{policy.policy_number}
                </span>
                <Badge className={`text-[10px] border ${statusBadgeClass(status)}`}>
                  {status}
                </Badge>
                {isAtRisk && urgency && (
                  <Badge className={`text-[10px] border font-bold ${
                    urgency.severity === 'danger'
                      ? 'bg-red-500/15 text-red-300 border-red-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}>
                    {urgency.label}
                  </Badge>
                )}
                {currentStage && stageColor && (
                  <Badge className={`text-[10px] border ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                    {STAGE_LABELS[currentStage] || currentStage}
                  </Badge>
                )}
              </div>
              {daysToTerminate !== null && isAtRisk && (
                <p className={`text-xs mt-1 font-bold ${
                  daysToTerminate <= 7 ? 'text-red-400' : daysToTerminate <= 15 ? 'text-amber-400' : 'text-muted-foreground'
                }`}>
                  {daysToTerminate > 0 ? `${daysToTerminate} days until grace expiration` : 'Grace period expired'}
                </p>
              )}
            </div>

            {/* ── Policy Snapshot ─────────────────────────────────────── */}
            <section>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Policy Details
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <InfoCell icon={<FileText size={13} />} label="Product" value={productType} />
                <InfoCell icon={<DollarSign size={13} />} label="Monthly" value={`$${Number(monthlyPremium).toFixed(2)}`} />
                <InfoCell icon={<DollarSign size={13} />} label="Annual" value={fmt$(annualPremium)} />
                <InfoCell icon={<Calendar size={13} />} label="Effective" value={fmtDate(effectiveDate)} />
                <InfoCell
                  icon={<Clock size={13} />}
                  label="Paid To"
                  value={fmtDate(paidToDate)}
                  valueClass={
                    daysSincePaid !== null && daysSincePaid > 45 ? 'text-red-400 font-bold' :
                    daysSincePaid !== null && daysSincePaid > 30 ? 'text-amber-400 font-bold' : ''
                  }
                />
                <InfoCell icon={<FileText size={13} />} label="Drafts" value={String(draftCount)} valueClass={
                  draftCount >= 3 ? 'text-emerald-400' : draftCount === 0 ? 'text-red-400' : ''
                } />
                {billingMode && (
                  <InfoCell icon={<FileText size={13} />} label="Billing Mode" value={String(billingMode)} />
                )}
                {termDate && (
                  <InfoCell icon={<Calendar size={13} />} label="Term Date" value={fmtDate(termDate)} valueClass="text-red-400" />
                )}
                {daysSincePaid !== null && (
                  <InfoCell
                    icon={<AlertTriangle size={13} />}
                    label="Days Since Draft"
                    value={`${daysSincePaid}d`}
                    valueClass={
                      daysSincePaid >= 30 ? 'text-red-400 font-bold' :
                      daysSincePaid >= 14 ? 'text-amber-400 font-bold' : ''
                    }
                  />
                )}
              </div>
            </section>

            {/* ── Agent & Agency ──────────────────────────────────────── */}
            <section>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Agent & Agency
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <InfoCell icon={<User size={13} />} label="Agent" value={agentName || 'Unassigned'} />
                {agentWn && (
                  <InfoCell icon={<FileText size={13} />} label="Writing #" value={`#${agentWn}`} />
                )}
                <InfoCell icon={<Building2 size={13} />} label="Agency" value={agencyName || policy.agency_id || '—'} />
              </div>
            </section>

            {/* ── Quick Actions (stage transition) ───────────────────── */}
            {actionsEnabled && isAtRisk && policy.task_id && (
              <section>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Move Stage
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {TRANSITION_TARGETS.map(target => {
                    const isCurrent = target === currentStage;
                    return (
                      <Button
                        key={target}
                        size="sm"
                        variant={isCurrent ? 'default' : 'outline'}
                        disabled={isCurrent || transitioning !== null}
                        onClick={() => handleTransition(target)}
                        className={`h-7 px-2.5 text-[11px] gap-1 ${
                          isCurrent ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {transitioning === target ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <ArrowRight size={11} />
                        )}
                        {STAGE_LABELS[target]}
                      </Button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Add Note ────────────────────────────────────────────── */}
            {actionsEnabled && (
              <section>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Add Note
                </h4>
                <div className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Type a note about this policy..."
                    className="flex-1 min-h-[60px] max-h-[120px] rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAddNote();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!noteText.trim() || submittingNote}
                    onClick={handleAddNote}
                    className="h-auto self-end"
                  >
                    {submittingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">⌘/Ctrl + Enter to submit</p>
              </section>
            )}

            {/* ── Timeline (interleaved stage history + notes) ────────── */}
            <section>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <History size={12} />
                Timeline
              </h4>

              {loadingTimeline ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading timeline…</span>
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((entry, i) => {
                    if (entry._type === 'stage') {
                      const e = entry as StageHistoryEntry & { _type: 'stage'; _time: string };
                      const toColor = STAGE_COLORS[e.to_stage] || DEFAULT_COLORS;
                      const fromColor = e.from_stage ? (STAGE_COLORS[e.from_stage] || DEFAULT_COLORS) : null;

                      return (
                        <div key={`s-${e.id}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${toColor.dot}`} />
                            {i < timeline.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                          </div>
                          <div className="pb-3 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <ChevronRight size={10} className="text-muted-foreground" />
                              {fromColor && (
                                <>
                                  <span className={`text-[11px] ${fromColor.text}`}>
                                    {STAGE_LABELS[e.from_stage!] || e.from_stage}
                                  </span>
                                  <ArrowRight size={10} className="text-muted-foreground" />
                                </>
                              )}
                              <span className={`text-[11px] font-semibold ${toColor.text}`}>
                                {STAGE_LABELS[e.to_stage] || e.to_stage}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDateTime(e.changed_at)}
                            </p>
                            {e.note && (
                              <p className="text-xs text-muted-foreground/80 mt-1 bg-secondary/30 rounded px-2 py-1">
                                {e.note}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    } else {
                      const n = entry as ManagerNote & { _type: 'note'; _time: string };
                      return (
                        <div key={`n-${n.id}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full mt-1.5 bg-primary" />
                            {i < timeline.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                          </div>
                          <div className="pb-3 min-w-0 flex-1">
                            <div className="bg-secondary/20 border border-border rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare size={11} className="text-primary shrink-0" />
                                <span className="text-[11px] font-semibold text-foreground">
                                  {n.author_name || 'Manager'}
                                </span>
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                  {formatNoteTime(n.created_at)}
                                </span>
                              </div>
                              <p className="text-xs text-foreground/90 whitespace-pre-wrap">{n.body}</p>
                              {n.acknowledged_at && (
                                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-emerald-400">
                                  <CheckCircle2 size={10} /> Acknowledged
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

// ── InfoCell helper ────────────────────────────────────────────────────────
function InfoCell({
  icon,
  label,
  value,
  valueClass = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className={`text-foreground font-medium truncate ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
