/**
 * AtRiskDetailPanel — Rich detail view for an at-risk policy.
 *
 * Used in the admin insight view (Quality → At-Risk) when a client card is clicked.
 * Shows client info, agent info, current stage, stage transition history,
 * and notes/communications between manager and agent.
 *
 * Read-only for admins. No stage transitions.
 */
import { useState, useEffect } from 'react';
import {
  X, Clock, DollarSign, User, Building2, FileText,
  Calendar, ArrowRight, MessageSquare, Loader2, History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────
interface AtRiskPolicy {
  policy_number: string;
  client_name: string | null;
  agency_id: string;
  agency_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  writing_number: string | null;
  product_type: string;
  plan_premium: number;
  flag_type: string;
  paid_to_date: string;
  policy_effective_date: string;
  draft_count: number;
  is_at_risk: boolean;
  days_since_draft: number;
  task_id: string | null;
  task_status: string | null;
  task_assigned_to: string | null;
  task_due_date: string | null;
  task_created_at: string | null;
}

interface StageHistoryEntry {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

interface TaskNote {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New / Untouched',
  responded: 'Responded',
  manager_outreach: 'Manager Outreach',
  agent_outreach: 'Agent Outreach',
  code_red: 'Code Red',
  agent_saved_pending: 'Pending Save',
  saved: 'Saved',
  lost: 'Lost',
  assigned: 'Assigned',
  contacted: 'Contacted',
};

const STAGE_COLORS: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  new:                { dot: 'bg-slate-400',   bg: 'bg-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-500/30' },
  responded:          { dot: 'bg-sky-400',     bg: 'bg-sky-500/10',     text: 'text-sky-300',     border: 'border-sky-500/30' },
  manager_outreach:   { dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  agent_outreach:     { dot: 'bg-violet-400',  bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/30' },
  code_red:           { dot: 'bg-red-500',     bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/30' },
  agent_saved_pending: { dot: 'bg-teal-400',    bg: 'bg-teal-500/10',    text: 'text-teal-300',    border: 'border-teal-500/30' },
  saved:              { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  lost:               { dot: 'bg-rose-400',    bg: 'bg-rose-500/10',    text: 'text-rose-300',    border: 'border-rose-500/30' },
  assigned:           { dot: 'bg-blue-400',    bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30' },
  contacted:          { dot: 'bg-indigo-400',  bg: 'bg-indigo-500/10',  text: 'text-indigo-300',  border: 'border-indigo-500/30' },
};

const DEFAULT_COLORS = { dot: 'bg-gray-400', bg: 'bg-gray-500/10', text: 'text-gray-300', border: 'border-gray-500/30' };

function urgencyLevel(days: number): 'code_red' | 'heating_up' | 'watch' {
  if (days >= 30) return 'code_red';
  if (days >= 14) return 'heating_up';
  return 'watch';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}

// ── Component ──────────────────────────────────────────────────────────────
interface AtRiskDetailPanelProps {
  policy: AtRiskPolicy;
  onClose: () => void;
}

export function AtRiskDetailPanel({ policy, onClose }: AtRiskDetailPanelProps) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const currentStage = (policy.task_status || 'new') as string;
  const stageColor = STAGE_COLORS[currentStage] || DEFAULT_COLORS;
  const daysLapsed = policy.days_since_draft;
  const dtt = Math.max(0, 45 - daysLapsed);
  const level = urgencyLevel(daysLapsed);
  const isCodeRed = level === 'code_red';
  const isHeating = level === 'heating_up';
  const annualPremium = Number(policy.plan_premium) * 12;

  // Fetch stage history + notes when task_id is available
  useEffect(() => {
    if (!policy.task_id || !supabase) return;
    setLoadingHistory(true);

    Promise.all([
      (supabase as any)
        .from('atrisk_stage_history')
        .select('*')
        .eq('task_id', policy.task_id)
        .order('changed_at', { ascending: false }),
      supabase
        .from('atrisk_notes')
        .select('*')
        .eq('task_id', policy.task_id)
        .order('created_at', { ascending: false }),
    ]).then(([histRes, noteRes]) => {
      if (histRes.data) setHistory(histRes.data as unknown as StageHistoryEntry[]);
      if (noteRes.data) setNotes(noteRes.data as TaskNote[]);
      setLoadingHistory(false);
    }).catch(() => setLoadingHistory(false));
  }, [policy.task_id]);

  return (
    <div className="p-5 rounded-lg bg-card border border-border space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-foreground">
            {policy.client_name || 'Unknown Client'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Policy #{policy.policy_number}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Urgency badge */}
          {isCodeRed && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
              CODE RED
            </span>
          )}
          {isHeating && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              HEATING UP
            </span>
          )}
          <span className={`text-sm font-bold ${
            isCodeRed ? 'text-red-400' : isHeating ? 'text-amber-400' : 'text-muted-foreground'
          }`}>
            {dtt > 0 ? `${dtt}d left` : 'Grace expired'}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 ml-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Client & Policy Info ────────────────────────────────────────── */}
      <div>
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Policy Details
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
          <InfoCell icon={<FileText size={13} />} label="Product" value={policy.product_type} />
          <InfoCell icon={<DollarSign size={13} />} label="Annual Premium" value={`$${annualPremium.toLocaleString()}`} />
          <InfoCell
            icon={<Clock size={13} />}
            label="Days Since Draft"
            value={`${daysLapsed}d`}
            valueClass={isCodeRed ? 'text-red-400 font-bold' : isHeating ? 'text-amber-400 font-bold' : ''}
          />
          <InfoCell icon={<Calendar size={13} />} label="Paid To Date" value={formatDate(policy.paid_to_date)} />
          <InfoCell icon={<Calendar size={13} />} label="Effective Date" value={formatDate(policy.policy_effective_date)} />
          <InfoCell icon={<FileText size={13} />} label="Draft Count" value={String(policy.draft_count)} />
        </div>
      </div>

      {/* ── Agent & Agency Info ─────────────────────────────────────────── */}
      <div>
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Agent & Agency
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <InfoCell icon={<User size={13} />} label="Agent" value={policy.agent_name || 'Unassigned'} />
          {policy.writing_number && (
            <InfoCell icon={<FileText size={13} />} label="Writing #" value={`#${policy.writing_number}`} />
          )}
          <InfoCell icon={<Building2 size={13} />} label="Agency" value={policy.agency_name || policy.agency_id} />
        </div>
      </div>

      {/* ── Current Pipeline Stage ──────────────────────────────────────── */}
      <div>
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Current Pipeline Stage
        </h4>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
          <span className={`w-2 h-2 rounded-full ${stageColor.dot}`} />
          {STAGE_LABELS[currentStage] || currentStage}
        </span>
        {policy.task_created_at && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Task created {formatDateTime(policy.task_created_at)}
          </p>
        )}
      </div>

      {/* ── Stage History Timeline ──────────────────────────────────────── */}
      <div>
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <History size={12} />
          Stage History
        </h4>
        {!policy.task_id ? (
          <p className="text-xs text-muted-foreground/50 italic">
            No task created yet — policy hasn't entered the pipeline.
          </p>
        ) : loadingHistory ? (
          <div className="flex items-center gap-2 py-3">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading history…</span>
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 italic">
            No stage transitions recorded yet.
          </p>
        ) : (
          <div className="space-y-0">
            {history.map((entry, i) => {
              const toColor = STAGE_COLORS[entry.to_stage] || DEFAULT_COLORS;
              const fromColor = entry.from_stage ? (STAGE_COLORS[entry.from_stage] || DEFAULT_COLORS) : null;

              return (
                <div key={entry.id} className="flex gap-3 group">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${toColor.dot}`} />
                    {i < history.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-3 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fromColor && (
                        <>
                          <span className={`text-[11px] font-medium ${fromColor.text}`}>
                            {STAGE_LABELS[entry.from_stage!] || entry.from_stage}
                          </span>
                          <ArrowRight size={10} className="text-muted-foreground/40" />
                        </>
                      )}
                      <span className={`text-[11px] font-semibold ${toColor.text}`}>
                        {STAGE_LABELS[entry.to_stage] || entry.to_stage}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {formatDateTime(entry.changed_at)}
                    </p>
                    {entry.note && (
                      <p className="text-xs text-muted-foreground/80 mt-1 bg-secondary/30 rounded px-2 py-1">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Notes / Communications ──────────────────────────────────────── */}
      <div>
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MessageSquare size={12} />
          Notes & Communications
        </h4>
        {!policy.task_id ? (
          <p className="text-xs text-muted-foreground/50 italic">
            No task created yet.
          </p>
        ) : loadingHistory ? (
          <div className="flex items-center gap-2 py-3">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading notes…</span>
          </div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 italic">
            No notes or communications yet.
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map(note => (
              <div key={note.id} className="bg-secondary/20 border border-border rounded-lg p-3">
                <p className="text-xs text-foreground/90 whitespace-pre-wrap">{note.body}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                  {formatDateTime(note.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper component ───────────────────────────────────────────────────────
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
